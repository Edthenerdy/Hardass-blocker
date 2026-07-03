(function () {
  const el = {
    cooldown: document.getElementById('cooldown'),
    allowance: document.getElementById('allowance'),
    reasonChars: document.getElementById('reasonChars'),
    saveBtn: document.getElementById('saveBtn'),
    saveMsg: document.getElementById('saveMsg'),
    logTable: document.getElementById('logTable'),
    logBody: document.getElementById('logBody'),
    logEmpty: document.getElementById('logEmpty'),
    clearLogBtn: document.getElementById('clearLogBtn')
  };

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  async function load() {
    const state = await HB.get();
    el.cooldown.value = state.settings.cooldownMinutes;
    el.allowance.value = state.settings.allowanceMinutes;
    el.reasonChars.value = state.settings.minReasonChars;

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
      minReasonChars: clampInt(el.reasonChars, 0, 200, 15)
    };
    el.cooldown.value = settings.cooldownMinutes;
    el.allowance.value = settings.allowanceMinutes;
    el.reasonChars.value = settings.minReasonChars;
    await HB.set({ settings: { ...state.settings, ...settings } });
    el.saveMsg.textContent = 'Saved.';
    setTimeout(() => { el.saveMsg.textContent = ''; }, 1800);
  });

  el.clearLogBtn.addEventListener('click', async () => {
    await HB.set({ relapseLog: [] });
    load();
  });

  load();
})();
