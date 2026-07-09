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
    team: null,
    policy: null,
    account: null
  },

  FREE_LIMIT: 5,

  isManaged(state) {
    return !!(state && state.team && state.team.deviceToken);
  },

  isPro(state) {
    return !!(state && state.account && state.account.plan === 'pro');
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
      relapseLog: stored.relapseLog || []
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
  }
};

if (typeof self !== 'undefined') self.HB = HB;
