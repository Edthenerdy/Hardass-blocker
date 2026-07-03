(function () {
  const params = new URLSearchParams(location.search);
  const domain = HB.normalizeDomain(params.get('d') || '');

  const el = {
    headline: document.getElementById('headline'),
    sub: document.getElementById('sub'),
    timer: document.getElementById('timer'),
    timerCap: document.getElementById('timerCap'),
    stats: document.getElementById('stats'),
    reasonLabel: document.getElementById('reasonLabel'),
    reason: document.getElementById('reason'),
    reasonHint: document.getElementById('reasonHint'),
    startBtn: document.getElementById('startBtn'),
    unblockBtn: document.getElementById('unblockBtn'),
    backBtn: document.getElementById('backBtn')
  };

  let settings = { cooldownMinutes: 20, allowanceMinutes: 10, minReasonChars: 15 };
  let endsAt = null;
  let tick = null;
  let poll = null;

  function fmt(ms) {
    if (ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function whenText(ts) {
    if (!ts) return 'never';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    return hrs < 24 ? hrs + 'h ago' : Math.round(hrs / 24) + 'd ago';
  }
  function msg(type, extra) { return chrome.runtime.sendMessage(Object.assign({ type }, extra || {})); }

  el.backBtn.addEventListener('click', () => {
    if (poll) clearInterval(poll);
    if (history.length > 1) history.back(); else location.href = 'about:blank';
  });

  /* ================= managed mode ================= */

  async function initManaged(state) {
    const policy = state.policy || {};
    msg('telemetry', { domain, event: 'blocked' });

    el.stats.hidden = true;
    el.sub.innerHTML = domain + ' — blocked by <strong>' + (policy.org || 'your organization') + '</strong> · ' + (policy.group || '');

    if (policy.unblockMode === 'none') {
      el.headline.textContent = 'Blocked.';
      el.timer.style.display = 'none';
      el.timerCap.textContent = 'Your policy does not allow unblocking. Talk to your admin.';
      return;
    }
    if (policy.unblockMode === 'admin-approval') return managedApproval(policy);
    return managedCooldown(policy); // cooldown mode
  }

  function managedApproval(policy) {
    el.headline.textContent = 'Blocked.';
    el.timer.style.display = 'none';
    el.timerCap.textContent = 'Ask your admin to open this. They will see your reason.';
    el.reasonLabel.hidden = false; el.reasonLabel.textContent = 'Why do you need it?';
    el.reason.hidden = false;
    el.reasonHint.hidden = false; el.reasonHint.textContent = 'At least 10 characters. Your admin reads this.';
    el.unblockBtn.hidden = false;
    el.unblockBtn.textContent = 'Request access';
    el.unblockBtn.disabled = true;

    el.reason.addEventListener('input', () => { el.unblockBtn.disabled = el.reason.value.trim().length < 10; });

    el.unblockBtn.addEventListener('click', async () => {
      el.unblockBtn.disabled = true;
      const res = await msg('requestAccess', { domain, reason: el.reason.value.trim(), requestedMin: policy.allowanceMinutes });
      if (!res || !res.ok) { el.reasonHint.textContent = (res && res.error) || 'Could not send request.'; el.unblockBtn.disabled = false; return; }
      const reqId = res.request.id;
      el.timerCap.textContent = 'Sent. Waiting for your admin to approve…';
      el.reason.disabled = true;
      el.unblockBtn.textContent = 'Waiting…';
      poll = setInterval(async () => {
        const rs = await msg('pollRequests');
        if (!rs || !rs.ok) return;
        const mine = (rs.requests || []).find(r => r.id === reqId);
        if (!mine) return;
        if (mine.status === 'approved') {
          clearInterval(poll);
          el.timerCap.textContent = 'Approved. Opening…';
          await msg('syncNow');
          location.href = 'https://' + domain;
        } else if (mine.status === 'denied') {
          clearInterval(poll);
          el.timerCap.textContent = 'Denied by your admin. This stays blocked.';
          el.unblockBtn.textContent = 'Request access';
        }
      }, 2000);
    });
  }

  async function managedCooldown(policy) {
    el.headline.textContent = 'Blocked. On purpose.';
    const state = await HB.get();
    const cd = state.cooldowns[domain];
    const cooldownMs = (policy.cooldownMinutes || 15) * 60000;

    const showRunning = () => {
      el.startBtn.hidden = true;
      el.unblockBtn.hidden = false;
      el.unblockBtn.textContent = 'Unblock for ' + policy.allowanceMinutes + ' min';
      el.reasonLabel.hidden = false; el.reason.hidden = false; el.reasonHint.hidden = false;
      el.reasonHint.textContent = 'At least 10 characters.';
      el.timerCap.textContent = 'Cooldown before you can unblock. This is logged for your admin.';
      startTicking(() => {
        const reasonOk = el.reason.value.trim().length >= 10;
        el.unblockBtn.disabled = !(endsAt && endsAt - Date.now() <= 0 && reasonOk);
      });
    };

    if (cd && cd.endsAt) { endsAt = cd.endsAt; showRunning(); }
    else {
      el.timer.textContent = fmt(cooldownMs);
      el.timerCap.textContent = 'A ' + (policy.cooldownMinutes || 15) + '-minute wait stands between you and this site.';
    }

    el.reason.addEventListener('input', () => {
      const reasonOk = el.reason.value.trim().length >= 10;
      el.unblockBtn.disabled = !(endsAt && endsAt - Date.now() <= 0 && reasonOk);
    });

    el.startBtn.addEventListener('click', async () => {
      endsAt = Date.now() + cooldownMs;
      state.cooldowns[domain] = { startedAt: Date.now(), endsAt };
      await HB.set({ cooldowns: state.cooldowns });
      showRunning();
    });

    el.unblockBtn.addEventListener('click', async () => {
      el.unblockBtn.disabled = true;
      const res = await msg('selfGrantManaged', { domain, reason: el.reason.value.trim() });
      if (!res || !res.ok) { el.reasonHint.textContent = (res && res.error) || 'Could not unblock.'; el.unblockBtn.disabled = false; return; }
      const s = await HB.get(); delete s.cooldowns[domain]; await HB.set({ cooldowns: s.cooldowns });
      location.href = 'https://' + domain;
    });
  }

  /* ================= individual (unmanaged) mode ================= */

  function renderStats(stats) {
    const rows = [];
    rows.push(['Times unblocked this week', String(stats.thisWeek)]);
    rows.push(['Times unblocked, all time', String(stats.allTime)]);
    if (stats.avgGranted) rows.push(['Average pass you grant yourself', stats.avgGranted + ' min']);
    if (stats.lastTs) rows.push(['Last time you caved', whenText(stats.lastTs)]);
    el.stats.innerHTML = '';
    for (const [k, v] of rows) {
      const row = document.createElement('div'); row.className = 'row';
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('span'); b.textContent = v;
      if (k.startsWith('Times unblocked this week') && stats.thisWeek >= 3) b.classList.add('flag');
      row.append(a, b); el.stats.appendChild(row);
    }
    el.stats.hidden = rows.length === 0;
  }

  function startTicking(onTick) {
    el.timer.classList.remove('done');
    if (tick) clearInterval(tick);
    const render = () => {
      const remaining = endsAt - Date.now();
      el.timer.textContent = fmt(remaining);
      if (remaining <= 0) {
        el.timer.textContent = '00:00';
        el.timer.classList.add('done');
        el.timerCap.textContent = 'Cooldown done. Still want in? Say why, then decide.';
        clearInterval(tick); tick = null;
      }
      if (onTick) onTick();
    };
    render();
    tick = setInterval(render, 1000);
  }

  function updateUnblockState() {
    const remaining = endsAt ? endsAt - Date.now() : Infinity;
    const reasonOk = el.reason.value.trim().length >= settings.minReasonChars;
    el.unblockBtn.disabled = !(endsAt && remaining <= 0 && reasonOk);
  }

  function showCooldownRunning() {
    el.startBtn.hidden = true;
    el.unblockBtn.hidden = false;
    el.reasonLabel.hidden = false;
    el.reason.hidden = false;
    el.reasonHint.hidden = false;
    el.reasonHint.textContent = 'At least ' + settings.minReasonChars + ' characters. Be honest — future-you is reading this.';
    el.unblockBtn.textContent = 'Unblock for ' + settings.allowanceMinutes + ' min';
    el.timerCap.textContent = 'Cooldown before you can unblock. Past-you was serious.';
    startTicking(updateUnblockState);
  }

  async function initIndividual(state) {
    settings = state.settings;
    el.sub.textContent = domain ? domain + ' — on your blocklist since you set it up sober.' : 'This site is on your blocklist.';
    renderStats(HB.relapseStats(state.relapseLog, domain, Date.now()));

    const cd = state.cooldowns[domain];
    if (cd) { endsAt = cd.endsAt; showCooldownRunning(); }
    else {
      el.timer.textContent = fmt(settings.cooldownMinutes * 60000);
      el.timerCap.textContent = 'A ' + settings.cooldownMinutes + '-minute wait stands between you and this site.';
    }

    el.startBtn.addEventListener('click', async () => {
      el.startBtn.disabled = true;
      const res = await msg('startCooldown', { domain });
      if (res && res.ok) { endsAt = res.endsAt; showCooldownRunning(); }
      else el.startBtn.disabled = false;
    });
    el.reason.addEventListener('input', updateUnblockState);
    el.unblockBtn.addEventListener('click', async () => {
      el.unblockBtn.disabled = true;
      const res = await msg('grantAllowance', { domain, reason: el.reason.value });
      if (res && res.ok) { el.timerCap.textContent = 'Fine. ' + settings.allowanceMinutes + ' minutes. The clock is running.'; location.href = 'https://' + domain; }
      else {
        updateUnblockState();
        el.reasonHint.textContent = res && res.error === 'reason-too-short'
          ? 'Not good enough. At least ' + settings.minReasonChars + ' characters.'
          : 'Cooldown is not done yet.';
      }
    });
  }

  function initBypass() {
    el.headline.textContent = 'Nice try.';
    el.sub.textContent = 'Proxies, translators, cache and archive tricks are blocked too. There is no side door.';
    el.timer.style.display = 'none';
    el.timerCap.textContent = 'This is how you keep a block a block.';
    el.stats.hidden = true;
  }

  /* ================= boot ================= */
  (async () => {
    if (params.get('x') === '1') return initBypass();
    const state = await HB.get();
    if (HB.isManaged(state)) return initManaged(state);
    return initIndividual(state);
  })();
})();
