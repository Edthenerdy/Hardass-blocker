(function () {
  const $ = s => document.querySelector(s);
  const el = {
    enroll: $('#enroll'), enrollForm: $('#enrollForm'), code: $('#code'), devName: $('#devName'), enrollErr: $('#enrollErr'),
    managed: $('#managed'), banner: $('#bannerText'), unenroll: $('#unenroll'),
    addr: $('#addr'), go: $('#go'), viewport: $('#viewport'), policyInfo: $('#policyInfo')
  };

  let token = localStorage.getItem('db_device_token') || null;
  let policy = null;
  let poll = null;
  let tick = null;

  function normalize(raw) {
    let s = (raw || '').trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].split('#')[0].replace(/^www\./, '');
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmt(ms) { if (ms < 0) ms = 0; const t = Math.ceil(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  function clearTimers() { if (poll) { clearInterval(poll); poll = null; } if (tick) { clearInterval(tick); tick = null; } }

  async function dapi(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, opts.headers || {});
    const res = await fetch('/api/device' + path, opts);
    return res.json();
  }

  /* ---------- enrollment ---------- */
  el.enrollForm.addEventListener('submit', async e => {
    e.preventDefault();
    el.enrollErr.textContent = '';
    const res = await fetch('/api/enroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: el.code.value, deviceName: el.devName.value })
    }).then(r => r.json());
    if (!res.ok) { el.enrollErr.textContent = res.error || 'Enrollment failed'; return; }
    token = res.deviceToken;
    localStorage.setItem('db_device_token', token);
    policy = res.policy;
    enterManaged();
  });

  el.unenroll.addEventListener('click', () => {
    localStorage.removeItem('db_device_token');
    token = null; policy = null; clearTimers();
    el.managed.hidden = true; el.enroll.hidden = false;
  });

  async function enterManaged() {
    el.enroll.hidden = true;
    el.managed.hidden = false;
    await syncPolicy();
    renderIdle();
  }

  async function syncPolicy() {
    const res = await dapi('/policy');
    if (res.ok) policy = res.policy;
    renderBanner();
    renderPolicyInfo();
    return policy;
  }

  function renderBanner() {
    if (!policy) return;
    const mode = policy.unblockMode === 'admin-approval' ? 'admin approval required to unblock'
      : policy.unblockMode === 'cooldown' ? 'cooldown required to unblock' : 'no unblocking';
    el.banner.innerHTML = 'Managed by <strong>' + esc(policy.org) + '</strong> · ' + esc(policy.group) +
      ' · <span class="muted">' + (policy.enforcement === 'locked' ? "locked — you can't disable this" : 'advisory') + ', ' + mode + '</span>';
  }

  function renderPolicyInfo() {
    if (!policy) return;
    el.policyInfo.innerHTML =
      '<div class="prow"><span>Enforcement</span><span class="badge locked">' + esc(policy.enforcement) + '</span></div>' +
      '<div class="prow"><span>Unblock mode</span><span>' + esc(policy.unblockMode) + '</span></div>' +
      '<div class="prow"><span>Blocked sites</span><span>' + policy.blocklist.length + '</span></div>' +
      '<div class="prow"><span>Sample</span><span class="muted">' + esc(policy.blocklist.slice(0, 5).join(', ')) + '…</span></div>';
  }

  function allowanceFor(domain) {
    const now = Date.now();
    return (policy.allowances || []).find(a => a.domain === domain && a.expiresAt > now) || null;
  }
  function isBlocked(domain) {
    return policy.blocklist.includes(domain) && !allowanceFor(domain);
  }

  /* ---------- navigation ---------- */
  async function visit(raw) {
    clearTimers();
    const domain = normalize(raw);
    if (!domain) { renderIdle(); return; }
    await syncPolicy();

    if (!isBlocked(domain)) {
      dapi('/telemetry', { method: 'POST', body: JSON.stringify({ domain, type: 'allowed' }) });
      const a = allowanceFor(domain);
      renderSite(domain, a);
      return;
    }
    dapi('/telemetry', { method: 'POST', body: JSON.stringify({ domain, type: 'blocked' }) });
    if (policy.unblockMode === 'admin-approval') renderApproval(domain);
    else if (policy.unblockMode === 'cooldown') renderCooldown(domain);
    else renderHardBlock(domain);
  }

  el.go.addEventListener('click', () => visit(el.addr.value));
  el.addr.addEventListener('keydown', e => { if (e.key === 'Enter') visit(el.addr.value); });

  /* ---------- viewport states ---------- */
  function renderIdle() {
    el.viewport.innerHTML = '<div class="site muted"><div class="fav">🔒</div><h2 style="color:var(--ash)">Type a site above</h2>' +
      '<p class="small">Try a blocked one (instagram.com) or an allowed one (example.com).</p></div>';
  }

  function renderSite(domain, allowance) {
    const left = allowance ? ' · access ends in ' + Math.ceil((allowance.expiresAt - Date.now()) / 60000) + ' min' : '';
    el.viewport.innerHTML = '<div class="site"><div class="fav">' + esc(domain[0].toUpperCase()) + '</div>' +
      '<h2>' + esc(domain) + '</h2><p class="muted small">Site loads normally' + (allowance ? '<span class="granted">' + left + '</span>' : '') + '</p></div>';
  }

  function renderHardBlock(domain) {
    el.viewport.innerHTML = '<div class="block"><div class="fav" style="background:#4A1B0C;color:var(--redline)">✕</div>' +
      '<h2>Blocked.</h2><p class="cap">' + esc(domain) + ' is blocked and your policy does not allow unblocking.</p></div>';
  }

  function renderApproval(domain) {
    el.viewport.innerHTML =
      '<div class="block"><h2>Blocked.</h2>' +
      '<p class="cap">' + esc(domain) + ' — blocked by ' + esc(policy.org) + '. Ask your admin to open it.</p>' +
      '<textarea id="rz" placeholder="Why do you need it? Your admin will see this."></textarea>' +
      '<div class="stack"><input id="mins" type="number" min="1" max="120" value="' + policy.allowanceMinutes + '" style="max-width:120px" />' +
      '<button id="reqBtn" class="danger">Request access</button></div>' +
      '<p id="reqState" class="cap"></p></div>';
    $('#reqBtn').addEventListener('click', async () => {
      const reason = $('#rz').value.trim();
      if (reason.length < 10) { $('#reqState').innerHTML = '<span class="denied">Give a real reason (10+ chars).</span>'; return; }
      $('#reqBtn').disabled = true;
      const res = await dapi('/requests', { method: 'POST', body: JSON.stringify({ domain, reason, requestedMin: +$('#mins').value }) });
      if (!res.ok) { $('#reqState').innerHTML = '<span class="denied">' + esc(res.error) + '</span>'; $('#reqBtn').disabled = false; return; }
      $('#reqState').innerHTML = '<span class="pending">Sent. Waiting for your admin to approve…</span>';
      poll = setInterval(async () => {
        const rs = await dapi('/requests');
        const mine = (rs.requests || []).find(r => r.id === res.request.id);
        if (!mine) return;
        if (mine.status === 'approved') { clearTimers(); await syncPolicy(); renderSite(domain, allowanceFor(domain)); }
        else if (mine.status === 'denied') { clearTimers(); $('#reqState').innerHTML = '<span class="denied">Denied by admin. Stays blocked.</span>'; }
      }, 2000);
    });
  }

  function renderCooldown(domain) {
    const endsAt = Date.now() + policy.cooldownMinutes * 60000;
    el.viewport.innerHTML =
      '<div class="block"><h2>Blocked. On purpose.</h2>' +
      '<p class="cap">' + esc(domain) + ' — wait out the cooldown, then say why.</p>' +
      '<div id="tm" class="timer">' + fmt(policy.cooldownMinutes * 60000) + '</div>' +
      '<p class="cap" id="tmcap">Cooldown before you can unblock. <a href="#" id="skip" style="color:var(--ash)">skip (demo)</a></p>' +
      '<textarea id="rz" placeholder="Because…"></textarea>' +
      '<div class="stack"><button id="unblockBtn" class="danger" disabled>Unblock for ' + policy.allowanceMinutes + ' min</button></div>' +
      '<p id="cdState" class="cap"></p></div>';
    let end = endsAt;
    const tm = $('#tm'), btn = $('#unblockBtn'), rz = $('#rz');
    function refresh() {
      const rem = end - Date.now();
      tm.textContent = fmt(rem);
      const done = rem <= 0;
      if (done) { tm.classList.add('done'); if (tick) { clearInterval(tick); tick = null; } }
      btn.disabled = !(done && rz.value.trim().length >= 10);
    }
    tick = setInterval(refresh, 250); refresh();
    rz.addEventListener('input', refresh);
    $('#skip').addEventListener('click', e => { e.preventDefault(); end = Date.now(); refresh(); });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await dapi('/selfgrant', { method: 'POST', body: JSON.stringify({ domain, reason: rz.value.trim() }) });
      if (!res.ok) { $('#cdState').innerHTML = '<span class="denied">' + esc(res.error) + '</span>'; btn.disabled = false; return; }
      await syncPolicy(); renderSite(domain, allowanceFor(domain));
    });
  }

  /* ---------- boot ---------- */
  (async () => {
    if (token) {
      const res = await dapi('/policy');
      if (res.ok) { policy = res.policy; enterManaged(); return; }
      localStorage.removeItem('db_device_token'); token = null;
    }
    el.enroll.hidden = false;
  })();
})();
