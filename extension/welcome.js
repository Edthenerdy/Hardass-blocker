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
  el.start.addEventListener('click', () => window.close());

  render();
})();
