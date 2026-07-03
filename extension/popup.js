(function () {
  const el = {
    input: document.getElementById('siteInput'),
    addBtn: document.getElementById('addBtn'),
    addHint: document.getElementById('addHint'),
    list: document.getElementById('list'),
    count: document.getElementById('count'),
    empty: document.getElementById('empty'),
    optionsBtn: document.getElementById('optionsBtn')
  };

  async function currentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && /^https?:/.test(tab.url)) {
        return HB.normalizeDomain(tab.url);
      }
    } catch (e) { /* no access */ }
    return '';
  }

  async function render() {
    const state = await HB.get();
    const now = Date.now();
    el.list.innerHTML = '';
    const sorted = [...state.blocklist].sort((a, b) => a.domain.localeCompare(b.domain));
    el.count.textContent = String(sorted.length);
    el.empty.hidden = sorted.length > 0;

    for (const entry of sorted) {
      const li = document.createElement('li');

      const left = document.createElement('div');
      const site = document.createElement('span');
      site.className = 'site';
      site.textContent = entry.domain;
      left.appendChild(site);

      const allowedUntil = state.allowances[entry.domain];
      const status = document.createElement('span');
      status.className = 'status';
      if (allowedUntil && allowedUntil > now) {
        const mins = Math.ceil((allowedUntil - now) / 60000);
        status.textContent = 'open ' + mins + 'm';
      } else {
        status.textContent = 'blocked';
        status.classList.add('blocked');
      }
      left.appendChild(status);

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'removeBlock', domain: entry.domain });
        render();
      });

      li.append(left, remove);
      el.list.appendChild(li);
    }
  }

  async function add() {
    const raw = el.input.value;
    const domain = HB.normalizeDomain(raw);
    if (!domain) {
      el.addHint.textContent = 'Type a site like instagram.com';
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: 'addBlock', domain });
    if (res && res.ok) {
      el.input.value = '';
      el.addHint.textContent = domain + ' is now blocked.';
      render();
    } else {
      el.addHint.textContent = 'Could not block that.';
    }
  }

  el.addBtn.addEventListener('click', add);
  el.input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  el.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  (async () => {
    const d = await currentDomain();
    if (d) el.input.value = d;
    render();
  })();
})();
