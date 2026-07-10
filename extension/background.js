importScripts('common.js');

const REBLOCK_PREFIX = 'reblock:';
const REMOVE_PREFIX = 'finalizeremove:';
const SYNC_ALARM = 'syncManaged';
const WATCHDOG_ALARM = 'watchdog';
const ENTITLEMENT_ALARM = 'entitlement';
const ENTITLEMENT_GRACE = 3 * 24 * 60 * 60 * 1000;
const MANAGED_BASE = 10000;
const BYPASS_BASE = 20000;

/* ---------------- DNR rule builders ---------------- */

function redirectRule(domain, ruleId, extra) {
  return {
    id: ruleId,
    priority: 1,
    action: { type: 'redirect', redirect: { extensionPath: '/blocked.html?d=' + encodeURIComponent(domain) + (extra || '') } },
    condition: { urlFilter: '||' + domain + '^', resourceTypes: ['main_frame'] }
  };
}
function buildRule(domain, ruleId, managed) { return redirectRule(domain, ruleId, managed ? '&m=1' : ''); }
function buildBypassRule(domain, ruleId) { return redirectRule(domain, ruleId, '&x=1'); }

function nextRuleId(state) {
  const ids = state.blocklist.map(b => b.ruleId);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

/* ---------------- single source of truth for rules ---------------- */

function computeIntended(state) {
  const now = Date.now();
  let rules = [];
  if (HB.isManaged(state)) {
    const p = state.policy || { blocklist: [], allowances: [] };
    const allowed = new Set((p.allowances || []).filter(a => a.expiresAt > now).map(a => a.domain));
    rules = (p.blocklist || []).filter(d => !allowed.has(d)).map((d, i) => buildRule(d, MANAGED_BASE + i, true));
  } else {
    rules = state.blocklist
      .filter(b => !(state.allowances[b.domain] && state.allowances[b.domain] > now))
      .map(b => buildRule(b.domain, b.ruleId, false));
  }
  const blockBypass = HB.isManaged(state) ? true : (state.settings.blockBypass !== false);
  if (blockBypass) {
    rules = rules.concat(HB.BYPASS_DOMAINS.map((d, i) => buildBypassRule(d, BYPASS_BASE + i)));
  }
  return rules;
}

async function applyRules() {
  const state = await HB.get();
  const intended = computeIntended(state);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map(r => r.id),
    addRules: intended
  });
}

// The moat's self-heal: if the live rules no longer match what policy demands
// (cleared, tampered with, or lost after a crash), silently re-assert them.
async function verifyAndHeal() {
  const state = await HB.get();
  const intended = computeIntended(state);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const key = rs => rs.map(r => r.condition.urlFilter).sort().join('|');
  if (key(intended) !== key(current)) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: current.map(r => r.id), addRules: intended });
    return { ok: true, healed: true };
  }
  return { ok: true, healed: false };
}

/* ---------------- individual (unmanaged) mode ---------------- */

async function addBlock(rawDomain) {
  const state = await HB.get();
  if (HB.isManaged(state) && state.policy && state.policy.enforcement === 'locked') return { ok: false, error: 'managed' };
  const domain = HB.normalizeDomain(rawDomain);
  if (!domain) return { ok: false, error: 'empty' };
  if (state.blocklist.some(b => b.domain === domain)) return { ok: true, domain };
  if (!HB.isManaged(state) && !HB.isPro(state) && state.blocklist.length >= HB.FREE_LIMIT) {
    return { ok: false, error: 'free-limit' };
  }
  state.blocklist.push({ domain, ruleId: nextRuleId(state), addedAt: Date.now() });
  await HB.set({ blocklist: state.blocklist });
  await applyRules();
  return { ok: true, domain };
}

// Removing a site does NOT grant instant access. It starts a mandatory removal
// cooldown during which the site STAYS blocked; only when the timer elapses is
// the site actually removed. This is the hard block — you can't just open the
// popup, hit remove, and get in.
async function removeBlock(rawDomain) {
  const state = await HB.get();
  if (HB.isManaged(state) && state.policy && state.policy.enforcement === 'locked') return { ok: false, error: 'managed' };
  const domain = HB.normalizeDomain(rawDomain);
  if (!state.blocklist.some(b => b.domain === domain)) return { ok: true, removed: true };
  const existing = state.pendingRemovals[domain];
  if (existing && existing > Date.now()) return { ok: true, pending: true, removeAt: existing };
  const removeAt = Date.now() + state.settings.cooldownMinutes * 60000;
  state.pendingRemovals[domain] = removeAt;
  await HB.set({ pendingRemovals: state.pendingRemovals });
  // Deliberately do NOT touch the DNR rule — the site remains blocked.
  await chrome.alarms.create(REMOVE_PREFIX + domain, { when: removeAt });
  return { ok: true, pending: true, removeAt };
}

// Fires when the removal cooldown elapses — only now is the site truly removed.
async function finalizeRemove(domain) {
  const state = await HB.get();
  state.blocklist = state.blocklist.filter(b => b.domain !== domain);
  delete state.cooldowns[domain];
  delete state.allowances[domain];
  delete state.pendingRemovals[domain];
  await chrome.alarms.clear(REBLOCK_PREFIX + domain);
  await HB.set({ blocklist: state.blocklist, cooldowns: state.cooldowns, allowances: state.allowances, pendingRemovals: state.pendingRemovals });
  await applyRules();
}

// Cancel a pending removal — the site simply stays blocked.
async function cancelRemoval(rawDomain) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  delete state.pendingRemovals[domain];
  await chrome.alarms.clear(REMOVE_PREFIX + domain);
  await HB.set({ pendingRemovals: state.pendingRemovals });
  return { ok: true };
}

async function startCooldown(rawDomain) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  if (!state.blocklist.some(b => b.domain === domain)) return { ok: false, error: 'not-blocked' };
  const existing = state.cooldowns[domain];
  if (existing && existing.endsAt > Date.now()) return { ok: true, endsAt: existing.endsAt };
  const endsAt = Date.now() + state.settings.cooldownMinutes * 60000;
  state.cooldowns[domain] = { startedAt: Date.now(), endsAt };
  await HB.set({ cooldowns: state.cooldowns });
  return { ok: true, endsAt };
}

async function grantAllowance(rawDomain, reason) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  if (!state.blocklist.some(b => b.domain === domain)) return { ok: false, error: 'not-blocked' };
  const cd = state.cooldowns[domain];
  if (!cd || cd.endsAt > Date.now()) return { ok: false, error: 'cooldown-not-done' };
  if (!reason || reason.trim().length < state.settings.minReasonChars) return { ok: false, error: 'reason-too-short' };
  const mins = state.settings.allowanceMinutes;
  const expiresAt = Date.now() + mins * 60000;
  state.allowances[domain] = expiresAt;
  delete state.cooldowns[domain];
  state.relapseLog.push({ domain, ts: Date.now(), reason: reason.trim(), grantedMin: mins });
  await HB.set({ allowances: state.allowances, cooldowns: state.cooldowns, relapseLog: state.relapseLog });
  await applyRules();
  await chrome.alarms.create(REBLOCK_PREFIX + domain, { when: expiresAt });
  return { ok: true, expiresAt, domain };
}

async function reblock(domain) {
  const state = await HB.get();
  if (HB.isManaged(state)) return;
  delete state.allowances[domain];
  await HB.set({ allowances: state.allowances });
  await applyRules();
}

/* ---------------- managed (team) mode ---------------- */

function baseUrl(team) { return String(team.serverUrl || '').replace(/\/+$/, ''); }

async function serverFetch(path, opts) {
  const { team } = await HB.get();
  if (!team) throw new Error('not-managed');
  opts = opts || {};
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + team.deviceToken }, opts.headers || {});
  const res = await fetch(baseUrl(team) + path, opts);
  return res.json();
}

async function syncManaged() {
  const state = await HB.get();
  if (!HB.isManaged(state)) return { ok: false, error: 'not-managed' };
  let j;
  try { j = await serverFetch('/api/device/policy', { method: 'GET' }); }
  catch (e) { return { ok: false, error: 'offline' }; }
  if (!j.ok) return j;
  await HB.set({ policy: j.policy });
  await applyRules();
  return { ok: true, policy: j.policy };
}

async function enrollTeam(serverUrl, code, deviceName) {
  serverUrl = String(serverUrl || '').replace(/\/+$/, '');
  if (!serverUrl) return { ok: false, error: 'no server url' };
  let j;
  try {
    const res = await fetch(serverUrl + '/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceName }) });
    j = await res.json();
  } catch (e) { return { ok: false, error: 'cannot reach server' }; }
  if (!j.ok) return j;
  await HB.set({ team: { serverUrl, deviceToken: j.deviceToken, deviceId: j.device.id }, policy: j.policy });
  await applyRules();
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
  return { ok: true, policy: j.policy };
}

async function leaveTeam() {
  const state = await HB.get();
  if (state.policy && state.policy.enforcement === 'locked') return { ok: false, error: 'locked' };
  await chrome.alarms.clear(SYNC_ALARM);
  await HB.set({ team: null, policy: null });
  await applyRules();
  return { ok: true };
}

async function requestAccess(domain, reason, requestedMin) {
  try { return await serverFetch('/api/device/requests', { method: 'POST', body: JSON.stringify({ domain: HB.normalizeDomain(domain), reason, requestedMin }) }); }
  catch (e) { return { ok: false, error: 'offline' }; }
}
async function pollRequests() {
  try { return await serverFetch('/api/device/requests', { method: 'GET' }); }
  catch (e) { return { ok: false, error: 'offline' }; }
}
async function selfGrantManaged(domain, reason) {
  let j;
  try { j = await serverFetch('/api/device/selfgrant', { method: 'POST', body: JSON.stringify({ domain: HB.normalizeDomain(domain), reason }) }); }
  catch (e) { return { ok: false, error: 'offline' }; }
  if (j.ok) await syncManaged();
  return j;
}
async function telemetry(domain, event) {
  try { await serverFetch('/api/device/telemetry', { method: 'POST', body: JSON.stringify({ domain: HB.normalizeDomain(domain), type: event === 'allowed' ? 'allowed' : 'blocked' }) }); }
  catch (e) { /* offline: ignore */ }
}

/* ---------------- consumer entitlement (server-signed) ---------------- */

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function verifyEntitlement(token, jwk) {
  try {
    const [p, sig] = String(token).split('.');
    if (!p || !sig || !jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBytes(sig), new TextEncoder().encode(p));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

// Fetch a fresh signed entitlement and verify it locally. A tampered storage flag
// has no valid signature, so it resolves to 'free'. If the server is unreachable
// but we verified recently, keep the prior plan until the grace window lapses.
async function refreshEntitlement() {
  const state = await HB.get();
  const a = state.account;
  if (!a || !a.userToken) return { ok: false, error: 'no-account' };
  const base = String(a.serverUrl || '').replace(/\/+$/, '');
  let jwk = a.pubkeyJwk;
  try { if (!jwk) { const r = await (await fetch(base + '/api/entitlement/pubkey')).json(); if (r.ok) jwk = r.jwk; } } catch (e) { /* offline */ }
  let token = null;
  try { const s = await (await fetch(base + '/api/billing/status', { headers: { 'Authorization': 'Bearer ' + a.userToken } })).json(); if (s.ok) token = s.entitlement; } catch (e) { /* offline */ }

  let plan = 'free', verifiedAt = null;
  if (token && jwk) { const payload = await verifyEntitlement(token, jwk); if (payload) { plan = payload.plan; verifiedAt = Date.now(); } }
  if (!verifiedAt && a.verifiedAt && (Date.now() - a.verifiedAt < ENTITLEMENT_GRACE)) { plan = a.plan || 'free'; verifiedAt = a.verifiedAt; }

  const account = Object.assign({}, a, { plan, entitlement: token || a.entitlement, pubkeyJwk: jwk || a.pubkeyJwk, verifiedAt });
  await HB.set({ account });
  return { ok: true, plan, verified: !!verifiedAt };
}

/* ---------------- lifecycle ---------------- */

async function ensureAlarms() {
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 });
  await chrome.alarms.create(ENTITLEMENT_ALARM, { periodInMinutes: 60 });
  const state = await HB.get();
  if (HB.isManaged(state)) await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === WATCHDOG_ALARM) verifyAndHeal();
  else if (alarm.name === SYNC_ALARM) syncManaged();
  else if (alarm.name === ENTITLEMENT_ALARM) refreshEntitlement();
  else if (alarm.name.startsWith(REMOVE_PREFIX)) finalizeRemove(alarm.name.slice(REMOVE_PREFIX.length));
  else if (alarm.name.startsWith(REBLOCK_PREFIX)) reblock(alarm.name.slice(REBLOCK_PREFIX.length));
});

chrome.runtime.onInstalled.addListener(async details => {
  const state = await HB.get();
  if (details.reason === 'install' && !HB.isManaged(state)) {
    for (const d of ['instagram.com', 'facebook.com', 'reddit.com', 'x.com', 'youtube.com']) await addBlock(d);
  }
  await ensureAlarms();
  if (HB.isManaged(state)) await syncManaged(); else await applyRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  const state = await HB.get();
  if (HB.isManaged(state)) await syncManaged(); else await applyRules();
  refreshEntitlement();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'getState': return sendResponse({ ok: true, state: await HB.get() });
        case 'addBlock': return sendResponse(await addBlock(msg.domain));
        case 'removeBlock': return sendResponse(await removeBlock(msg.domain));
        case 'cancelRemoval': return sendResponse(await cancelRemoval(msg.domain));
        case 'startCooldown': return sendResponse(await startCooldown(msg.domain));
        case 'grantAllowance': return sendResponse(await grantAllowance(msg.domain, msg.reason));
        case 'enrollTeam': return sendResponse(await enrollTeam(msg.serverUrl, msg.code, msg.deviceName));
        case 'leaveTeam': return sendResponse(await leaveTeam());
        case 'syncNow': return sendResponse(await syncManaged());
        case 'requestAccess': return sendResponse(await requestAccess(msg.domain, msg.reason, msg.requestedMin));
        case 'pollRequests': return sendResponse(await pollRequests());
        case 'selfGrantManaged': return sendResponse(await selfGrantManaged(msg.domain, msg.reason));
        case 'telemetry': await telemetry(msg.domain, msg.event); return sendResponse({ ok: true });
        case 'applyRules': await applyRules(); return sendResponse({ ok: true });
        case 'refreshEntitlement': return sendResponse(await refreshEntitlement());
        default: return sendResponse({ ok: false, error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
