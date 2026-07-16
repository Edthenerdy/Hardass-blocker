'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./db');
const { hashPassword, verifyPassword, newToken, newId } = require('./auth');
const CATEGORIES = require('./categories');
const billing = require('./billing');
const entitlement = require('./entitlement');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');
const TOKEN_TTL = 12 * 60 * 60 * 1000;
const ONLINE_WINDOW = 5 * 60 * 1000;

db.load();

/* ---------------- helpers ---------------- */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};

function send(res, status, body, headers) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' }, CORS, headers || {}));
  res.end(data);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

function readRaw(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(raw));
  });
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function originOf(req) {
  return 'http://' + (req.headers.host || 'localhost:' + PORT);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function validEmail(e) { return EMAIL_RE.test(String(e || '')); }

const attempts = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.reset) { attempts.set(key, { count: 1, reset: now + windowMs }); return false; }
  rec.count++;
  return rec.count > max;
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function auth(req, kind) {
  const data = db.get();
  const t = bearer(req);
  if (!t) return null;
  const rec = data.tokens[t];
  if (!rec || rec.expiresAt < Date.now()) return null;
  if (kind && rec.kind !== kind) return null;
  return rec;
}

function normalizeDomain(raw) {
  let s = (raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].split('#')[0].replace(/^www\./, '');
  return s;
}

function expandBlocklist(policy) {
  const set = new Set((policy.customBlocklist || []).map(normalizeDomain).filter(Boolean));
  for (const cat of policy.categories || []) (CATEGORIES[cat] || []).forEach(d => set.add(d));
  return [...set].sort();
}

function orgById(id) {
  return db.get().orgs.find(o => o.id === id);
}
function reqOrg(rec) {
  return rec && orgById(rec.orgId);
}
function genCode() {
  const data = db.get();
  const taken = new Set();
  data.orgs.forEach(o => (o.enrollmentCodes || []).forEach(e => taken.add(e.code)));
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let code;
  do { code = part(3) + '-' + part(3) + '-' + part(3); } while (taken.has(code));
  return code;
}

function groupFor(device) {
  const o = orgById(device.orgId);
  return o && o.groups.find(g => g.id === device.groupId);
}

function activeAllowances(deviceId) {
  const now = Date.now();
  return db.get().requests
    .filter(r => r.deviceId === deviceId && r.status === 'approved' && r.expiresAt > now)
    .map(r => ({ domain: r.domain, expiresAt: r.expiresAt }));
}

function effectivePolicy(device) {
  const g = groupFor(device);
  const p = g.policy;
  return {
    org: (orgById(device.orgId) || {}).name,
    group: g.name,
    enforcement: p.enforcement,
    unblockMode: p.unblockMode,
    cooldownMinutes: p.cooldownMinutes,
    allowanceMinutes: p.allowanceMinutes,
    blocklist: expandBlocklist(p),
    allowances: activeAllowances(device.id)
  };
}

/* ---------------- static ---------------- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(res, baseDir, rel) {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(baseDir, safe);
  if (safe === '' || safe === '/' || safe === '.') file = path.join(baseDir, 'index.html');
  if (!file.startsWith(baseDir)) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------------- simulated hosted checkout page ---------------- */

function money(cents) { return '$' + (cents / 100).toFixed(2); }

function payPage(req, res, pathname) {
  const id = pathname.split('/')[2];
  const cs = billing.getSimCheckout(id);
  if (!cs) return send(res, 404, 'Unknown checkout');
  const paid = cs.status === 'paid';
  const seatLine = cs.kind === 'team' ? '<div class="row"><span>Seats</span><span>' + cs.seats + '</span></div>' : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Checkout — ${cs.label}</title><style>
body{margin:0;background:#0E0E10;color:#F4F1EC;font-family:Inter,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{background:#1B1C20;border:0.5px solid #33353B;border-radius:16px;padding:28px;width:360px}
h1{font-size:18px;margin:0 0 4px}.muted{color:#9A9CA3;font-size:13px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid #33353B;font-size:14px}
.total{font-size:22px;font-weight:600;padding-top:12px;display:flex;justify-content:space-between}
button{width:100%;margin-top:20px;background:#FF3B30;color:#fff;border:0;border-radius:10px;padding:13px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit}
.test{background:#412402;color:#FFB800;font-size:12px;border-radius:8px;padding:8px 10px;margin-bottom:16px;text-align:center}
a{color:#9A9CA3;font-size:12px;display:block;text-align:center;margin-top:14px}
</style></head><body><div class="card">
<div class="test">Simulated checkout — no real card, no charge. Set STRIPE_SECRET_KEY for live Stripe.</div>
<h1>${cs.label}</h1><p class="muted">Deadbolt</p>
<div class="row"><span>Plan</span><span>${cs.label}</span></div>${seatLine}
<div class="total"><span>Total</span><span>${money(cs.amount)}${cs.kind === 'team' ? '/mo' : ''}</span></div>
<button id="pay"${paid ? ' disabled' : ''}>${paid ? 'Paid ✓' : 'Pay ' + money(cs.amount) + ' (test)'}</button>
<a href="/account">Cancel and go back</a>
</div><script>
document.getElementById('pay').addEventListener('click',async function(){
  this.disabled=true;this.textContent='Processing…';
  const r=await fetch('/api/pay/${id}/complete',{method:'POST'}).then(r=>r.json());
  window.location.href = r.redirect || '/account?paid=1';
});
</script></body></html>`;
  send(res, 200, html, { 'Content-Type': 'text/html' });
}

/* ---------------- API ---------------- */

async function api(req, res, pathname) {
  const data = db.get();
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const seg = parts.slice(1);
  const method = req.method;

  // Rate-limit all auth attempts (brute-force protection): 10 per 15 min per IP.
  if (method === 'POST' && seg[0] === 'auth') {
    if (rateLimited('auth:' + clientIp(req), 10, 15 * 60 * 1000)) {
      return send(res, 429, { ok: false, error: 'Too many attempts. Try again in a few minutes.' });
    }
  }

  // POST /api/auth/login
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'login') {
    const body = await readBody(req);
    const admin = data.admins.find(a => a.email.toLowerCase() === String(body.email || '').toLowerCase());
    if (!admin || !verifyPassword(String(body.password || ''), admin.salt, admin.hash)) {
      return send(res, 401, { ok: false, error: 'Wrong email or password' });
    }
    const token = newToken();
    data.tokens[token] = { kind: 'admin', id: admin.id, orgId: admin.orgId, expiresAt: Date.now() + TOKEN_TTL };
    db.save();
    return send(res, 200, { ok: true, token, admin: { name: admin.name, email: admin.email }, org: orgById(admin.orgId) });
  }

  // POST /api/auth/user/signup {email, password}  (consumer accounts)
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'user' && seg[2] === 'signup') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email) || String(body.password || '').length < 6) return send(res, 400, { ok: false, error: 'A valid email and a 6+ char password are required' });
    if (data.users.some(u => u.email === email)) return send(res, 409, { ok: false, error: 'Account already exists — sign in instead' });
    const { salt, hash } = hashPassword(String(body.password));
    const user = { id: newId('usr'), email, salt, hash, plan: 'free', proUntil: null, lifetime: false, createdAt: Date.now() };
    data.users.push(user);
    const token = newToken();
    data.tokens[token] = { kind: 'user', id: user.id, expiresAt: Date.now() + TOKEN_TTL };
    db.save();
    return send(res, 200, { ok: true, token, user: { email }, status: billing.consumerStatus(user), entitlement: entitlement.entitlementFor(user) });
  }

  // POST /api/auth/user/login {email, password}
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'user' && seg[2] === 'login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const user = data.users.find(u => u.email === email);
    if (!user || !verifyPassword(String(body.password || ''), user.salt, user.hash)) return send(res, 401, { ok: false, error: 'Wrong email or password' });
    const token = newToken();
    data.tokens[token] = { kind: 'user', id: user.id, expiresAt: Date.now() + TOKEN_TTL };
    db.save();
    return send(res, 200, { ok: true, token, user: { email }, status: billing.consumerStatus(user), entitlement: entitlement.entitlementFor(user) });
  }

  // POST /api/auth/org/signup {orgName, name, email, password}  (self-serve SME signup)
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'org' && seg[2] === 'signup') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email) || String(body.password || '').length < 6) return send(res, 400, { ok: false, error: 'A valid email and a 6+ char password are required' });
    if (data.admins.some(a => a.email.toLowerCase() === email)) return send(res, 409, { ok: false, error: 'Admin already exists — sign in instead' });
    const { salt, hash } = hashPassword(String(body.password));
    // Create a fresh, isolated organization with a starter group + unique code.
    const groupId = newId('grp');
    const org = {
      id: newId('org'),
      name: String(body.orgName || 'My organization').slice(0, 80),
      seats: 0, plan: 'team_monthly', subscriptionStatus: 'inactive', currentPeriodEnd: null,
      groups: [{
        id: groupId, name: 'Everyone',
        policy: {
          enforcement: 'locked', unblockMode: 'admin-approval', cooldownMinutes: 20, allowanceMinutes: 10,
          categories: ['Social', 'Gambling', 'Adult'], customBlocklist: [],
          schedule: { days: 'Mon–Fri', from: '08:00', to: '18:00' }
        }
      }],
      enrollmentCodes: []
    };
    org.enrollmentCodes.push({ code: genCode(), groupId });
    data.orgs.push(org);
    const admin = { id: newId('adm'), orgId: org.id, email, name: String(body.name || email), salt, hash };
    data.admins.push(admin);
    const token = newToken();
    data.tokens[token] = { kind: 'admin', id: admin.id, orgId: org.id, expiresAt: Date.now() + TOKEN_TTL };
    db.save();
    return send(res, 200, { ok: true, token, admin: { name: admin.name, email: admin.email }, org });
  }

  // GET /api/plans  (public pricing)
  if (method === 'GET' && seg[0] === 'plans') {
    return send(res, 200, { ok: true, plans: billing.PLANS, stripe: billing.useStripe() });
  }

  // GET /api/entitlement/pubkey  (public — extension verifies signed entitlements with this)
  if (method === 'GET' && seg[0] === 'entitlement' && seg[1] === 'pubkey') {
    return send(res, 200, { ok: true, jwk: entitlement.pubkey() });
  }

  // POST /api/pay/:id/complete  (simulated checkout confirmation)
  if (method === 'POST' && seg[0] === 'pay' && seg[2] === 'complete') {
    const r = billing.completeSimCheckout(seg[1]);
    if (!r.ok) return send(res, 404, r);
    const redirect = r.checkout.kind === 'team' ? '/console/?paid=1' : '/account?paid=1';
    return send(res, 200, { ok: true, redirect });
  }

  // POST /api/stripe/webhook  (real Stripe — raw body + signature)
  if (method === 'POST' && seg[0] === 'stripe' && seg[1] === 'webhook') {
    const raw = await readRaw(req);
    return send(res, 200, billing.handleStripeWebhook(raw, req.headers['stripe-signature']));
  }

  /* ----- billing (consumer user OR org admin) ----- */
  if (seg[0] === 'billing') {
    const userRec = auth(req, 'user');
    const adminRec = auth(req, 'admin');
    if (!userRec && !adminRec) return send(res, 401, { ok: false, error: 'unauthorized' });
    const kind = userRec ? 'consumer' : 'team';

    if (method === 'POST' && seg[1] === 'checkout') {
      const body = await readBody(req);
      const refId = userRec ? userRec.id : adminRec.orgId;
      try {
        const out = await billing.createCheckout({ kind, refId, plan: body.plan, seats: body.seats, origin: originOf(req) });
        return send(res, 200, { ok: true, ...out });
      } catch (e) { return send(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (method === 'GET' && seg[1] === 'status') {
      if (userRec) {
        const u = data.users.find(x => x.id === userRec.id);
        return send(res, 200, { ok: true, kind, ...billing.consumerStatus(u), entitlement: entitlement.entitlementFor(u) });
      }
      const o = reqOrg(adminRec);
      return send(res, 200, { ok: true, kind, status: o.subscriptionStatus, active: billing.orgActive(o), seats: o.seats, plan: o.plan, currentPeriodEnd: o.currentPeriodEnd });
    }
    if (method === 'POST' && seg[1] === 'seats') {
      if (!adminRec) return send(res, 403, { ok: false, error: 'admin only' });
      const body = await readBody(req);
      const o = reqOrg(adminRec);
      if (!billing.orgActive(o)) return send(res, 400, { ok: false, error: 'subscribe first' });
      return send(res, 200, await billing.updateSeats(adminRec.orgId, body.seats));
    }
    if (method === 'POST' && seg[1] === 'cancel') {
      if (userRec) billing.applyEntitlement('consumer', userRec.id, 'free', 1);
      else { const o = reqOrg(adminRec); o.subscriptionStatus = 'canceled'; db.save(); }
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { ok: false, error: 'unknown billing route' });
  }

  /* ----- device endpoints ----- */

  // POST /api/enroll {code, deviceName}
  if (method === 'POST' && seg[0] === 'enroll') {
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    let org = null, entry = null;
    for (const o of data.orgs) {
      const e = (o.enrollmentCodes || []).find(x => x.code === code);
      if (e) { org = o; entry = e; break; }
    }
    if (!entry) return send(res, 400, { ok: false, error: 'Invalid enrollment code' });
    if (!billing.orgActive(org)) return send(res, 402, { ok: false, error: 'This organization has no active subscription.' });
    const device = {
      id: newId('dev'),
      orgId: org.id,
      name: String(body.deviceName || 'Unnamed device').slice(0, 60),
      groupId: entry.groupId,
      enrolledAt: Date.now(),
      lastSeen: Date.now()
    };
    data.devices.push(device);
    const token = newToken();
    data.tokens[token] = { kind: 'device', id: device.id, orgId: org.id, expiresAt: Date.now() + 365 * 24 * 3600 * 1000 };
    db.save();
    return send(res, 200, { ok: true, deviceToken: token, device: { id: device.id, name: device.name }, policy: effectivePolicy(device) });
  }

  // device-authed routes
  if (seg[0] === 'device') {
    const rec = auth(req, 'device');
    if (!rec) return send(res, 401, { ok: false, error: 'device not enrolled' });
    const device = data.devices.find(d => d.id === rec.id);
    if (!device) return send(res, 401, { ok: false, error: 'unknown device' });
    device.lastSeen = Date.now();

    // GET /api/device/policy
    if (method === 'GET' && seg[1] === 'policy') {
      db.save();
      return send(res, 200, { ok: true, policy: effectivePolicy(device) });
    }
    // POST /api/device/telemetry {domain, type}
    if (method === 'POST' && seg[1] === 'telemetry') {
      const body = await readBody(req);
      data.events.push({ id: newId('ev'), orgId: device.orgId, deviceId: device.id, domain: normalizeDomain(body.domain), type: body.type === 'allowed' ? 'allowed' : 'blocked', ts: Date.now() });
      db.save();
      return send(res, 200, { ok: true });
    }
    // POST /api/device/selfgrant {domain, reason}  (cooldown mode only)
    if (method === 'POST' && seg[1] === 'selfgrant') {
      const body = await readBody(req);
      const g = groupFor(device);
      if (g.policy.unblockMode !== 'cooldown') return send(res, 400, { ok: false, error: 'not cooldown mode' });
      const domain = normalizeDomain(body.domain);
      if (!domain) return send(res, 400, { ok: false, error: 'no domain' });
      if (String(body.reason || '').trim().length < 10) return send(res, 400, { ok: false, error: 'reason too short' });
      const mins = g.policy.allowanceMinutes;
      const request = {
        id: newId('req'), orgId: device.orgId, deviceId: device.id, deviceName: device.name, groupId: device.groupId,
        domain, reason: String(body.reason).slice(0, 300), requestedMin: mins, status: 'approved',
        grantedMin: mins, createdAt: Date.now(), decidedAt: Date.now(), expiresAt: Date.now() + mins * 60000, selfServe: true
      };
      data.requests.push(request);
      db.save();
      return send(res, 200, { ok: true, request });
    }
    // POST /api/device/requests {domain, reason, requestedMin}
    if (method === 'POST' && seg[1] === 'requests') {
      const body = await readBody(req);
      const domain = normalizeDomain(body.domain);
      if (!domain) return send(res, 400, { ok: false, error: 'no domain' });
      const existing = data.requests.find(r => r.deviceId === device.id && r.domain === domain && r.status === 'pending');
      if (existing) return send(res, 200, { ok: true, request: existing });
      const request = {
        id: newId('req'),
        orgId: device.orgId,
        deviceId: device.id,
        deviceName: device.name,
        groupId: device.groupId,
        domain,
        reason: String(body.reason || '').slice(0, 300),
        requestedMin: Math.max(1, Math.min(240, parseInt(body.requestedMin, 10) || 15)),
        status: 'pending',
        createdAt: Date.now()
      };
      data.requests.push(request);
      db.save();
      return send(res, 200, { ok: true, request });
    }
    // GET /api/device/requests
    if (method === 'GET' && seg[1] === 'requests') {
      const mine = data.requests.filter(r => r.deviceId === device.id).sort((a, b) => b.createdAt - a.createdAt);
      db.save();
      return send(res, 200, { ok: true, requests: mine });
    }
    return send(res, 404, { ok: false, error: 'unknown device route' });
  }

  /* ----- admin endpoints (all require admin token) ----- */

  const rec = auth(req, 'admin');
  if (!rec) return send(res, 401, { ok: false, error: 'unauthorized' });
  const org = reqOrg(rec);
  if (!org) return send(res, 401, { ok: false, error: 'unknown org' });
  const myDevices = () => data.devices.filter(d => d.orgId === org.id);
  const myRequests = () => data.requests.filter(r => r.orgId === org.id);

  // GET /api/dashboard
  if (method === 'GET' && seg[0] === 'dashboard') {
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const devs = myDevices();
    const online = devs.filter(d => now - d.lastSeen < ONLINE_WINDOW).length;
    const blocksToday = data.events.filter(e => e.orgId === org.id && e.type === 'blocked' && e.ts >= startOfDay.getTime()).length;
    const pending = myRequests().filter(r => r.status === 'pending').length;
    return send(res, 200, {
      ok: true,
      devicesOnline: online,
      devicesEnrolled: devs.length,
      seats: org.seats,
      blocksToday,
      pendingRequests: pending,
      coverage: org.seats ? Math.min(100, Math.round((devs.length / org.seats) * 100)) : 0,
      subscription: { status: org.subscriptionStatus, active: billing.orgActive(org), plan: org.plan, orgName: org.name }
    });
  }

  // GET /api/groups
  if (method === 'GET' && seg[0] === 'groups' && !seg[1]) {
    return send(res, 200, { ok: true, groups: org.groups, categories: Object.keys(CATEGORIES) });
  }

  // PUT /api/groups/:id/policy
  if (method === 'PUT' && seg[0] === 'groups' && seg[2] === 'policy') {
    const body = await readBody(req);
    const g = org.groups.find(x => x.id === seg[1]);
    if (!g) return send(res, 404, { ok: false, error: 'no group' });
    const p = g.policy;
    if (['locked', 'advisory'].includes(body.enforcement)) p.enforcement = body.enforcement;
    if (['admin-approval', 'cooldown', 'none'].includes(body.unblockMode)) p.unblockMode = body.unblockMode;
    if (Number.isFinite(+body.cooldownMinutes)) p.cooldownMinutes = Math.max(1, Math.min(180, +body.cooldownMinutes));
    if (Number.isFinite(+body.allowanceMinutes)) p.allowanceMinutes = Math.max(1, Math.min(120, +body.allowanceMinutes));
    if (Array.isArray(body.categories)) p.categories = body.categories.filter(c => CATEGORIES[c]);
    if (Array.isArray(body.customBlocklist)) p.customBlocklist = body.customBlocklist.map(normalizeDomain).filter(Boolean);
    db.save();
    return send(res, 200, { ok: true, group: g });
  }

  // GET /api/devices
  if (method === 'GET' && seg[0] === 'devices') {
    const now = Date.now();
    const list = myDevices().map(d => ({
      id: d.id, name: d.name,
      group: (groupFor(d) || {}).name,
      online: now - d.lastSeen < ONLINE_WINDOW,
      lastSeen: d.lastSeen
    }));
    return send(res, 200, { ok: true, devices: list, enrollmentCodes: org.enrollmentCodes.map(e => ({ code: e.code, group: (org.groups.find(g => g.id === e.groupId) || {}).name })) });
  }

  // GET /api/requests
  if (method === 'GET' && seg[0] === 'requests' && !seg[1]) {
    const list = myRequests().sort((a, b) => b.createdAt - a.createdAt).map(r => ({
      ...r, group: (org.groups.find(g => g.id === r.groupId) || {}).name
    }));
    return send(res, 200, { ok: true, requests: list });
  }

  // POST /api/requests/:id/decision {decision, grantedMin}
  if (method === 'POST' && seg[0] === 'requests' && seg[2] === 'decision') {
    const body = await readBody(req);
    const r = data.requests.find(x => x.id === seg[1] && x.orgId === org.id);
    if (!r) return send(res, 404, { ok: false, error: 'no request' });
    if (r.status !== 'pending') return send(res, 400, { ok: false, error: 'already decided' });
    r.decidedAt = Date.now();
    if (body.decision === 'approved') {
      const mins = Math.max(1, Math.min(240, parseInt(body.grantedMin, 10) || r.requestedMin));
      r.status = 'approved';
      r.grantedMin = mins;
      r.expiresAt = Date.now() + mins * 60000;
    } else {
      r.status = 'denied';
    }
    db.save();
    return send(res, 200, { ok: true, request: r });
  }

  // GET /api/reports
  if (method === 'GET' && seg[0] === 'reports') {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const blocked = data.events.filter(e => e.orgId === org.id && e.type === 'blocked' && e.ts >= weekAgo);
    const byDomain = {};
    for (const e of blocked) byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    const top = Object.entries(byDomain).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 12);
    return send(res, 200, { ok: true, totalBlocked: blocked.length, top });
  }

  return send(res, 404, { ok: false, error: 'unknown api route' });
}

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(url.parse(req.url).pathname);

  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (pathname === '/') { res.writeHead(302, { Location: '/console/' }); return res.end(); }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (pathname.startsWith('/pay/')) return payPage(req, res, pathname);
    if (pathname === '/console' || pathname.startsWith('/console/')) {
      return serveStatic(res, path.join(ROOT, 'console'), pathname.replace(/^\/console\/?/, ''));
    }
    if (pathname === '/device' || pathname.startsWith('/device/')) {
      return serveStatic(res, path.join(ROOT, 'device'), pathname.replace(/^\/device\/?/, ''));
    }
    if (pathname === '/account' || pathname.startsWith('/account/')) {
      return serveStatic(res, path.join(ROOT, 'account'), pathname.replace(/^\/account\/?/, ''));
    }
    return send(res, 404, 'not found');
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log('Deadbolt server running:');
  console.log('  Admin console:  http://localhost:' + PORT + '/console/   (admin@northshore.example / deadbolt)');
  console.log('  Device client:  http://localhost:' + PORT + '/device/     (enrollment code NSD-4K9-QX2)');
  console.log('  Consumer app:   http://localhost:' + PORT + '/account/');
  console.log('  Billing:        ' + (billing.useStripe() ? 'REAL Stripe (STRIPE_SECRET_KEY set)' : 'SIMULATED (set STRIPE_SECRET_KEY for live)'));
});
