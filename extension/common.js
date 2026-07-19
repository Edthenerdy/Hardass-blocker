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
    meta: { installedAt: null, lastCaveTs: null, bestDaysHeld: 0 },
    pro: null,
    team: null,
    policy: null
  },

  // Freemium: the free tier blocks up to this many sites. The Cooldown itself is
  // never gated — the aha moment stays free.
  FREE_MAX_SITES: 5,
  FREE_HISTORY_DAYS: 7,
  // The Holdfast Pro account/billing server. EMPTY until deployed — while empty,
  // the extension shows "Pro coming soon" instead of a broken sign-in form.
  // Set this to the deployed URL (e.g. https://app.holdfast.app) to open sign-ups.
  PRO_SERVER: '',
  // Where "Upgrade" goes before the account server is configured (landing pricing).
  UPGRADE_FALLBACK: 'https://edthenerdy.github.io/Hardass-blocker/#pricing',

  // Rough minutes "saved" per blocked visit — powers the encouraging time-saved stat.
  MIN_PER_BLOCK: 15,

  isManaged(state) {
    return !!(state && state.team && state.team.deviceToken);
  },

  // Pro entitlement, with a 48h offline grace window so Pro doesn't flicker off
  // when the entitlement server is briefly unreachable.
  isPro(state, now) {
    now = now || Date.now();
    const p = state && state.pro;
    return !!(p && p.active && p.checkedAt && (now - p.checkedAt) < 48 * 3600e3);
  },

  upgradeUrl(state, src) {
    const base = (state && state.pro && state.pro.serverUrl) ? state.pro.serverUrl.replace(/\/+$/, '') + '/account' : HB.UPGRADE_FALLBACK;
    return base + (base.includes('?') ? '&' : '?') + 'src=' + encodeURIComponent(src || 'extension');
  },

  // Can someone actually subscribe right now? Only once the account/billing
  // server is configured. Until then every upgrade CTA must say "coming soon"
  // rather than present a dead purchase button (honesty > funnel).
  proLive() { return !!HB.PRO_SERVER; },

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
      blockLog: stored.blockLog || [],
      meta: { ...base.meta, ...(stored.meta || {}) }
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

  fmtMinutes(min) {
    min = Math.max(0, Math.round(min || 0));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
  },

  // "Days held" streak: consecutive cave-free days. Derived, not scheduled —
  // anchor is the last cave (or install if never caved), so it needs no alarms
  // and survives restarts. best is persisted in meta and topped up on read.
  daysHeld(meta, now) {
    const anchor = (meta && (meta.lastCaveTs || meta.installedAt)) || now;
    const current = Math.max(0, Math.floor((now - anchor) / 86400000));
    const best = Math.max(current, (meta && meta.bestDaysHeld) || 0);
    return { current, best };
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
