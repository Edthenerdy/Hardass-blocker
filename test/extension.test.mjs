// Individual-mode logic tests for the Holdfast extension.
// Loads background.js + common.js in a mock-Chrome sandbox and exercises the
// real block / cooldown / allowance / re-block / self-heal paths.
//   Run:  node test/extension.test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXT = fileURLToPath(new URL('../extension/', import.meta.url));

const store = {};
let dnr = [];
const alarmStore = {};
const L = { onInstalled: null, onStartup: null, onMessage: null, onAlarm: null };

const chrome = {
  storage: {
    local: {
      get: async (k) => (k == null ? { ...store } : (() => { const o = {}; (Array.isArray(k) ? k : [k]).forEach(x => x in store && (o[x] = store[x])); return o; })()),
      set: async (patch) => { Object.assign(store, patch); },
    },
  },
  declarativeNetRequest: {
    getDynamicRules: async () => dnr.slice(),
    updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
      dnr = dnr.filter(r => !removeRuleIds.includes(r.id)).concat(addRules);
    },
  },
  alarms: {
    create: async (n, o) => { alarmStore[n] = o || {}; },
    clear: async (n) => { delete alarmStore[n]; },
    onAlarm: { addListener: (fn) => { L.onAlarm = fn; } },
  },
  runtime: {
    onInstalled: { addListener: (fn) => { L.onInstalled = fn; } },
    onStartup: { addListener: (fn) => { L.onStartup = fn; } },
    onMessage: { addListener: (fn) => { L.onMessage = fn; } },
    getURL: (p) => 'chrome-extension://test/' + p,
  },
  tabs: { create: async () => {} },
};

const sandbox = { chrome, fetch: async () => ({ json: async () => ({}) }), console, structuredClone, setTimeout, clearTimeout, Date, Math, Set, Map, JSON, Object, Array, String, Number, encodeURIComponent, Promise, Error };
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);
sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(EXT + f, 'utf8'), ctx, { filename: f });
vm.runInContext(fs.readFileSync(EXT + 'background.js', 'utf8'), ctx, { filename: 'background.js' });

const HB = sandbox.HB;
const msg = (type, extra) => new Promise(res => { L.onMessage(Object.assign({ type }, extra || {}), {}, res); });
const fireAlarm = async (name) => { L.onAlarm({ name }); await new Promise(r => setTimeout(r, 50)); };
const blockRuleFor = (d) => dnr.find(r => r.condition.urlFilter === '||' + d + '^');

let pass = 0, fail = 0; const bugs = [];
const ck = (n, c, d) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, '::', d); bugs.push(n); } };

await L.onInstalled({ reason: 'install' });
await new Promise(r => setTimeout(r, 50));
const defaults = ['instagram.com', 'facebook.com', 'reddit.com', 'x.com', 'youtube.com'];
ck('install seeds 5 default blocks', defaults.every(d => (store.blocklist || []).some(b => b.domain === d)));
ck('install applies a block rule per default', defaults.every(d => blockRuleFor(d)));
ck('bypass rules present', dnr.filter(r => (r.action.redirect.extensionPath || '').includes('x=1')).length === HB.BYPASS_DOMAINS.length);

let r = await msg('addBlock', { domain: 'https://www.Example.com/path?q=1' });
ck('addBlock normalizes + adds', r.ok && r.domain === 'example.com' && !!blockRuleFor('example.com'));
const beforeCount = store.blocklist.length;
await msg('addBlock', { domain: 'example.com' });
ck('addBlock dedupes', store.blocklist.length === beforeCount);

r = await msg('grantAllowance', { domain: 'example.com', reason: 'a legitimate long reason here' });
ck('grantAllowance without cooldown -> error', !r.ok && r.error === 'cooldown-not-done');
await msg('startCooldown', { domain: 'example.com' });
ck('startCooldown sets future endsAt', store.cooldowns['example.com'].endsAt > Date.now());
store.cooldowns['example.com'].endsAt = Date.now() - 1000;
r = await msg('grantAllowance', { domain: 'example.com', reason: 'short' });
ck('grantAllowance short reason -> error', !r.ok && r.error === 'reason-too-short');
r = await msg('grantAllowance', { domain: 'example.com', reason: 'because I genuinely need it for work' });
ck('grantAllowance success', r.ok && r.expiresAt > Date.now());
ck('granted domain unblocked (rule gone)', !blockRuleFor('example.com'));
ck('cooldown cleared after grant', !store.cooldowns['example.com']);
ck('relapse logged with reason', (store.relapseLog || []).some(x => x.domain === 'example.com' && x.reason.includes('genuinely')));
ck('reblock alarm scheduled', !!alarmStore['reblock:example.com']);

await fireAlarm('reblock:example.com');
ck('reblock re-adds block rule', !!blockRuleFor('example.com'));
ck('allowance cleared after reblock', !(store.allowances && store.allowances['example.com']));

dnr = [];
await fireAlarm('watchdog');
ck('watchdog self-heals wiped rules', defaults.every(d => blockRuleFor(d)) && !!blockRuleFor('example.com'));

r = await msg('removeBlock', { domain: 'example.com' });
ck('removeBlock removes rule + entry', r.ok && !blockRuleFor('example.com') && !store.blocklist.some(b => b.domain === 'example.com'));

const stats = HB.relapseStats(store.relapseLog, 'example.com', Date.now());
ck('relapseStats counts the relapse', stats.allTime >= 1 && stats.thisWeek >= 1);
ck('normalizeDomain strips scheme/www/path', HB.normalizeDomain('HTTPS://WWW.Foo.com/bar') === 'foo.com');
ck('normalizeDomain empty', HB.normalizeDomain('   ') === '');

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
