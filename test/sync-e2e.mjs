// End-to-end: two Pro devices converging through the REAL server + REAL merge.
// Requires the backend running:  cd server && node server.js   (then run this).
import vm from 'node:vm';
import fs from 'node:fs';
const B = 'http://127.0.0.1:8787';
const EXT = new URL('../extension/', import.meta.url);

// Load the real HB (merge logic) exactly as the extension uses it.
const sb = { self: null, Date, Math, JSON, Object, Array, String, Number, Set, console };
sb.self = sb;
vm.runInContext(fs.readFileSync(new URL('common.js', EXT), 'utf8'), vm.createContext(sb));
const HB = sb.HB;

const j = async (p, opts = {}) => {
  const r = await fetch(B + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  return r.json();
};
let pass = 0, fail = 0;
const ck = (n, c, d) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, '::', d); } };

// A "device": its own local profile; syncDevice does the real pull→merge→push.
async function syncDevice(token, dev) {
  const cloud = (await j('/api/pro/profile', { headers: { Authorization: 'Bearer ' + token } })).profile;
  const merged = HB.mergeProfiles(dev.profile, cloud);
  merged.updatedAt = dev.profile.updatedAt; // preserve local recency for this push
  await j('/api/pro/profile', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ profile: merged }) });
  dev.profile = merged; // device now holds the merged result
  return merged;
}
const domains = p => p.blocklist.map(b => b.domain).sort().join(',');

(async () => {
  // 1) Create a Pro account (signup + simulated checkout).
  const email = 'synctest' + Date.now() + '@example.com';
  const su = await j('/api/auth/user/signup', { method: 'POST', body: JSON.stringify({ email, password: 'password123', remember: true }) });
  const token = su.token;
  ck('signed up a consumer account', !!token, JSON.stringify(su));
  const co = await j('/api/billing/checkout', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ plan: 'pro_monthly' }) });
  await j('/api/pay/' + co.id + '/complete', { method: 'POST' });
  const st = await j('/api/billing/status', { headers: { Authorization: 'Bearer ' + token } });
  ck('account is Pro after checkout', st.plan === 'pro', JSON.stringify(st));

  // 2) Two devices, distinct local blocklists + settings.
  const A = { profile: { blocklist: [{ domain: 'instagram.com', addedAt: 1000 }], settings: { cooldownMinutes: 20 }, meta: { installedAt: 500, bestDaysHeld: 3 }, removed: {}, updatedAt: 1000 } };
  const Bd = { profile: { blocklist: [{ domain: 'youtube.com', addedAt: 2000 }], settings: { cooldownMinutes: 30 }, meta: { installedAt: 800, bestDaysHeld: 5 }, removed: {}, updatedAt: 2000 } };

  await syncDevice(token, A);   // A → empty cloud → cloud = {instagram}
  await syncDevice(token, Bd);  // B pulls {instagram}, merges its {youtube}
  ck('device B now has BOTH sites', domains(Bd.profile) === 'instagram.com,youtube.com', domains(Bd.profile));
  ck('newer device (B) wins on settings (cd=30)', Bd.profile.settings.cooldownMinutes === 30, JSON.stringify(Bd.profile.settings));
  ck('streak merged: best=5, earliest install=500', Bd.profile.meta.bestDaysHeld === 5 && Bd.profile.meta.installedAt === 500, JSON.stringify(Bd.profile.meta));

  await syncDevice(token, A);   // A pulls the union
  ck('device A converges to BOTH sites', domains(A.profile) === 'instagram.com,youtube.com', domains(A.profile));

  // 3) B removes instagram (tombstone), syncs. A must lose it too.
  Bd.profile.blocklist = Bd.profile.blocklist.filter(b => b.domain !== 'instagram.com');
  Bd.profile.removed = { 'instagram.com': 3000 };
  Bd.profile.updatedAt = 3000;
  await syncDevice(token, Bd);
  await syncDevice(token, A);
  ck('a removal on B propagates to A', domains(A.profile) === 'youtube.com', domains(A.profile));

  // 4) A re-adds instagram later (addedAt > removedAt). It must come back everywhere.
  A.profile.blocklist.push({ domain: 'instagram.com', addedAt: 4000 });
  delete A.profile.removed['instagram.com'];
  A.profile.updatedAt = 4000;
  await syncDevice(token, A);
  await syncDevice(token, Bd);
  ck('a re-add after removal comes back on B', domains(Bd.profile) === 'instagram.com,youtube.com', domains(Bd.profile));

  // 5) The unauthed case is rejected.
  const noauth = await j('/api/pro/profile');
  ck('sync endpoint rejects an unauthenticated request', noauth.ok === false, JSON.stringify(noauth));

  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
})();
