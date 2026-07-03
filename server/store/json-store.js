'use strict';
/*
 * JSON file store — the zero-dependency default.
 *
 * Holds the whole multi-tenant blob in memory and flushes it to data.json on
 * every mutation. Fine for the POC and single-process dev; NOT for production
 * (no concurrency control, whole file rewritten each save). It exists to prove
 * the store abstraction and keep `npm start` dependency-free. For hosting,
 * select the Postgres store (STORE=pg) — same interface, same call sites.
 *
 * Every method is async so it is signature-compatible with a real database
 * adapter; the JSON implementation just resolves immediately.
 */
const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(opts = {}) {
    this.file = opts.file || path.join(__dirname, '..', 'data.json');
    this.db = null;
  }

  async init(seedFn) {
    if (fs.existsSync(this.file)) {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      this.db = seedFn();
      this._flush();
    }
    return this;
  }

  async close() { /* nothing to close */ }

  _flush() {
    fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2));
  }

  _org(orgId) {
    return this.db.orgs[orgId] || null;
  }

  /* ---------- auth / tenant ---------- */

  // login is a global lookup: an admin's email resolves the tenant
  async findAdminByEmail(email) {
    const needle = String(email || '').toLowerCase();
    for (const orgId of Object.keys(this.db.orgs)) {
      const admin = this.db.orgs[orgId].admins.find(a => a.email.toLowerCase() === needle);
      if (admin) return admin; // admin carries orgId
    }
    return null;
  }

  async getOrg(orgId) {
    const o = this._org(orgId);
    return o ? o.org : null;
  }

  async getToken(token) {
    return this.db.tokens[token] || null;
  }

  async putToken(token, rec) {
    this.db.tokens[token] = rec;
    this._flush();
  }

  async deleteToken(token) {
    delete this.db.tokens[token];
    this._flush();
  }

  /* ---------- enrollment ---------- */

  // enrollment codes are globally unique across tenants; resolves the org
  async findEnrollmentCode(code) {
    const needle = String(code || '').trim().toUpperCase();
    for (const orgId of Object.keys(this.db.orgs)) {
      const entry = this.db.orgs[orgId].enrollmentCodes.find(e => e.code === needle);
      if (entry) return entry; // { code, orgId, groupId }
    }
    return null;
  }

  async listEnrollmentCodes(orgId) {
    const o = this._org(orgId);
    return o ? o.enrollmentCodes.slice() : [];
  }

  /* ---------- groups ---------- */

  async listGroups(orgId) {
    const o = this._org(orgId);
    return o ? o.groups.slice() : [];
  }

  async getGroup(orgId, groupId) {
    const o = this._org(orgId);
    return o ? o.groups.find(g => g.id === groupId) || null : null;
  }

  async updateGroupPolicy(orgId, groupId, patch) {
    const o = this._org(orgId);
    if (!o) return null;
    const g = o.groups.find(x => x.id === groupId);
    if (!g) return null;
    Object.assign(g.policy, patch);
    this._flush();
    return g;
  }

  /* ---------- devices ---------- */

  async createDevice(orgId, device) {
    const o = this._org(orgId);
    if (!o) return null;
    o.devices.push(device);
    this._flush();
    return device;
  }

  async getDevice(orgId, deviceId) {
    const o = this._org(orgId);
    return o ? o.devices.find(d => d.id === deviceId) || null : null;
  }

  async touchDevice(orgId, deviceId, ts) {
    const o = this._org(orgId);
    if (!o) return;
    const d = o.devices.find(x => x.id === deviceId);
    if (d) { d.lastSeen = ts; this._flush(); }
  }

  async listDevices(orgId) {
    const o = this._org(orgId);
    return o ? o.devices.slice() : [];
  }

  /* ---------- requests ---------- */

  async createRequest(orgId, request) {
    const o = this._org(orgId);
    if (!o) return null;
    o.requests.push(request);
    this._flush();
    return request;
  }

  async getRequest(orgId, reqId) {
    const o = this._org(orgId);
    return o ? o.requests.find(r => r.id === reqId) || null : null;
  }

  // request objects are held by reference; callers mutate then persist
  async saveRequest(orgId /*, request */) {
    if (this._org(orgId)) this._flush();
  }

  async listRequests(orgId) {
    const o = this._org(orgId);
    return o ? o.requests.slice() : [];
  }

  async listRequestsByDevice(orgId, deviceId) {
    const o = this._org(orgId);
    return o ? o.requests.filter(r => r.deviceId === deviceId) : [];
  }

  async findPendingRequest(orgId, deviceId, domain) {
    const o = this._org(orgId);
    if (!o) return null;
    return o.requests.find(r => r.deviceId === deviceId && r.domain === domain && r.status === 'pending') || null;
  }

  async activeAllowances(orgId, deviceId, now) {
    const o = this._org(orgId);
    if (!o) return [];
    return o.requests
      .filter(r => r.deviceId === deviceId && r.status === 'approved' && r.expiresAt > now)
      .map(r => ({ domain: r.domain, expiresAt: r.expiresAt }));
  }

  async countPendingRequests(orgId) {
    const o = this._org(orgId);
    return o ? o.requests.filter(r => r.status === 'pending').length : 0;
  }

  /* ---------- events / telemetry ---------- */

  async addEvent(orgId, event) {
    const o = this._org(orgId);
    if (!o) return;
    o.events.push(event);
    this._flush();
  }

  async countBlockedSince(orgId, ts) {
    const o = this._org(orgId);
    if (!o) return 0;
    return o.events.filter(e => e.type === 'blocked' && e.ts >= ts).length;
  }

  async topBlockedDomains(orgId, sinceTs, limit) {
    const o = this._org(orgId);
    if (!o) return [];
    const byDomain = {};
    for (const e of o.events) {
      if (e.type === 'blocked' && e.ts >= sinceTs) byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    }
    return Object.entries(byDomain)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

module.exports = JsonStore;
