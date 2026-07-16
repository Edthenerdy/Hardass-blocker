importScripts('common.js');

const REBLOCK_PREFIX = 'reblock:';
const SYNC_ALARM = 'syncManaged';
const WATCHDOG_ALARM = 'watchdog';
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
  state.blocklist.push({ domain, ruleId: nextRuleId(state), addedAt: Date.now() });
  await HB.set({ blocklist: state.blocklist });
  await applyRules();
  return { ok: true, domain };
}

async function removeBlock(rawDomain) {
  const state = await HB.get();
  if (HB.isManaged(state) && state.policy && state.policy.enforcement === 'locked') return { ok: false, error: 'managed' };
  const domain = HB.normalizeDomain(rawDomain);
  if (!state.blocklist.some(b => b.domain === domain)) return { ok: true };
  state.blocklist = state.blocklist.filter(b => b.domain !== domain);
  delete state.cooldowns[domain];
  delete state.allowances[domain];
  await chrome.alarms.clear(REBLOCK_PREFIX + domain);
  await HB.set({ blocklist: state.blocklist, cooldowns: state.cooldowns, allowances: state.allowances });
  await applyRules();
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
  state.relapseLog.push({ domain, ts: Date.now(), reason: reason.trim().slice(0, 300), grantedMin: mins });
  if (state.relapseLog.length > 500) state.relapseLog = state.relapseLog.slice(-500); // bound local storage
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

/* ---------------- lifecycle ---------------- */

async function ensureAlarms() {
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 });
  const state = await HB.get();
  if (HB.isManaged(state)) await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === WATCHDOG_ALARM) verifyAndHeal();
  else if (alarm.name === SYNC_ALARM) syncManaged();
  else if (alarm.name.startsWith(REBLOCK_PREFIX)) reblock(alarm.name.slice(REBLOCK_PREFIX.length));
});

chrome.runtime.onInstalled.addListener(async details => {
  const state = await HB.get();
  if (details.reason === 'install' && !HB.isManaged(state)) {
    for (const d of ['instagram.com', 'facebook.com', 'reddit.com', 'x.com', 'youtube.com']) await addBlock(d);
    // First-run: open the welcome page so the user understands the Cooldown
    // and can adjust the starter blocklist. Individual installs only.
    try { chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }); } catch (e) { /* no tabs access */ }
  }
  await ensureAlarms();
  if (HB.isManaged(state)) await syncManaged(); else await applyRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  const state = await HB.get();
  if (HB.isManaged(state)) await syncManaged(); else await applyRules();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'getState': return sendResponse({ ok: true, state: await HB.get() });
        case 'addBlock': return sendResponse(await addBlock(msg.domain));
        case 'removeBlock': return sendResponse(await removeBlock(msg.domain));
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
        default: return sendResponse({ ok: false, error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
