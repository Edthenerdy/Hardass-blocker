(function () {
  const el = {
    cooldown: document.getElementById('cooldown'),
    allowance: document.getElementById('allowance'),
    reasonChars: document.getElementById('reasonChars'),
    bypass: document.getElementById('reasonBypass'),
    saveBtn: document.getElementById('saveBtn'),
    saveMsg: document.getElementById('saveMsg'),
    logTable: document.getElementById('logTable'),
    logBody: document.getElementById('logBody'),
    logEmpty: document.getElementById('logEmpty'),
    clearLogBtn: document.getElementById('clearLogBtn')
  };

  const team = {
    unmanaged: document.getElementById('teamUnmanaged'),
    managed: document.getElementById('teamManaged'),
    info: document.getElementById('teamInfo'),
    serverUrl: document.getElementById('serverUrl'),
    code: document.getElementById('enrollCode'),
    deviceName: document.getElementById('deviceName'),
    enrollBtn: document.getElementById('enrollBtn'),
    enrollMsg: document.getElementById('enrollMsg'),
    syncBtn: document.getElementById('syncBtn'),
    leaveBtn: document.getElementById('leaveBtn'),
    teamMsg: document.getElementById('teamMsg')
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  async function loadTeam() {
    const state = await HB.get();
    const managed = HB.isManaged(state);
    team.unmanaged.hidden = managed;
    team.managed.hidden = !managed;
    if (managed) {
      const p = state.policy || {};
      const locked = p.enforcement === 'locked';
      team.info.innerHTML =
        '<div class="note" style="margin-bottom:10px">Managed by <strong style="color:var(--bone)">' + esc(p.org || '') + '</strong> · group <strong style="color:var(--bone)">' + esc(p.group || '') + '</strong></div>' +
        '<div class="log"><table class="log"><tbody>' +
        '<tr><td>Enforcement</td><td>' + esc(p.enforcement || '') + '</td></tr>' +
        '<tr><td>Unblock mode</td><td>' + esc(p.unblockMode || '') + '</td></tr>' +
        '<tr><td>Blocked sites</td><td>' + ((p.blocklist || []).length) + '</td></tr>' +
        '</tbody></table></div>';
      team.leaveBtn.disabled = locked;
      team.leaveBtn.title = locked ? "Locked by your admin — you can't leave" : '';
      team.leaveBtn.textContent = locked ? "Leave team (locked by admin)" : 'Leave team';
    }
  }

  team.enrollBtn.addEventListener('click', async () => {
    team.enrollMsg.textContent = 'Enrolling…';
    const res = await chrome.runtime.sendMessage({
      type: 'enrollTeam',
      serverUrl: team.serverUrl.value.trim(),
      code: team.code.value.trim(),
      deviceName: team.deviceName.value.trim() || 'Unnamed device'
    });
    if (res && res.ok) { team.enrollMsg.textContent = 'Enrolled.'; loadTeam(); load(); }
    else team.enrollMsg.textContent = (res && res.error) || 'Enrollment failed';
  });

  team.syncBtn.addEventListener('click', async () => {
    team.teamMsg.textContent = 'Syncing…';
    const res = await chrome.runtime.sendMessage({ type: 'syncNow' });
    team.teamMsg.textContent = res && res.ok ? 'Synced.' : ((res && res.error) || 'Sync failed');
    loadTeam();
    setTimeout(() => { team.teamMsg.textContent = ''; }, 1800);
  });

  team.leaveBtn.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'leaveTeam' });
    if (res && res.ok) { team.teamMsg.textContent = 'Left team.'; loadTeam(); }
    else team.teamMsg.textContent = res && res.error === 'locked' ? "Locked by your admin — you can't leave." : 'Could not leave';
  });

  async function load() {
    const state = await HB.get();
    el.cooldown.value = state.settings.cooldownMinutes;
    el.allowance.value = state.settings.allowanceMinutes;
    el.reasonChars.value = state.settings.minReasonChars;
    el.bypass.checked = state.settings.blockBypass !== false;

    const log = [...state.relapseLog].sort((a, b) => b.ts - a.ts);
    el.logBody.innerHTML = '';
    el.logTable.hidden = log.length === 0;
    el.logEmpty.hidden = log.length > 0;

    for (const r of log) {
      const tr = document.createElement('tr');
      const when = document.createElement('td');
      when.textContent = fmtDate(r.ts);
      const site = document.createElement('td');
      site.textContent = r.domain;
      const reason = document.createElement('td');
      reason.textContent = r.reason || '—';
      tr.append(when, site, reason);
      el.logBody.appendChild(tr);
    }
  }

  function clampInt(input, min, max, fallback) {
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = fallback;
    return Math.max(min, Math.min(max, v));
  }

  el.saveBtn.addEventListener('click', async () => {
    const state = await HB.get();
    const settings = {
      cooldownMinutes: clampInt(el.cooldown, 1, 180, 20),
      allowanceMinutes: clampInt(el.allowance, 1, 120, 10),
      minReasonChars: clampInt(el.reasonChars, 0, 200, 15),
      blockBypass: !!el.bypass.checked
    };
    el.cooldown.value = settings.cooldownMinutes;
    el.allowance.value = settings.allowanceMinutes;
    el.reasonChars.value = settings.minReasonChars;
    await HB.set({ settings: { ...state.settings, ...settings } });
    await chrome.runtime.sendMessage({ type: 'applyRules' });
    el.saveMsg.textContent = 'Saved.';
    setTimeout(() => { el.saveMsg.textContent = ''; }, 1800);
  });

  el.clearLogBtn.addEventListener('click', async () => {
    await HB.set({ relapseLog: [] });
    load();
  });

  load();
  loadTeam();
})();
