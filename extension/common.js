const HB = {
  DEFAULTS: {
    settings: {
      cooldownMinutes: 20,
      allowanceMinutes: 10,
      minReasonChars: 15,
      blockBypass: true
    },
    blocklist: [],
    allowances: {},
    cooldowns: {},
    relapseLog: [],
    blockLog: [],
    team: null,
    policy: null
  },

  // Rough minutes "saved" per blocked visit — powers the encouraging time-saved stat.
  MIN_PER_BLOCK: 15,

  isManaged(state) {
    return !!(state && state.team && state.team.deviceToken);
  },

  // Common ways people reach a blocked site without visiting it directly:
  // translation proxies, cached copies, archive mirrors, and public web proxies.
  // These are always blocked alongside the real blocklist so the block holds.
  BYPASS_DOMAINS: [
    'translate.goog',
    'translate.google.com',
    'webcache.googleusercontent.com',
    'web.archive.org',
    'archive.ph',
    'archive.today',
    'archive.is',
    '12ft.io',
    '1ft.io',
    'croxyproxy.com',
    'croxy.network',
    'proxysite.com',
    'proxyium.com',
    'blockaway.net',
    'hide.me'
  ],

  async get() {
    const stored = await chrome.storage.local.get(null);
    const base = structuredClone(HB.DEFAULTS);
    return {
      ...base,
      ...stored,
      settings: { ...base.settings, ...(stored.settings || {}) },
      allowances: { ...(stored.allowances || {}) },
      cooldowns: { ...(stored.cooldowns || {}) },
      blocklist: stored.blocklist || [],
      relapseLog: stored.relapseLog || [],
      blockLog: stored.blockLog || []
    };
  },

  async set(patch) {
    await chrome.storage.local.set(patch);
  },

  normalizeDomain(raw) {
    let s = (raw || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^[a-z]+:\/\//, '');
    s = s.split('/')[0].split('?')[0].split('#')[0];
    s = s.replace(/^www\./, '');
    return s;
  },

  relapseStats(relapseLog, domain, now) {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const forDomain = relapseLog.filter(r => r.domain === domain);
    const thisWeek = forDomain.filter(r => r.ts >= weekAgo);
    const totalGranted = forDomain.reduce((sum, r) => sum + (r.grantedMin || 0), 0);
    const avgGranted = forDomain.length ? Math.round(totalGranted / forDomain.length) : 0;
    const last = forDomain.length ? forDomain[forDomain.length - 1] : null;
    return {
      allTime: forDomain.length,
      thisWeek: thisWeek.length,
      avgGranted,
      lastTs: last ? last.ts : null
    };
  },

  // Encouraging counterpart to relapseStats: how much time the blocks (probably)
  // saved. Each blocked visit counts as MIN_PER_BLOCK minutes — this week + all-time.
  timeSavedStats(blockLog, now) {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const all = (blockLog || []).length;
    const week = (blockLog || []).filter(b => b.ts >= weekAgo).length;
    return { allCount: all, weekCount: week, allMin: all * HB.MIN_PER_BLOCK, weekMin: week * HB.MIN_PER_BLOCK };
  }
};

if (typeof self !== 'undefined') self.HB = HB;
