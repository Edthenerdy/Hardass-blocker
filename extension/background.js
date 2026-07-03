importScripts('common.js');

const REBLOCK_PREFIX = 'reblock:';

function buildRule(domain, ruleId) {
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/blocked.html?d=' + encodeURIComponent(domain) }
    },
    condition: {
      urlFilter: '||' + domain + '^',
      resourceTypes: ['main_frame']
    }
  };
}

function nextRuleId(state) {
  const ids = state.blocklist.map(b => b.ruleId);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

async function applyRule(domain, ruleId) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [buildRule(domain, ruleId)],
    removeRuleIds: [ruleId]
  });
}

async function clearRule(ruleId) {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
}

async function addBlock(rawDomain) {
  const domain = HB.normalizeDomain(rawDomain);
  if (!domain) return { ok: false, error: 'empty' };
  const state = await HB.get();
  if (state.blocklist.some(b => b.domain === domain)) return { ok: true, domain };
  const ruleId = nextRuleId(state);
  await applyRule(domain, ruleId);
  state.blocklist.push({ domain, ruleId, addedAt: Date.now() });
  await HB.set({ blocklist: state.blocklist });
  return { ok: true, domain };
}

async function removeBlock(rawDomain) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  const entry = state.blocklist.find(b => b.domain === domain);
  if (!entry) return { ok: true };
  await clearRule(entry.ruleId);
  state.blocklist = state.blocklist.filter(b => b.domain !== domain);
  delete state.cooldowns[domain];
  delete state.allowances[domain];
  await chrome.alarms.clear(REBLOCK_PREFIX + domain);
  await HB.set({
    blocklist: state.blocklist,
    cooldowns: state.cooldowns,
    allowances: state.allowances
  });
  return { ok: true };
}

async function startCooldown(rawDomain) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  if (!state.blocklist.some(b => b.domain === domain)) return { ok: false, error: 'not-blocked' };
  const existing = state.cooldowns[domain];
  if (existing && existing.endsAt > Date.now()) {
    return { ok: true, endsAt: existing.endsAt };
  }
  const endsAt = Date.now() + state.settings.cooldownMinutes * 60000;
  state.cooldowns[domain] = { startedAt: Date.now(), endsAt };
  await HB.set({ cooldowns: state.cooldowns });
  return { ok: true, endsAt };
}

async function grantAllowance(rawDomain, reason) {
  const domain = HB.normalizeDomain(rawDomain);
  const state = await HB.get();
  const entry = state.blocklist.find(b => b.domain === domain);
  if (!entry) return { ok: false, error: 'not-blocked' };

  const cd = state.cooldowns[domain];
  if (!cd || cd.endsAt > Date.now()) return { ok: false, error: 'cooldown-not-done' };
  if (!reason || reason.trim().length < state.settings.minReasonChars) {
    return { ok: false, error: 'reason-too-short' };
  }

  const mins = state.settings.allowanceMinutes;
  const expiresAt = Date.now() + mins * 60000;

  await clearRule(entry.ruleId);
  state.allowances[domain] = expiresAt;
  delete state.cooldowns[domain];
  state.relapseLog.push({ domain, ts: Date.now(), reason: reason.trim(), grantedMin: mins });

  await HB.set({
    allowances: state.allowances,
    cooldowns: state.cooldowns,
    relapseLog: state.relapseLog
  });
  await chrome.alarms.create(REBLOCK_PREFIX + domain, { when: expiresAt });
  return { ok: true, expiresAt, domain };
}

async function reblock(domain) {
  const state = await HB.get();
  delete state.allowances[domain];
  await HB.set({ allowances: state.allowances });
  const entry = state.blocklist.find(b => b.domain === domain);
  if (entry) await applyRule(entry.domain, entry.ruleId);
}

async function resyncRules() {
  const state = await HB.get();
  const now = Date.now();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);
  const addRules = state.blocklist
    .filter(b => !(state.allowances[b.domain] && state.allowances[b.domain] > now))
    .map(b => buildRule(b.domain, b.ruleId));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith(REBLOCK_PREFIX)) {
    reblock(alarm.name.slice(REBLOCK_PREFIX.length));
  }
});

chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    for (const d of ['instagram.com', 'facebook.com', 'reddit.com', 'x.com', 'youtube.com']) {
      await addBlock(d);
    }
  } else {
    await resyncRules();
  }
});

chrome.runtime.onStartup.addListener(() => { resyncRules(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'addBlock': return sendResponse(await addBlock(msg.domain));
        case 'removeBlock': return sendResponse(await removeBlock(msg.domain));
        case 'startCooldown': return sendResponse(await startCooldown(msg.domain));
        case 'grantAllowance': return sendResponse(await grantAllowance(msg.domain, msg.reason));
        case 'resync': await resyncRules(); return sendResponse({ ok: true });
        default: return sendResponse({ ok: false, error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
