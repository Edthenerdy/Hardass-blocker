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
    policy: null,
    // Pro cloud sync: tombstones for removed sites (domain -> removedAt) so a
    // removal propagates and isn't undone by a peer that still has the site;
    // syncUpdatedAt is the recency of the last LOCAL change, for settings merge.
    removed: {},
    syncUpdatedAt: 0
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

  // A finished cooldown stays "ready to unblock" for this long. After that a fresh
  // visit faces a NEW wait — so you can't wait a cooldown out once, never unblock,
  // and then skip the wait forever on later attempts. Reopening DURING the wait
  // never resets it (the timer keeps running while the tab is closed).
  COOLDOWN_READY_GRACE_MIN: 10,

  // Single source of truth for a domain's cooldown, shared by the blocked page and
  // the background so every open tab agrees:
  //   'none'    — no cooldown; a fresh wait is required
  //   'running' — wait in progress (endsAt in the future)
  //   'ready'   — wait finished within the grace window; unblock allowed now
  //   'stale'   — wait finished long ago; must start over (treat like 'none')
  cooldownStatus(state, domain, now) {
    now = now || Date.now();
    const cd = state && state.cooldowns && state.cooldowns[domain];
    if (!cd || !cd.endsAt) return { status: 'none', endsAt: null };
    if (cd.endsAt > now) return { status: 'running', endsAt: cd.endsAt };
    if (now - cd.endsAt <= HB.COOLDOWN_READY_GRACE_MIN * 60000) return { status: 'ready', endsAt: cd.endsAt };
    return { status: 'stale', endsAt: cd.endsAt };
  },

  // Global "times unblocked" across ALL sites — a common metric, not per-domain,
  // so any unblock anywhere is reflected everywhere the count is shown.
  unblockStats(relapseLog, now) {
    now = now || Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const all = (relapseLog || []).length;
    const week = (relapseLog || []).filter(r => r.ts >= weekAgo).length;
    return { allTime: all, thisWeek: week };
  },

  /* ---------------- Pro cloud sync (opt-in) ----------------
     Only the small, low-sensitivity state travels: blocklist, settings, streak
     anchors, and removal tombstones. Browsing and the reasons you type never do. */

  // The syncable slice of local state.
  buildProfile(state) {
    const m = (state && state.meta) || {};
    return {
      blocklist: ((state && state.blocklist) || []).map(b => ({ domain: b.domain, addedAt: b.addedAt || 0 })),
      settings: (state && state.settings) || {},
      meta: { installedAt: m.installedAt || null, lastCaveTs: m.lastCaveTs || null, bestDaysHeld: m.bestDaysHeld || 0 },
      removed: (state && state.removed) || {},
      updatedAt: (state && state.syncUpdatedAt) || 0
    };
  },

  // Merge one user's local profile with their cloud profile (their own devices).
  // Blocklist = union minus tombstoned removals; settings = most-recently-changed
  // device wins; streak = keep the best / most-recent. Pure + deterministic.
  mergeProfiles(local, cloud) {
    local = local || {}; cloud = cloud || {};
    // Tombstones: domain -> latest removedAt across both sides.
    const removed = {};
    for (const src of [local.removed || {}, cloud.removed || {}]) {
      for (const d in src) removed[d] = Math.max(removed[d] || 0, src[d] || 0);
    }
    // Union blocklist by domain, keeping the earliest addedAt seen.
    const byDomain = {};
    for (const b of (local.blocklist || []).concat(cloud.blocklist || [])) {
      if (!b || !b.domain) continue;
      const prev = byDomain[b.domain];
      const addedAt = b.addedAt || 0;
      byDomain[b.domain] = { domain: b.domain, addedAt: prev ? Math.min(prev.addedAt || addedAt, addedAt) : addedAt };
    }
    // A domain survives only if it wasn't removed at/after it was (re-)added.
    const blocklist = Object.keys(byDomain)
      .map(d => byDomain[d])
      .filter(b => !(removed[b.domain] && removed[b.domain] >= b.addedAt))
      .sort((a, b) => a.domain.localeCompare(b.domain));
    // Keep only tombstones that are still doing something (site not currently listed).
    const listed = new Set(blocklist.map(b => b.domain));
    const activeRemoved = {};
    for (const d in removed) if (!listed.has(d)) activeRemoved[d] = removed[d];
    // Settings: whole-object, most-recently-changed device wins.
    const localNewer = (local.updatedAt || 0) >= (cloud.updatedAt || 0);
    const settings = (localNewer ? local.settings : cloud.settings) || local.settings || cloud.settings || {};
    // Streak: earliest install, most recent cave, best-ever days.
    const lm = local.meta || {}, cm = cloud.meta || {};
    const installedAt = [lm.installedAt, cm.installedAt].filter(Boolean).sort((a, b) => a - b)[0] || null;
    const meta = {
      installedAt,
      lastCaveTs: Math.max(lm.lastCaveTs || 0, cm.lastCaveTs || 0) || null,
      bestDaysHeld: Math.max(lm.bestDaysHeld || 0, cm.bestDaysHeld || 0)
    };
    return { blocklist, settings, meta, removed: activeRemoved, updatedAt: Math.max(local.updatedAt || 0, cloud.updatedAt || 0) };
  },

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
