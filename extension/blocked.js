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

  function fmt(ms) {
    if (ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function whenText(ts) {
    if (!ts) return 'never';
    const diff = Date.now() - ts;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  function renderStats(stats) {
    const rows = [];
    rows.push(['Times unblocked this week', String(stats.thisWeek)]);
    rows.push(['Times unblocked, all time', String(stats.allTime)]);
    if (stats.avgGranted) rows.push(['Average pass you grant yourself', stats.avgGranted + ' min']);
    if (stats.lastTs) rows.push(['Last time you caved', whenText(stats.lastTs)]);

    el.stats.innerHTML = '';
    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('span');
      b.textContent = v;
      if (k.startsWith('Times unblocked this week') && stats.thisWeek >= 3) b.classList.add('flag');
      row.append(a, b);
      el.stats.appendChild(row);
    }
    el.stats.hidden = rows.length === 0;
  }

  function updateUnblockState() {
    const remaining = endsAt ? endsAt - Date.now() : Infinity;
    const reasonOk = el.reason.value.trim().length >= settings.minReasonChars;
    const timerDone = endsAt && remaining <= 0;
    el.unblockBtn.disabled = !(timerDone && reasonOk);
  }

  function startTicking() {
    el.timer.classList.remove('done');
    if (tick) clearInterval(tick);
    const render = () => {
      const remaining = endsAt - Date.now();
      el.timer.textContent = fmt(remaining);
      if (remaining <= 0) {
        el.timer.textContent = '00:00';
        el.timer.classList.add('done');
        el.timerCap.textContent = 'Cooldown done. Still want in? Say why, then decide.';
        clearInterval(tick);
        tick = null;
      }
      updateUnblockState();
    };
    render();
    tick = setInterval(render, 1000);
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
    startTicking();
  }

  async function init() {
    const state = await HB.get();
    settings = state.settings;

    el.sub.textContent = domain
      ? domain + ' — on your blocklist since you set it up sober.'
      : 'This site is on your blocklist.';

    renderStats(HB.relapseStats(state.relapseLog, domain, Date.now()));

    const cd = state.cooldowns[domain];
    if (cd && cd.endsAt > Date.now()) {
      endsAt = cd.endsAt;
      showCooldownRunning();
    } else if (cd && cd.endsAt <= Date.now()) {
      endsAt = cd.endsAt;
      showCooldownRunning();
    } else {
      el.timer.textContent = fmt(settings.cooldownMinutes * 60000);
      el.timerCap.textContent = 'A ' + settings.cooldownMinutes + '-minute wait stands between you and this site.';
    }
  }

  el.startBtn.addEventListener('click', async () => {
    el.startBtn.disabled = true;
    const res = await chrome.runtime.sendMessage({ type: 'startCooldown', domain });
    if (res && res.ok) {
      endsAt = res.endsAt;
      showCooldownRunning();
    } else {
      el.startBtn.disabled = false;
    }
  });

  el.reason.addEventListener('input', updateUnblockState);

  el.unblockBtn.addEventListener('click', async () => {
    el.unblockBtn.disabled = true;
    const res = await chrome.runtime.sendMessage({
      type: 'grantAllowance',
      domain,
      reason: el.reason.value
    });
    if (res && res.ok) {
      el.timerCap.textContent = 'Fine. ' + settings.allowanceMinutes + ' minutes. The clock is running.';
      location.href = 'https://' + domain;
    } else {
      updateUnblockState();
      el.reasonHint.textContent = res && res.error === 'reason-too-short'
        ? 'Not good enough. At least ' + settings.minReasonChars + ' characters.'
        : 'Cooldown is not done yet.';
    }
  });

  el.backBtn.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = 'about:blank';
  });

  init();
})();
