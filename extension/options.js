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

    // On a managed device the personal/Pro sections don't apply — an admin sets
    // the policy. Hide the consumer upsell entirely, and make personal rules
    // read-only with a clear note (don't show editable fields that do nothing).
    const proCard = document.getElementById('proCard');
    const personalNote = document.getElementById('personalNote');
    if (proCard) proCard.hidden = managed;
    if (personalNote) {
      personalNote.innerHTML = managed
        ? 'This device is <strong>managed by ' + esc((state.policy || {}).org || 'your organization') + '</strong> — these personal rules are locked and the org\'s policy applies instead.'
        : 'Used when this device is <em>not</em> managed by a team.';
    }
    ['cooldown', 'allowance', 'reasonChars', 'reasonBypass', 'saveBtn'].forEach(id => {
      const elm = document.getElementById(id);
      if (elm) elm.disabled = managed;
    });

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

    // Free tier sees the last FREE_HISTORY_DAYS of history; Pro sees everything.
    const pro = HB.isPro(state);
    const all = [...state.relapseLog].sort((a, b) => b.ts - a.ts);
    const cutoff = Date.now() - HB.FREE_HISTORY_DAYS * 86400000;
    const log = pro ? all : all.filter(r => r.ts >= cutoff);
    const hiddenCount = all.length - log.length;
    el.logBody.innerHTML = '';
    el.logTable.hidden = log.length === 0;
    el.logEmpty.hidden = log.length > 0;

    // Contextual upgrade (trigger B): only when older history actually exists.
    let histNote = document.getElementById('histUpgrade');
    if (!histNote) {
      histNote = document.createElement('p');
      histNote.id = 'histUpgrade'; histNote.className = 'note';
      el.logEmpty.parentNode.appendChild(histNote);
    }
    if (!pro && hiddenCount > 0) {
      histNote.innerHTML = hiddenCount + ' older ' + (hiddenCount === 1 ? 'entry is' : 'entries are') +
        ' beyond the free 7-day window. <a id="histUpgradeLink" href="#" style="color:var(--amber)">Your full history is a Pro thing — $7.99/mo.</a>';
      histNote.hidden = false;
      document.getElementById('histUpgradeLink').addEventListener('click', async (e) => {
        e.preventDefault();
        const s = await HB.get();
        try { chrome.tabs.create({ url: HB.upgradeUrl(s, 'history') }); } catch (err) { /* noop */ }
      });
    } else histNote.hidden = true;

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

  /* ---------- Holdfast Pro ---------- */
  const proEl = {
    status: document.getElementById('proStatus'),
    unlinked: document.getElementById('proUnlinked'),
    linked: document.getElementById('proLinked'),
    server: document.getElementById('proServer'),
    email: document.getElementById('proEmail'),
    password: document.getElementById('proPassword'),
    linkBtn: document.getElementById('proLinkBtn'),
    msg: document.getElementById('proMsg'),
    syncBtn: document.getElementById('proSyncBtn'),
    upgradeBtn: document.getElementById('proUpgradeBtn'),
    manageBtn: document.getElementById('proManageBtn'),
    unlinkBtn: document.getElementById('proUnlinkBtn'),
    msg2: document.getElementById('proMsg2')
  };

  const comingSoon = document.getElementById('proComingSoon');
  const serverShown = document.getElementById('proServerShown');

  async function loadPro() {
    const state = await HB.get();
    const linked = !!(state.pro && state.pro.token);
    const isPro = HB.isPro(state);
    // Pro sign-ups only exist once an account server is configured. Until then,
    // show "coming soon" instead of a form that sends a password to nowhere.
    const serverConfigured = !!HB.PRO_SERVER || linked;
    proEl.linked.hidden = !linked;
    proEl.unlinked.hidden = linked || !serverConfigured;
    if (comingSoon) comingSoon.hidden = linked || serverConfigured;
    if (serverShown && HB.PRO_SERVER) { try { serverShown.textContent = new URL(HB.PRO_SERVER).host; } catch (e) {} }
    if (proEl.server && HB.PRO_SERVER && !proEl.server.value) proEl.server.value = HB.PRO_SERVER;

    proEl.upgradeBtn.hidden = !(linked && !isPro);
    proEl.manageBtn.hidden = !(linked && isPro);
    if (linked) {
      proEl.status.textContent = isPro
        ? 'Pro active — linked as ' + state.pro.email + '. Unlimited sites, full history.'
        : 'Linked as ' + state.pro.email + ' — free plan. Upgrade for unlimited sites and your full history ($7.99/mo).';
    } else {
      proEl.status.textContent = 'Free plan — up to ' + HB.FREE_MAX_SITES + ' blocked sites and ' + HB.FREE_HISTORY_DAYS + ' days of history. Pro is $7.99/mo: unlimited sites and your full history.';
    }
  }

  proEl.linkBtn.addEventListener('click', async () => {
    proEl.msg.textContent = 'Linking…';
    const server = (proEl.server && proEl.server.value.trim()) || HB.PRO_SERVER;
    const res = await chrome.runtime.sendMessage({ type: 'proLink', serverUrl: server, email: proEl.email.value.trim(), password: proEl.password.value });
    proEl.msg.textContent = res && res.ok ? 'Linked.' : ((res && res.error) || 'Failed');
    proEl.password.value = '';
    if (res && res.ok) { loadPro(); load(); }
  });
  proEl.syncBtn.addEventListener('click', async () => {
    proEl.msg2.textContent = 'Checking…';
    const res = await chrome.runtime.sendMessage({ type: 'proSync' });
    proEl.msg2.textContent = res && res.ok ? 'Up to date.' : ((res && res.error) || 'Failed');
    loadPro(); load();
    setTimeout(() => { proEl.msg2.textContent = ''; }, 1800);
  });
  proEl.upgradeBtn.addEventListener('click', async () => {
    const state = await HB.get();
    try { chrome.tabs.create({ url: HB.upgradeUrl(state, 'options-upgrade') }); } catch (e) { /* noop */ }
  });
  proEl.manageBtn.addEventListener('click', async () => {
    const state = await HB.get();
    try { chrome.tabs.create({ url: HB.upgradeUrl(state, 'manage') }); } catch (e) { /* noop */ }
  });
  proEl.unlinkBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'proUnlink' });
    loadPro(); load();
  });

  load();
  loadTeam();
  loadPro();
})();
