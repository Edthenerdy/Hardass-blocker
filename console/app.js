(function () {
  const $ = sel => document.querySelector(sel);
  const el = {
    login: $('#login'), loginForm: $('#loginForm'), email: $('#email'), password: $('#password'),
    loginErr: $('#loginErr'), app: $('#app'), orgName: $('#orgName'), logout: $('#logout'),
    cards: $('#cards'), groupSel: $('#groupSel'), policyEditor: $('#policyEditor'),
    reqList: $('#reqList'), pendingDot: $('#pendingDot'),
    enrollBox: $('#enrollBox'), deviceList: $('#deviceList'), reportList: $('#reportList'),
    tabSignin: $('#tabSignin'), tabSignup: $('#tabSignup'), orgNameField: $('#orgNameField'),
    orgName2: $('#orgName2'), authSubmit: $('#authSubmit'), billingCard: $('#billingCard'), billingDot: $('#billingDot'),
    cbanner: $('#cbanner')
  };

  let token = localStorage.getItem('db_token') || null;
  let groups = [];
  let categories = [];
  let pollTimer = null;
  let subActive = true;

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
  let authMode = 'signin';
  function setAuthMode(m) {
    authMode = m;
    el.tabSignin.classList.toggle('on', m === 'signin');
    el.tabSignup.classList.toggle('on', m === 'signup');
    el.orgNameField.hidden = m !== 'signup';
    el.authSubmit.textContent = m === 'signin' ? 'Sign in' : 'Create organization';
  }
  el.tabSignin.addEventListener('click', () => setAuthMode('signin'));
  el.tabSignup.addEventListener('click', () => setAuthMode('signup'));

  el.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    el.loginErr.textContent = '';
    const path = authMode === 'signup' ? '/api/auth/org/signup' : '/api/auth/login';
    const body = authMode === 'signup'
      ? { orgName: el.orgName2.value.trim(), name: el.email.value, email: el.email.value.trim(), password: el.password.value }
      : { email: el.email.value.trim(), password: el.password.value };
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    if (!res.ok) { el.loginErr.textContent = res.error || 'Failed'; return; }
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
    if (new URLSearchParams(location.search).get('paid')) {
      el.cbanner.hidden = false;
      el.cbanner.textContent = 'Payment received — your subscription is active. Enrolment is unlocked below.';
      history.replaceState(null, '', location.pathname);
    }
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
    if (d.subscription) {
      subActive = d.subscription.active;
      el.billingDot.hidden = subActive;
      el.orgName.textContent = d.subscription.orgName + (subActive ? ' · active' : ' · inactive');
    }
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
    if (!subActive) {
      el.enrollBox.innerHTML = '<div><div class="muted" style="font-size:12px">Enrolment is locked until you activate a subscription.</div>' +
        '<div style="margin-top:6px"><a href="#billing" style="color:var(--amber)">Go to Billing →</a></div></div>';
      el.deviceList.innerHTML = '';
      return;
    }
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
  function fmtMinutes(min) {
    min = Math.max(0, Math.round(min || 0));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
  }

  async function loadReports() {
    const r = await api('/reports');
    if (!r.ok) return;
    const headline = r.totalBlocked
      ? '<div class="row"><span><strong>Time reclaimed this week (est.)</strong></span><span style="color:var(--clear);font-weight:600">' + fmtMinutes(r.timeSavedMin) + '</span></div>' +
        '<div class="row"><span class="muted" style="font-size:12px">Estimated at ~15 min per blocked attempt across enrolled devices.</span><span></span></div>'
      : '';
    el.reportList.innerHTML = r.top.length
      ? headline + r.top.map(x => '<div class="row"><span>' + esc(x.domain) + '</span><span class="muted">' + x.count + ' blocked</span></div>').join('')
      : '<div class="empty">No blocked attempts logged yet.</div>';
  }

  /* ---------- billing ---------- */
  async function loadBilling() {
    const s = await api('/billing/status');
    if (!s.ok) return;
    const active = s.active;
    const price = 4;
    if (active) {
      const renew = s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—';
      el.billingCard.innerHTML =
        '<div class="billMetric">' +
        '<div class="m"><div class="k">Status</div><div class="v"><span class="pill active">active</span></div></div>' +
        '<div class="m"><div class="k">Seats</div><div class="v">' + s.seats + '</div></div>' +
        '<div class="m"><div class="k">Monthly</div><div class="v">$' + (s.seats * price) + '<span style="font-size:12px;color:var(--ash);font-weight:400"> · $' + price + '/seat</span></div></div>' +
        '<div class="m"><div class="k">Renews</div><div class="v" style="font-size:14px">' + renew + '</div></div>' +
        '</div>' +
        '<div class="rowFields" style="align-items:flex-end"><div class="field"><label>Change seats</label>' +
        '<input id="bill_seats" class="smallInput" type="number" min="3" value="' + s.seats + '" /></div>' +
        '<button id="bill_update" class="primary" style="width:auto;margin:0 0 16px">Update seats</button>' +
        '<button id="bill_cancel" class="ghost" style="margin:0 0 16px">Cancel subscription</button></div>';
      $('#bill_update').addEventListener('click', async () => {
        const r = await api('/billing/seats', { method: 'POST', body: JSON.stringify({ seats: +$('#bill_seats').value }) });
        if (r.ok) refresh(); else alert(r.error || 'Update failed');
      });
      $('#bill_cancel').addEventListener('click', async () => { await api('/billing/cancel', { method: 'POST' }); refresh(); });
    } else {
      el.billingCard.innerHTML =
        '<div class="billMetric"><div class="m"><div class="k">Status</div><div class="v"><span class="pill inactive">' + esc(s.status || 'inactive') + '</span></div></div></div>' +
        '<p class="note" style="color:var(--ash);font-size:13px;margin:0 0 12px">Activate a subscription to unlock enrolment and enforce your policy. $' + price + '/seat/month, 3-seat minimum.</p>' +
        '<div class="rowFields" style="align-items:flex-end"><div class="field"><label>Seats</label>' +
        '<input id="bill_seats" class="smallInput" type="number" min="3" value="5" /></div>' +
        '<button id="bill_go" class="primary" style="width:auto;margin:0 0 16px">Subscribe &amp; pay</button></div>';
      $('#bill_go').addEventListener('click', () => checkout(+$('#bill_seats').value));
    }
  }

  async function checkout(seats) {
    const res = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'team_monthly', seats }) });
    if (res.ok && res.url) location.href = res.url;
    else alert(res.error || 'Checkout failed');
  }

  async function refresh() {
    try {
      await Promise.all([loadDashboard(), loadRequests(), loadDevices(), loadReports(), loadBilling()]);
    } catch (e) { /* handled in api() */ }
  }

  /* ---------- boot ---------- */
  (async () => {
    setAuthMode('signin');
    if (token) {
      const d = await fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
      if (d.ok) { enterApp(null); return; }
      localStorage.removeItem('db_token'); token = null;
    }
    el.login.style.display = 'flex';
  })();
})();
