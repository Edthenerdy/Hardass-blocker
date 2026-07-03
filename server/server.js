'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./db');
const { hashPassword, verifyPassword, newToken, newId } = require('./auth');
const CATEGORIES = require('./categories');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');
const TOKEN_TTL = 12 * 60 * 60 * 1000;
const ONLINE_WINDOW = 5 * 60 * 1000;

db.load();

/* ---------------- helpers ---------------- */

function send(res, status, body, headers) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' }, headers || {}));
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

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
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

function groupFor(device) {
  return db.get().groups.find(g => g.id === device.groupId);
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
    org: db.get().org.name,
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

/* ---------------- API ---------------- */

async function api(req, res, pathname) {
  const data = db.get();
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const seg = parts.slice(1);
  const method = req.method;

  // POST /api/auth/login
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'login') {
    const body = await readBody(req);
    const admin = data.admins.find(a => a.email.toLowerCase() === String(body.email || '').toLowerCase());
    if (!admin || !verifyPassword(String(body.password || ''), admin.salt, admin.hash)) {
      return send(res, 401, { ok: false, error: 'Wrong email or password' });
    }
    const token = newToken();
    data.tokens[token] = { kind: 'admin', id: admin.id, expiresAt: Date.now() + TOKEN_TTL };
    db.save();
    return send(res, 200, { ok: true, token, admin: { name: admin.name, email: admin.email }, org: data.org });
  }

  /* ----- device endpoints ----- */

  // POST /api/enroll {code, deviceName}
  if (method === 'POST' && seg[0] === 'enroll') {
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    const entry = data.enrollmentCodes.find(e => e.code === code);
    if (!entry) return send(res, 400, { ok: false, error: 'Invalid enrollment code' });
    const device = {
      id: newId('dev'),
      name: String(body.deviceName || 'Unnamed device').slice(0, 60),
      groupId: entry.groupId,
      enrolledAt: Date.now(),
      lastSeen: Date.now()
    };
    data.devices.push(device);
    const token = newToken();
    data.tokens[token] = { kind: 'device', id: device.id, expiresAt: Date.now() + 365 * 24 * 3600 * 1000 };
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
      data.events.push({ id: newId('ev'), deviceId: device.id, domain: normalizeDomain(body.domain), type: body.type === 'allowed' ? 'allowed' : 'blocked', ts: Date.now() });
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
        id: newId('req'), deviceId: device.id, deviceName: device.name, groupId: device.groupId,
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

  // GET /api/dashboard
  if (method === 'GET' && seg[0] === 'dashboard') {
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const online = data.devices.filter(d => now - d.lastSeen < ONLINE_WINDOW).length;
    const blocksToday = data.events.filter(e => e.type === 'blocked' && e.ts >= startOfDay.getTime()).length;
    const pending = data.requests.filter(r => r.status === 'pending').length;
    return send(res, 200, {
      ok: true,
      devicesOnline: online,
      devicesEnrolled: data.devices.length,
      seats: data.org.seats,
      blocksToday,
      pendingRequests: pending,
      coverage: data.org.seats ? Math.min(100, Math.round((data.devices.length / data.org.seats) * 100)) : 0
    });
  }

  // GET /api/groups
  if (method === 'GET' && seg[0] === 'groups' && !seg[1]) {
    return send(res, 200, { ok: true, groups: data.groups, categories: Object.keys(CATEGORIES) });
  }

  // PUT /api/groups/:id/policy
  if (method === 'PUT' && seg[0] === 'groups' && seg[2] === 'policy') {
    const body = await readBody(req);
    const g = data.groups.find(x => x.id === seg[1]);
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
    const list = data.devices.map(d => ({
      id: d.id, name: d.name,
      group: (groupFor(d) || {}).name,
      online: now - d.lastSeen < ONLINE_WINDOW,
      lastSeen: d.lastSeen
    }));
    return send(res, 200, { ok: true, devices: list, enrollmentCodes: data.enrollmentCodes.map(e => ({ code: e.code, group: (data.groups.find(g => g.id === e.groupId) || {}).name })) });
  }

  // GET /api/requests
  if (method === 'GET' && seg[0] === 'requests' && !seg[1]) {
    const list = [...data.requests].sort((a, b) => b.createdAt - a.createdAt).map(r => ({
      ...r, group: (data.groups.find(g => g.id === r.groupId) || {}).name
    }));
    return send(res, 200, { ok: true, requests: list });
  }

  // POST /api/requests/:id/decision {decision, grantedMin}
  if (method === 'POST' && seg[0] === 'requests' && seg[2] === 'decision') {
    const body = await readBody(req);
    const r = data.requests.find(x => x.id === seg[1]);
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
    const blocked = data.events.filter(e => e.type === 'blocked' && e.ts >= weekAgo);
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
    if (pathname === '/') { res.writeHead(302, { Location: '/console/' }); return res.end(); }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (pathname === '/console' || pathname.startsWith('/console/')) {
      return serveStatic(res, path.join(ROOT, 'console'), pathname.replace(/^\/console\/?/, ''));
    }
    if (pathname === '/device' || pathname.startsWith('/device/')) {
      return serveStatic(res, path.join(ROOT, 'device'), pathname.replace(/^\/device\/?/, ''));
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
});
