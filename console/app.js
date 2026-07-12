(function () {
  const $ = sel => document.querySelector(sel);
  const el = {
    login: $('#login'), loginForm: $('#loginForm'), email: $('#email'), password: $('#password'),
    loginErr: $('#loginErr'), app: $('#app'), orgName: $('#orgName'), logout: $('#logout'),
    cards: $('#cards'), groupSel: $('#groupSel'), policyEditor: $('#policyEditor'),
    reqList: $('#reqList'), pendingDot: $('#pendingDot'),
    enrollBox: $('#enrollBox'), deviceList: $('#deviceList'), reportList: $('#reportList')
  };

  let token = localStorage.getItem('db_token') || null;
  let groups = [];
  let categories = [];
  let pollTimer = null;

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) { logout(); throw new Error('unauthorized'); }
    return res.json();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ago(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
  }

  /* ---------- auth ---------- */
  el.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    el.loginErr.textContent = '';
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: el.email.value, password: el.password.value })
    }).then(r => r.json());
    if (!res.ok) { el.loginErr.textContent = res.error || 'Sign in failed'; return; }
    token = res.token;
    localStorage.setItem('db_token', token);
    enterApp(res.org);
  });

  function logout() {
    token = null;
    localStorage.removeItem('db_token');
    if (pollTimer) clearInterval(pollTimer);
    el.app.hidden = true;
    el.login.style.display = 'flex';
  }
  el.logout.addEventListener('click', logout);

  async function enterApp(org) {
    el.login.style.display = 'none';
    el.app.hidden = false;
    if (org) el.orgName.textContent = org.name + ' · ' + org.seats + ' seats';
    await loadGroups();
    await refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 4000);
  }

  /* ---------- dashboard ---------- */
  async function loadDashboard() {
    const d = await api('/dashboard');
    if (!d.ok) return;
    // Keep the header org/seats correct on fresh login AND after a reload
    // (boot re-enters without the login response, so rely on the dashboard).
    if (d.org) el.orgName.textContent = d.org.name + ' · ' + d.org.seats + ' seats';
    const cards = [
      ['Devices online', d.devicesOnline + ' / ' + d.seats, ''],
      ['Blocks enforced today', d.blocksToday, ''],
      ['Access requests', d.pendingRequests, d.pendingRequests ? 'var(--amber)' : ''],
      ['Coverage', d.coverage + '%', d.coverage >= 100 ? 'var(--clear)' : '']
    ];
    el.cards.innerHTML = cards.map(([k, v, c]) =>
      '<div class="card"><div class="k">' + k + '</div><div class="v"' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</div></div>'
    ).join('');
    el.pendingDot.hidden = d.pendingRequests === 0;
  }

  /* ---------- policies ---------- */
  async function loadGroups() {
    const g = await api('/groups');
    if (!g.ok) return;
    groups = g.groups; categories = g.categories;
    el.groupSel.innerHTML = groups.map(x => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('');
    renderPolicy(groups[0].id);
  }
  el.groupSel.addEventListener('change', () => renderPolicy(el.groupSel.value));

  function renderPolicy(groupId) {
    const g = groups.find(x => x.id === groupId);
    if (!g) return;
    const p = g.policy;
    el.policyEditor.innerHTML = `
      <div class="rowFields">
        <div class="field">
          <label>Enforcement</label>
          <select id="pf_enf">
            <option value="locked">Locked — users can't disable</option>
            <option value="advisory">Advisory — users can opt out</option>
          </select>
        </div>
        <div class="field">
          <label>User unblock</label>
          <select id="pf_unblock">
            <option value="admin-approval">Admin approval required</option>
            <option value="cooldown">Cooldown (self-serve)</option>
            <option value="none">Not allowed</option>
          </select>
        </div>
      </div>
      <div class="rowFields">
        <div class="field"><label>Cooldown (min)</label><input id="pf_cool" class="smallInput" type="number" min="1" max="180" /></div>
        <div class="field"><label>Pass length (min)</label><input id="pf_allow" class="smallInput" type="number" min="1" max="120" /></div>
      </div>
      <div class="field">
        <label>Blocked categories</label>
        <div class="chips" id="pf_cats"></div>
      </div>
      <div class="field">
        <label>Custom blocklist (comma-separated)</label>
        <input id="pf_custom" type="text" placeholder="tiktok.com, betting-site.com" />
      </div>
      <div class="saveRow">
        <button id="pf_save" class="primary" style="width:auto;margin:0">Save policy</button>
        <span id="pf_msg" class="saveMsg"></span>
      </div>`;
    $('#pf_enf').value = p.enforcement;
    $('#pf_unblock').value = p.unblockMode;
    $('#pf_cool').value = p.cooldownMinutes;
    $('#pf_allow').value = p.allowanceMinutes;
    $('#pf_custom').value = (p.customBlocklist || []).join(', ');
    $('#pf_cats').innerHTML = categories.map(c =>
      '<span class="chip' + (p.categories.includes(c) ? ' on' : '') + '" data-cat="' + c + '">' + c + '</span>'
    ).join('');
    $('#pf_cats').querySelectorAll('.chip').forEach(chip =>
      chip.addEventListener('click', () => chip.classList.toggle('on')));
    $('#pf_save').addEventListener('click', () => savePolicy(groupId));
  }

  async function savePolicy(groupId) {
    const cats = [...document.querySelectorAll('#pf_cats .chip.on')].map(c => c.dataset.cat);
    const body = {
      enforcement: $('#pf_enf').value,
      unblockMode: $('#pf_unblock').value,
      cooldownMinutes: +$('#pf_cool').value,
      allowanceMinutes: +$('#pf_allow').value,
      categories: cats,
      customBlocklist: $('#pf_custom').value.split(',').map(s => s.trim()).filter(Boolean)
    };
    const res = await api('/groups/' + groupId + '/policy', { method: 'PUT', body: JSON.stringify(body) });
    if (res.ok) {
      const g = groups.find(x => x.id === groupId);
      g.policy = res.group.policy;
      const msg = $('#pf_msg'); msg.textContent = 'Saved. Devices will sync.';
      setTimeout(() => { msg.textContent = ''; }, 2200);
    }
  }

  /* ---------- requests ---------- */
  async function loadRequests() {
    const r = await api('/requests');
    if (!r.ok) return;
    if (!r.requests.length) { el.reqList.innerHTML = '<div class="empty">No requests yet.</div>'; return; }
    el.reqList.innerHTML = r.requests.map(req => {
      const head = esc(req.deviceName) + ' · <span class="muted">' + esc(req.domain) + '</span>' +
        (req.group ? ' <span class="tag">' + esc(req.group) + '</span>' : '');
      const meta = '“' + esc(req.reason || 'no reason given') + '” · wants ' + req.requestedMin + ' min · ' + ago(req.createdAt);
      let right;
      if (req.status === 'pending') {
        right = '<div class="acts"><button class="approve small" data-approve="' + req.id + '">Approve</button>' +
          '<button class="ghost small" data-deny="' + req.id + '">Deny</button></div>';
      } else if (req.status === 'approved') {
        right = '<span class="pill approved">Approved · ' + req.grantedMin + ' min</span>';
      } else {
        right = '<span class="pill denied">Denied</span>';
      }
      return '<div class="row"><div><div>' + head + '</div><div class="meta">' + meta + '</div></div>' + right + '</div>';
    }).join('');
    el.reqList.querySelectorAll('[data-approve]').forEach(b =>
      b.addEventListener('click', () => decide(b.dataset.approve, 'approved')));
    el.reqList.querySelectorAll('[data-deny]').forEach(b =>
      b.addEventListener('click', () => decide(b.dataset.deny, 'denied')));
  }

  async function decide(id, decision) {
    await api('/requests/' + id + '/decision', { method: 'POST', body: JSON.stringify({ decision }) });
    await Promise.all([loadRequests(), loadDashboard()]);
  }

  /* ---------- devices ---------- */
  async function loadDevices() {
    const d = await api('/devices');
    if (!d.ok) return;
    el.enrollBox.innerHTML = d.enrollmentCodes.map(c =>
      '<div><div class="muted" style="font-size:12px">Staff install the extension and enter this code — no MDM.</div>' +
      '<div class="code">' + esc(c.code) + '</div></div>' +
      '<span class="tag">' + esc(c.group || '') + '</span>'
    ).join('');
    el.deviceList.innerHTML = d.devices.length
      ? d.devices.map(dev =>
        '<div class="row"><div>' + esc(dev.name) + '<span class="tag">' + esc(dev.group || '') + '</span></div>' +
        '<span class="pill ' + (dev.online ? 'online' : 'offline') + '">● ' + (dev.online ? 'online' : ago(dev.lastSeen)) + '</span></div>'
      ).join('')
      : '<div class="empty">No devices enrolled yet. Open the device client and use a code above.</div>';
  }

  /* ---------- reports ---------- */
  async function loadReports() {
    const r = await api('/reports');
    if (!r.ok) return;
    el.reportList.innerHTML = r.top.length
      ? r.top.map(x => '<div class="row"><span>' + esc(x.domain) + '</span><span class="muted">' + x.count + ' blocked</span></div>').join('')
      : '<div class="empty">No blocked attempts logged yet.</div>';
  }

  async function refresh() {
    try {
      await Promise.all([loadDashboard(), loadRequests(), loadDevices(), loadReports()]);
    } catch (e) { /* handled in api() */ }
  }

  /* ---------- boot ---------- */
  (async () => {
    if (token) {
      const d = await fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
      if (d.ok) { enterApp(null); return; }
      localStorage.removeItem('db_token'); token = null;
    }
    el.login.style.display = 'flex';
  })();
})();
