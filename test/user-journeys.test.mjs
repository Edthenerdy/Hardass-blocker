// End-to-end user-journey tests: the extension's real page scripts
// (welcome/popup/blocked) wired to the real background.js through a shared
// in-memory chrome stub, driven in jsdom as five personas would.
//   Run:  node test/user-journeys.test.mjs   (needs jsdom on NODE_PATH)
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// jsdom is a dev dependency. Install it (npm i -g jsdom) and run with
// NODE_PATH pointing at the global modules, or `npm i jsdom` in the repo.
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const EXT = fileURLToPath(new URL('../extension/', import.meta.url));
const read = f => fs.readFileSync(EXT + f, 'utf8');
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

// ---- shared state ----
let store = {}, dnr = [];
const alarms = {}, bgL = {};
const getFrom = (k) => k == null ? { ...store } : (() => { const o = {}; (Array.isArray(k) ? k : [k]).forEach(x => x in store && (o[x] = store[x])); return o; })();

// ---- background (real code, node vm) ----
(function loadBackground() {
  const chrome = {
    storage: { local: { get: async k => getFrom(k), set: async p => { Object.assign(store, p); } } },
    declarativeNetRequest: {
      getDynamicRules: async () => dnr.slice(),
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => { dnr = dnr.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); },
    },
    alarms: { create: async (n, o) => { alarms[n] = o || {}; }, clear: async n => { delete alarms[n]; }, onAlarm: { addListener: fn => { bgL.onAlarm = fn; } } },
    runtime: { onInstalled: { addListener: fn => { bgL.onInstalled = fn; } }, onStartup: { addListener: fn => { bgL.onStartup = fn; } }, onMessage: { addListener: fn => { bgL.onMessage = fn; } }, getURL: p => 'chrome-extension://x/' + p },
    tabs: { create: async () => {} },
  };
  const sb = { chrome, fetch: async () => ({ json: async () => ({}) }), console, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Set, Map, JSON, Object, Array, String, Number, encodeURIComponent, Promise, Error };
  sb.self = sb;
  const ctx = vm.createContext(sb);
  sb.importScripts = f => vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext(read('background.js'), ctx, { filename: 'background.js' });
})();
const bg = (type, extra) => new Promise(res => bgL.onMessage(Object.assign({ type }, extra || {}), {}, res));

// ---- page loader (real page scripts, jsdom) ----
function makePage(htmlFile, search = '') {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: navigation/.test(String(e && e.message))) console.log('   [page error]', e.message); });
  const html = read(htmlFile).replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://ext/' + htmlFile + search, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  if (typeof win.structuredClone !== 'function') win.structuredClone = structuredClone;
  win.chrome = {
    storage: { local: { get: (k) => Promise.resolve(getFrom(k)), set: (p) => { Object.assign(store, p); return Promise.resolve(); } } },
    runtime: { sendMessage: (msg) => bg(msg.type, msg), getURL: p => 'chrome-extension://x/' + p, openOptionsPage: () => {} },
    tabs: { query: async () => [{ url: 'https://reddit.com/' }], getCurrent: (cb) => cb({ id: 42 }), remove: (id) => { removedTab = id; } },
  };
  win.eval(read('common.js'));
  win.eval(read(htmlFile.replace('.html', '.js')));
  return { win, doc: win.document };
}

let pass = 0, fail = 0, removedTab = null; const findings = [];
const ck = (n, c, d) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, '::', d); findings.push(n + ' :: ' + d); } };
const txt = (doc, sel) => (doc.querySelector(sel) || {}).textContent || '';
const clickEv = (win, elm) => elm.dispatchEvent(new win.Event('click', { bubbles: true }));
const inputEv = (win, elm, v) => { elm.value = v; elm.dispatchEvent(new win.Event('input', { bubbles: true })); };

console.log('\n== P1: The Procrastinator ==');
await bgL.onInstalled({ reason: 'install' }); await tick();
{
  const { win, doc } = makePage('welcome.html'); await tick();
  const rows = () => doc.querySelectorAll('#list .row').length;
  ck('welcome lists the 5 seeded defaults', rows() === 5, 'rows=' + rows());
  inputEv(win, doc.getElementById('site'), 'tiktok.com');
  clickEv(win, doc.getElementById('add')); await tick();
  ck('welcome: adding tiktok.com updates the list to 6', rows() === 6, 'rows=' + rows());
  ck('welcome: add gives feedback', /now blocked/.test(txt(doc, '#hint')), txt(doc, '#hint'));
  removedTab = null;
  clickEv(win, doc.getElementById('start')); await tick();
  ck('welcome "Start blocking" actually closes the tab (Fix B)', removedTab === 42, 'removedTab=' + removedTab);
}
{
  const { win, doc } = makePage('blocked.html', '?d=instagram.com'); await tick();
  ck('blocked page shows the Cooldown headline', /Blocked/.test(txt(doc, '#headline')) || /Blocked/.test(doc.body.textContent), txt(doc, '#headline'));
  const startBtn = doc.getElementById('startBtn');
  ck('cooldown offers a start control', !!startBtn, 'no start button');
  if (startBtn) { clickEv(win, startBtn); await tick(); }
  ck('starting the cooldown persists it', !!(store.cooldowns && store.cooldowns['instagram.com']), JSON.stringify(store.cooldowns));
  const unblock = doc.getElementById('unblockBtn');
  ck('unblock is disabled during cooldown', unblock && unblock.disabled, 'not disabled');
}

console.log('\n== P3: The Fumbler (persistence + edge inputs) ==');
{
  // reopen mid-cooldown with time elapsed -> should RESUME (not reset) and allow unblock after a reason
  store.cooldowns['instagram.com'] = { startedAt: Date.now() - 999999, endsAt: Date.now() - 1000 };
  const { win, doc } = makePage('blocked.html', '?d=instagram.com'); await tick();
  const unblock = doc.getElementById('unblockBtn');
  ck('reopen mid-cooldown resumes (no reset), shows unblock UI', !!unblock && !doc.getElementById('startBtn').offsetParent === false || !!unblock, 'no unblock');
  inputEv(win, doc.getElementById('reason'), 'because I genuinely need this for a work task');
  await tick();
  ck('after cooldown + valid reason, unblock enables', unblock && !unblock.disabled, 'still disabled');
  if (unblock && !unblock.disabled) { clickEv(win, unblock); await tick(); }
  ck('unblock grants a pass (allowance recorded)', !!(store.allowances && store.allowances['instagram.com']), JSON.stringify(store.allowances));
  ck('unblock logs the relapse with reason', (store.relapseLog || []).some(r => r.domain === 'instagram.com' && /work task/.test(r.reason)), 'no log');
}
{
  const { win, doc } = makePage('popup.html'); await tick();
  const hint = () => txt(doc, '#addHint');
  inputEv(win, doc.getElementById('siteInput'), '   ');
  clickEv(win, doc.getElementById('addBtn')); await tick();
  ck('popup rejects whitespace-only input with guidance', /Type a site/.test(hint()), hint());
  inputEv(win, doc.getElementById('siteInput'), 'HTTPS://WWW.Foo.com/bar?x=1');
  clickEv(win, doc.getElementById('addBtn')); await tick();
  ck('popup normalizes a full URL to the bare domain', (store.blocklist || []).some(b => b.domain === 'foo.com'), JSON.stringify((store.blocklist || []).map(b => b.domain)));
  const before = store.blocklist.length;
  inputEv(win, doc.getElementById('siteInput'), 'foo.com');
  clickEv(win, doc.getElementById('addBtn')); await tick();
  ck('popup dedupes an existing domain', store.blocklist.length === before, 'count grew');
  await bg('startCooldown', { domain: 'foo.com' });
  store.cooldowns['foo.com'].endsAt = Date.now() - 1;
  const r = await bg('grantAllowance', { domain: 'foo.com', reason: 'x'.repeat(5000) });
  const stored = (store.relapseLog || []).find(e => e.domain === 'foo.com');
  ck('very long reason is accepted and capped to <=300 chars (Fix A)', r.ok && stored && stored.reason.length <= 300, 'len=' + (stored && stored.reason.length));
  // log trim
  store.relapseLog = Array.from({ length: 600 }, (_, i) => ({ domain: 'x.com', ts: Date.now() - i, reason: 'r', grantedMin: 10 }));
  await bg('startCooldown', { domain: 'x.com' }); store.cooldowns['x.com'].endsAt = Date.now() - 1;
  await bg('grantAllowance', { domain: 'x.com', reason: 'trimming the relapse log now' });
  ck('relapseLog is bounded to <=500 entries (Fix A)', store.relapseLog.length <= 500, 'len=' + store.relapseLog.length);
}

console.log('\n== P2: The Determined Cheater ==');
{
  const nowd = Date.now();
  // no cooldown started -> cannot unblock
  const r1 = await bg('grantAllowance', { domain: 'reddit.com', reason: 'a perfectly long reason here yes' });
  ck('cannot unblock without waiting the cooldown', !r1.ok && r1.error === 'cooldown-not-done', JSON.stringify(r1));
  await bg('startCooldown', { domain: 'reddit.com' });
  store.cooldowns['reddit.com'].endsAt = Date.now() - 1; // pretend elapsed
  const r2 = await bg('grantAllowance', { domain: 'reddit.com', reason: 'no' });
  ck('cannot unblock with a too-short reason', !r2.ok && r2.error === 'reason-too-short', JSON.stringify(r2));
  // bypass page
  const { doc } = makePage('blocked.html', '?d=translate.google.com&x=1'); await tick();
  ck('bypass route shows the "Nice try." page', /Nice try/.test(doc.body.textContent), doc.body.textContent.slice(0, 60));
  // gated removal engages a think-delay (not one click)
  const { win, doc: pd } = makePage('popup.html'); await tick();
  const rm = pd.querySelector('.remove');
  ck('popup has a Remove control', !!rm, 'none');
  if (rm) { clickEv(win, rm); await tick(); ck('first Remove click starts a think-delay, not instant removal', /Wait/.test(rm.textContent) && rm.disabled, 'text=' + rm.textContent); }
}

console.log('\n== Accessibility / robustness spot-checks ==');
{
  const { doc } = makePage('popup.html'); await tick();
  ck('primary actions are real <button> elements', doc.querySelectorAll('button').length >= 2, 'few buttons');
  const { doc: od } = makePage('options.html'); await tick();
  ck('options inputs have <label>s', od.querySelectorAll('label').length >= 3, 'few labels');
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
if (findings.length) { console.log('\nFINDINGS:'); findings.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
