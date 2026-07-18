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
const defaults = ['instagram.com', 'youtube.com', 'x.com'];
ck('install seeds 3 default blocks (leaves free-tier headroom)', defaults.every(d => (store.blocklist || []).some(b => b.domain === d)) && store.blocklist.length === 3);
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

// ===== time saved: logBlock + dedup + timeSavedStats =====
store.blockLog = [];
await msg('logBlock', { domain: 'instagram.com' });
ck('logBlock records a blocked visit', (store.blockLog || []).length === 1, 'len=' + (store.blockLog || []).length);
await msg('logBlock', { domain: 'instagram.com' });
ck('logBlock dedupes same domain within 10 min', store.blockLog.length === 1, 'len=' + store.blockLog.length);
await msg('logBlock', { domain: 'youtube.com' });
ck('logBlock records a different domain', store.blockLog.length === 2, 'len=' + store.blockLog.length);
// simulate an older block outside the dedup window
store.blockLog.push({ domain: 'x.com', ts: Date.now() - 8 * 24 * 3600e3 });
const saved = HB.timeSavedStats(store.blockLog, Date.now());
ck('timeSavedStats: all-time = blocks x 15 min', saved.allMin === 3 * HB.MIN_PER_BLOCK, 'allMin=' + saved.allMin);
ck('timeSavedStats: this-week excludes the 8-day-old block', saved.weekMin === 2 * HB.MIN_PER_BLOCK, 'weekMin=' + saved.weekMin);

// ===== P0.1 streak: "days held" =====
ck('install anchors the streak (installedAt set)', !!(store.meta && store.meta.installedAt));
const NOW = Date.now(), DAY = 86400000;
ck('daysHeld: 3.5 days since anchor -> current 3', HB.daysHeld({ installedAt: NOW - 3.5 * DAY }, NOW).current === 3);
ck('daysHeld: lastCaveTs wins over installedAt', HB.daysHeld({ installedAt: NOW - 30 * DAY, lastCaveTs: NOW - 5 * DAY, bestDaysHeld: 2 }, NOW).current === 5);
ck('daysHeld: best tops up from current', HB.daysHeld({ installedAt: NOW - 9 * DAY, bestDaysHeld: 4 }, NOW).best === 9);
// cave banks the run and resets the anchor
await msg('addBlock', { domain: 'p0test.com' });
store.meta.lastCaveTs = NOW - 6 * DAY; store.meta.bestDaysHeld = 2;
await msg('startCooldown', { domain: 'p0test.com' });
store.cooldowns['p0test.com'].endsAt = Date.now() - 1;
await msg('grantAllowance', { domain: 'p0test.com', reason: 'testing the streak reset here' });
ck('cave banks best (6 held > old best 2)', store.meta.bestDaysHeld >= 6, 'best=' + store.meta.bestDaysHeld);
ck('cave resets current streak to 0', HB.daysHeld(store.meta, Date.now()).current === 0);
// ===== P0.3 post-cave reassure flag =====
await fireAlarm('reblock:p0test.com');
ck('reblock sets the one-time reassure flag', store.meta.pendingReassure === 'p0test.com', 'flag=' + store.meta.pendingReassure);
// ===== helpers =====
ck('fmtMinutes: 210 -> "3h 30m"', HB.fmtMinutes(210) === '3h 30m', HB.fmtMinutes(210));
ck('fmtMinutes: 45 -> "45m"', HB.fmtMinutes(45) === '45m', HB.fmtMinutes(45));

// ===== P1 freemium: the free wall =====
// fill up to the cap (3 seeds + p0test = 4 at this point)
while (store.blocklist.length < HB.FREE_MAX_SITES) await msg('addBlock', { domain: 'filler' + store.blocklist.length + '.com' });
ck('precondition: at the free cap', store.blocklist.length === HB.FREE_MAX_SITES, 'len=' + store.blocklist.length);
let r6 = await msg('addBlock', { domain: 'sixth-site.com' });
ck('6th site on free tier -> free-limit', !r6.ok && r6.error === 'free-limit', JSON.stringify(r6));
store.pro = { serverUrl: 'https://x', email: 'e@x.com', token: 't', active: true, plan: 'pro', checkedAt: Date.now() };
r6 = await msg('addBlock', { domain: 'sixth-site.com' });
ck('Pro removes the cap', r6.ok === true, JSON.stringify(r6));
store.pro.checkedAt = Date.now() - 72 * 3600e3; // stale beyond the 48h grace
r6 = await msg('addBlock', { domain: 'seventh-site.com' });
ck('stale entitlement (>48h) falls back to free', !r6.ok && r6.error === 'free-limit', JSON.stringify(r6));
ck('isPro: active within grace', HB.isPro({ pro: { active: true, checkedAt: Date.now() } }) === true);
ck('isPro: inactive plan is not Pro', HB.isPro({ pro: { active: false, checkedAt: Date.now() } }) === false);
store.pro = null;

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
