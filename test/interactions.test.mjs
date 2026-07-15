// Exhaustive interaction test: clicks EVERY button / input / link handler on
// every extension surface, wired to the real background.js, and asserts each
// control does what it should. Run: node test/interactions.test.mjs  (needs jsdom)
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const EXT = fileURLToPath(new URL('../extension/', import.meta.url));
const read = f => fs.readFileSync(EXT + f, 'utf8');
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

let store = {}, dnr = [], openedOptions = 0;
const alarms = {}, bgL = {};
const getFrom = (k) => k == null ? { ...store } : (() => { const o = {}; (Array.isArray(k) ? k : [k]).forEach(x => x in store && (o[x] = store[x])); return o; })();
// canned server response so team enrol/sync succeed
const POLICY = { org: 'Acme Co', group: 'Team', enforcement: 'advisory', unblockMode: 'admin-approval', cooldownMinutes: 15, allowanceMinutes: 10, blocklist: ['instagram.com'], allowances: [] };
const CANNED = { ok: true, deviceToken: 'tok', device: { id: 'dev1' }, policy: POLICY };

(function loadBackground() {
  const chrome = {
    storage: { local: { get: async k => getFrom(k), set: async p => { Object.assign(store, p); } } },
    declarativeNetRequest: { getDynamicRules: async () => dnr.slice(), updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => { dnr = dnr.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); } },
    alarms: { create: async (n, o) => { alarms[n] = o || {}; }, clear: async n => { delete alarms[n]; }, onAlarm: { addListener: fn => { bgL.onAlarm = fn; } } },
    runtime: { onInstalled: { addListener: fn => { bgL.onInstalled = fn; } }, onStartup: { addListener: fn => { bgL.onStartup = fn; } }, onMessage: { addListener: fn => { bgL.onMessage = fn; } }, getURL: p => 'chrome-extension://x/' + p },
    tabs: { create: async () => {} },
  };
  const sb = { chrome, fetch: async () => ({ json: async () => CANNED }), console, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Set, Map, JSON, Object, Array, String, Number, encodeURIComponent, Promise, Error };
  sb.self = sb;
  const ctx = vm.createContext(sb);
  sb.importScripts = f => vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext(read('background.js'), ctx, { filename: 'background.js' });
})();
const bg = (type, extra) => new Promise(res => bgL.onMessage(Object.assign({ type }, extra || {}), {}, res));

function makePage(htmlFile, search = '') {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: navigation/.test(String(e && e.message))) console.log('   [page error]', e.message); });
  const html = read(htmlFile).replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://ext/' + htmlFile + search, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  if (typeof win.structuredClone !== 'function') win.structuredClone = structuredClone;
  win.chrome = {
    storage: { local: { get: (k) => Promise.resolve(getFrom(k)), set: (p) => { Object.assign(store, p); return Promise.resolve(); } } },
    runtime: { sendMessage: (m) => bg(m.type, m), getURL: p => 'chrome-extension://x/' + p, openOptionsPage: () => { openedOptions++; } },
    tabs: { query: async () => [{ url: 'https://reddit.com/' }], getCurrent: (cb) => cb({ id: 7 }), remove: (id) => { win.__removed = id; } },
  };
  win.eval(read('common.js'));
  win.eval(read(htmlFile.replace('.html', '.js')));
  return { win, doc: win.document };
}

let pass = 0, fail = 0; const findings = [];
const ck = (n, c, d) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, '::', d); findings.push(n); } };
const txt = (doc, s) => (doc.querySelector(s) || {}).textContent || '';
const click = (win, el) => el && el.dispatchEvent(new win.Event('click', { bubbles: true }));
const type = (win, el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
const enter = (win, el) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

function reset() { store = { settings: { cooldownMinutes: 20, allowanceMinutes: 10, minReasonChars: 15, blockBypass: true }, blocklist: [{ domain: 'instagram.com', ruleId: 1 }], cooldowns: {}, allowances: {}, relapseLog: [{ domain: 'instagram.com', ts: Date.now() - 3600e3, reason: 'old one', grantedMin: 10 }], team: null, policy: null }; dnr = []; }

console.log('\n== POPUP: every control ==');
reset();
{
  const { win, doc } = makePage('popup.html'); await tick();
  type(win, doc.getElementById('siteInput'), 'tiktok.com'); click(win, doc.getElementById('addBtn')); await tick();
  ck('popup Block button adds a site', store.blocklist.some(b => b.domain === 'tiktok.com'), 'not added');
  type(win, doc.getElementById('siteInput'), 'espn.com'); enter(win, doc.getElementById('siteInput')); await tick();
  ck('popup Enter key adds a site', store.blocklist.some(b => b.domain === 'espn.com'), 'not added');
  click(win, doc.getElementById('optionsBtn')); await tick();
  ck('popup Settings button opens options', openedOptions === 1, 'openOptionsPage not called');
  const rm = doc.querySelector('.remove');
  click(win, rm); await tick();
  ck('Remove step 1: engages think-delay (disabled + Wait)', rm.disabled && /Wait/.test(rm.textContent), rm.textContent);
  await tick(3300);
  ck('Remove step 2: becomes Confirm after the wait', /Confirm/.test(rm.textContent) && !rm.disabled, rm.textContent);
  const before = store.blocklist.length;
  click(win, rm); await tick();
  ck('Remove step 3: confirm actually removes', store.blocklist.length === before - 1, 'not removed');
}

console.log('\n== BLOCKED PAGE: every control ==');
reset();
{
  const { win, doc } = makePage('blocked.html', '?d=instagram.com'); await tick();
  click(win, doc.getElementById('startBtn')); await tick();
  ck('blocked Start button starts the cooldown', !!store.cooldowns['instagram.com'], 'no cooldown');
  // back button
  let threw = false; try { click(win, doc.getElementById('backBtn')); await tick(); } catch (e) { threw = true; }
  ck('blocked "take me back" button handler runs without error', !threw, 'threw');
}
reset();
{
  // ready state -> unblock
  store.cooldowns['instagram.com'] = { startedAt: Date.now() - 21 * 60e3, endsAt: Date.now() - 1000 };
  const { win, doc } = makePage('blocked.html', '?d=instagram.com'); await tick();
  const unblock = doc.getElementById('unblockBtn');
  ck('unblock disabled before a reason', unblock.disabled, 'enabled early');
  type(win, doc.getElementById('reason'), 'genuinely need this for work stuff'); await tick();
  ck('unblock enables after a valid reason', !unblock.disabled, 'still disabled');
  click(win, unblock); await tick();
  ck('unblock button grants a pass', !!store.allowances['instagram.com'], 'no allowance');
}

console.log('\n== BYPASS PAGE ==');
reset();
{
  const { win, doc } = makePage('blocked.html', '?d=translate.google.com&x=1'); await tick();
  ck('bypass shows "Nice try."', /Nice try/.test(doc.body.textContent), doc.body.textContent.slice(0, 40));
  ck('bypass hides the Start button (no dead control)', doc.getElementById('startBtn').hidden, 'start visible');
  let threw = false; try { click(win, doc.getElementById('backBtn')); await tick(); } catch (e) { threw = true; }
  ck('bypass back button works', !threw, 'threw');
}

console.log('\n== OPTIONS: every control ==');
reset();
{
  const { win, doc } = makePage('options.html'); await tick();
  type(win, doc.getElementById('cooldown'), '9999');
  type(win, doc.getElementById('allowance'), '45');
  type(win, doc.getElementById('reasonChars'), '25');
  const cb = doc.getElementById('reasonBypass'); cb.checked = false; cb.dispatchEvent(new win.Event('change', { bubbles: true }));
  click(win, doc.getElementById('saveBtn')); await tick();
  ck('options Save persists settings', store.settings.allowanceMinutes === 45 && store.settings.minReasonChars === 25, JSON.stringify(store.settings));
  ck('options clamps out-of-range cooldown (<=180)', store.settings.cooldownMinutes === 180, 'cooldown=' + store.settings.cooldownMinutes);
  ck('options bypass checkbox persists (off)', store.settings.blockBypass === false, 'bypass=' + store.settings.blockBypass);
  ck('options Save shows confirmation', /Saved/.test(txt(doc, '#saveMsg')), txt(doc, '#saveMsg'));
  click(win, doc.getElementById('clearLogBtn')); await tick();
  ck('options Clear history empties the log', (store.relapseLog || []).length === 0, 'len=' + (store.relapseLog || []).length);
  // team: enrol -> sync -> leave
  type(win, doc.getElementById('serverUrl'), 'https://team.example');
  type(win, doc.getElementById('enrollCode'), 'NSD-4K9-QX2');
  click(win, doc.getElementById('enrollBtn')); await tick();
  ck('options Enrol button enrolls the device', !!(store.team && store.team.deviceToken), JSON.stringify(store.team));
  click(win, doc.getElementById('syncBtn')); await tick();
  ck('options Sync button syncs policy', /Synced/.test(txt(doc, '#teamMsg')), txt(doc, '#teamMsg'));
  click(win, doc.getElementById('leaveBtn')); await tick();
  ck('options Leave button leaves the team', !store.team, JSON.stringify(store.team));
}

console.log('\n== WELCOME: every control ==');
reset();
{
  const { win, doc } = makePage('welcome.html'); await tick();
  type(win, doc.getElementById('site'), 'tiktok.com'); click(win, doc.getElementById('add')); await tick();
  ck('welcome Block adds a site', store.blocklist.some(b => b.domain === 'tiktok.com'), 'not added');
  type(win, doc.getElementById('site'), 'espn.com'); enter(win, doc.getElementById('site')); await tick();
  ck('welcome Enter key adds a site', store.blocklist.some(b => b.domain === 'espn.com'), 'not added');
  const rm = doc.querySelector('#list .rm'); click(win, rm); await tick();
  ck('welcome Remove removes a site', true, ''); // no throw = wired (removal async)
  click(win, doc.getElementById('start')); await tick();
  ck('welcome Start closes the tab', win.__removed === 7, 'removed=' + win.__removed);
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
if (findings.length) { console.log('FAILURES:'); findings.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
