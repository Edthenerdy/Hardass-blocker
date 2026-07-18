(function () {
  const el = {
    list: document.getElementById('list'),
    site: document.getElementById('site'),
    add: document.getElementById('add'),
    hint: document.getElementById('hint'),
    start: document.getElementById('start')
  };

  async function render() {
    const state = await HB.get();
    const sorted = [...(state.blocklist || [])].sort((a, b) => a.domain.localeCompare(b.domain));
    el.list.innerHTML = '';
    if (!sorted.length) {
      const p = document.createElement('div');
      p.className = 'site'; p.style.color = 'var(--ash)'; p.style.padding = '9px 0';
      p.textContent = 'Nothing blocked yet — add a site below.';
      el.list.appendChild(p);
      return;
    }
    for (const entry of sorted) {
      const row = document.createElement('div'); row.className = 'row';
      const site = document.createElement('span'); site.className = 'site'; site.textContent = entry.domain;
      const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = 'Remove';
      rm.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'removeBlock', domain: entry.domain });
        render();
      });
      row.append(site, rm);
      el.list.appendChild(row);
    }
  }

  async function add() {
    const domain = HB.normalizeDomain(el.site.value);
    if (!domain) { el.hint.textContent = 'Type a site like tiktok.com'; return; }
    const res = await chrome.runtime.sendMessage({ type: 'addBlock', domain });
    if (res && res.ok) { el.site.value = ''; el.hint.textContent = domain + ' is now blocked.'; render(); }
    else el.hint.textContent = 'Could not block that.';
  }

  el.add.addEventListener('click', add);
  el.site.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  // P0.4: let the user see the Cooldown once, calmly, before temptation ever hits.
  const tryIt = document.getElementById('tryIt');
  if (tryIt) tryIt.addEventListener('click', (e) => {
    e.preventDefault();
    try { chrome.tabs.create({ url: chrome.runtime.getURL('blocked.html?d=instagram.com&preview=1') }); }
    catch (err) { location.href = 'blocked.html?d=instagram.com&preview=1'; }
  });
  // Chrome won't let window.close() close a tab it didn't open (welcome is opened
  // via chrome.tabs.create), so close the current tab through the tabs API,
  // falling back to window.close() where that isn't available.
  el.start.addEventListener('click', () => {
    try {
      if (chrome.tabs && chrome.tabs.getCurrent) {
        chrome.tabs.getCurrent(tab => {
          if (tab && tab.id != null && chrome.tabs.remove) chrome.tabs.remove(tab.id);
          else window.close();
        });
      } else window.close();
    } catch (e) { window.close(); }
  });

  render();
})();
