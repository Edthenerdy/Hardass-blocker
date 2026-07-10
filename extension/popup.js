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

  let ticker = null;
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
    const now = Date.now();
    const sorted = [...state.blocklist].sort((a, b) => a.domain.localeCompare(b.domain));
    el.count.textContent = String(sorted.length);
    el.empty.hidden = sorted.length > 0;
    el.list.innerHTML = '';

    let anyPending = false;
    for (const entry of sorted) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const site = document.createElement('span'); site.className = 'site'; site.textContent = entry.domain;
      left.appendChild(site);

      const allowedUntil = state.allowances[entry.domain];
      const removeAt = state.pendingRemovals[entry.domain];
      const status = document.createElement('span'); status.className = 'status';

      const remove = document.createElement('button');
      remove.className = 'remove';

      if (removeAt && removeAt > now) {
        anyPending = true;
        status.textContent = 'blocked · removing in ' + fmt(removeAt - now);
        status.classList.add('removing');
        remove.textContent = 'Keep blocked';
        remove.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'cancelRemoval', domain: entry.domain }); render(); });
      } else if (allowedUntil && allowedUntil > now) {
        status.textContent = 'open ' + Math.ceil((allowedUntil - now) / 60000) + 'm';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => startRemoval(entry.domain));
      } else {
        status.textContent = 'blocked';
        status.classList.add('blocked');
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => startRemoval(entry.domain));
      }

      left.appendChild(status);
      li.append(left, remove);
      el.list.appendChild(li);
    }

    // Live-tick the removal countdowns while the popup is open.
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (anyPending) ticker = setInterval(render, 1000);
  }

  function fmt(ms) {
    if (ms < 0) ms = 0;
    const t = Math.ceil(ms / 1000);
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  async function startRemoval(domain) {
    const res = await chrome.runtime.sendMessage({ type: 'removeBlock', domain });
    if (res && res.error === 'managed') { el.addHint.textContent = 'Managed by your organization.'; return; }
    render(); // now shows "removing in mm:ss" — the site stays blocked until then
  }

  async function add() {
    const domain = HB.normalizeDomain(el.input.value);
    if (!domain) { el.addHint.textContent = 'Type a site like instagram.com'; return; }
    const res = await chrome.runtime.sendMessage({ type: 'addBlock', domain });
    if (res && res.ok) { el.input.value = ''; el.addHint.textContent = domain + ' is now blocked.'; render(); }
    else if (res && res.error === 'free-limit') el.addHint.textContent = 'Free tier is ' + HB.FREE_LIMIT + ' sites. Go Pro in Settings › Account.';
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
