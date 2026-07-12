// ---------------------------------------------------------------------------
// PER-DEVICE INVARIANT (belt-and-suspenders guard)
//
// The individual product's state is intentionally PER DEVICE: each install
// keeps its own blocklist, settings, cooldowns and relapse history, and NOTHING
// syncs across a user's other machines. That is a deliberate product decision,
// not an accident — a block you set on your work laptop must not silently
// reappear (or vanish) on your home PC.
//
// This is enforced by using chrome.storage.LOCAL, which Chrome never syncs.
// Do NOT switch this to chrome.storage.sync: that API mirrors state across every
// device signed into the same Google account and would break the per-device
// guarantee. All state access below MUST go through PER_DEVICE_STORE so this
// choice lives in exactly one place and can only be changed on purpose.
//
// (The one intentional exception to "per device" is team/managed mode, where an
// admin deliberately pushes one policy from the server — see HB.isManaged().
// That path pulls policy over the network; it never routes through storage.sync.)
// ---------------------------------------------------------------------------
const PER_DEVICE_STORE = chrome.storage.local;

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
    policy: null
  },

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
    // Per-device only — see PER_DEVICE_STORE invariant above.
    const stored = await PER_DEVICE_STORE.get(null);
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
    // Per-device only — see PER_DEVICE_STORE invariant above.
    await PER_DEVICE_STORE.set(patch);
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
