(function () {
  const el = {
    managedBanner: document.getElementById('managedBanner'),
    addWrap: document.getElementById('addWrap'),
    input: document.getElementById('siteInput'),
    addBtn: document.getElementById('addBtn'),
    addHint: document.getElementById('addHint'),
    list: document.getElementById('list'),
    count: document.getElementById('count'),
    empty: document.getElementById('empty'),
    optionsBtn: document.getElementById('optionsBtn')
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function currentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && /^https?:/.test(tab.url)) return HB.normalizeDomain(tab.url);
    } catch (e) { /* no access */ }
    return '';
  }

  async function render() {
    const state = await HB.get();
    if (HB.isManaged(state)) return renderManaged(state);
    return renderIndividual(state);
  }

  /* ---------- managed ---------- */
  function renderManaged(state) {
    const p = state.policy || {};
    const locked = p.enforcement === 'locked';
    el.managedBanner.hidden = false;
    el.managedBanner.innerHTML = 'Managed by <strong>' + esc(p.org || 'your organization') + '</strong> · ' + esc(p.group || '') +
      '<br>' + (locked ? "Locked — you can't change these." : 'Advisory.') + ' Unblock: ' + esc(p.unblockMode || '') + '.';
    el.addWrap.hidden = true;

    const now = Date.now();
    const domains = (p.blocklist || []).slice().sort();
    el.count.textContent = String(domains.length);
    el.empty.hidden = domains.length > 0;
    el.list.innerHTML = '';
    for (const domain of domains) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const site = document.createElement('span'); site.className = 'site'; site.textContent = domain;
      left.appendChild(site);
      const allow = (p.allowances || []).find(a => a.domain === domain && a.expiresAt > now);
      const status = document.createElement('span'); status.className = 'status';
      if (allow) { status.textContent = 'open ' + Math.ceil((allow.expiresAt - now) / 60000) + 'm'; }
      else { status.textContent = 'enforced'; status.classList.add('managed'); }
      left.appendChild(status);
      li.appendChild(left);
      el.list.appendChild(li);
    }
  }

  /* ---------- individual ---------- */
  function renderIndividual(state) {
    el.managedBanner.hidden = true;
    el.addWrap.hidden = false;

    // Lead with the win (P0.2): time saved + days held, click-through to history.
    const winStrip = document.getElementById('winStrip');
    if (winStrip) {
      if (state.blocklist.length) {
        const saved = HB.timeSavedStats(state.blockLog, Date.now());
        const held = HB.daysHeld(state.meta, Date.now());
        winStrip.textContent = '🛡 ' + HB.fmtMinutes(saved.weekMin) + ' saved this week · ' +
          held.current + (held.current === 1 ? ' day held' : ' days held');
      } else {
        winStrip.textContent = '🛡 Block your first site to start saving time.';
      }
      winStrip.hidden = false;
      if (!winStrip.dataset.wired) {
        winStrip.dataset.wired = '1';
        winStrip.addEventListener('click', () => chrome.runtime.openOptionsPage());
      }
    }
    const now = Date.now();
    const sorted = [...state.blocklist].sort((a, b) => a.domain.localeCompare(b.domain));
    el.count.textContent = String(sorted.length);
    el.empty.hidden = sorted.length > 0;
    el.list.innerHTML = '';

    for (const entry of sorted) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const site = document.createElement('span'); site.className = 'site'; site.textContent = entry.domain;
      left.appendChild(site);
      const allowedUntil = state.allowances[entry.domain];
      const status = document.createElement('span'); status.className = 'status';
      if (allowedUntil && allowedUntil > now) status.textContent = 'open ' + Math.ceil((allowedUntil - now) / 60000) + 'm';
      else { status.textContent = 'blocked'; status.classList.add('blocked'); }
      left.appendChild(status);

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Remove';
      wireGatedRemove(remove, entry.domain);

      li.append(left, remove);
      el.list.appendChild(li);
    }
  }

  // Removal is gated by a think-delay so it isn't a one-click escape.
  function wireGatedRemove(btn, domain) {
    let stage = 0, t1 = null, t2 = null;
    btn.addEventListener('click', async () => {
      if (stage === 0) {
        stage = 1;
        btn.disabled = true;
        let s = 3;
        btn.textContent = 'Wait ' + s + 's…';
        t1 = setInterval(() => {
          s--;
          if (s > 0) { btn.textContent = 'Wait ' + s + 's…'; return; }
          clearInterval(t1);
          btn.disabled = false;
          btn.textContent = 'Confirm remove';
          btn.classList.add('confirm');
          stage = 2;
          t2 = setTimeout(() => { btn.textContent = 'Remove'; btn.classList.remove('confirm'); stage = 0; }, 5000);
        }, 1000);
      } else if (stage === 2) {
        if (t2) clearTimeout(t2);
        await chrome.runtime.sendMessage({ type: 'removeBlock', domain });
        render();
      }
    });
  }

  async function add() {
    const domain = HB.normalizeDomain(el.input.value);
    if (!domain) { el.addHint.textContent = 'Type a site like instagram.com'; return; }
    const res = await chrome.runtime.sendMessage({ type: 'addBlock', domain });
    if (res && res.ok) { el.input.value = ''; el.addHint.textContent = domain + ' is now blocked.'; render(); }
    else el.addHint.textContent = res && res.error === 'managed' ? 'Managed by your organization.' : 'Could not block that.';
  }

  el.addBtn.addEventListener('click', add);
  el.input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  el.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  (async () => {
    const state = await HB.get();
    if (!HB.isManaged(state)) { const d = await currentDomain(); if (d) el.input.value = d; }
    render();
  })();
})();
