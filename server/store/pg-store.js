'use strict';
/*
 * Postgres store — the production target.
 *
 * Implements the exact same async interface as JsonStore, so selecting it
 * (STORE=pg DATABASE_URL=postgres://…) requires zero changes to server.js.
 *
 * `pg` is loaded lazily so the zero-dependency POC still runs; install it only
 * when you actually point at a database:  npm install pg
 *
 * NOTE: this adapter is not exercised by the POC's default path (which has no
 * Postgres available here). It mirrors the JSON store's semantics faithfully
 * and the schema in schema.sql, but treat it as reviewed-not-run until it has
 * been pointed at a real database.
 */
const fs = require('node:fs');
const path = require('node:path');

class PgStore {
  constructor(opts = {}) {
    this.url = opts.url || process.env.DATABASE_URL;
    this.pool = null;
  }

  async init(seedFn) {
    if (!this.url) throw new Error('DATABASE_URL is required for STORE=pg');
    let Pool;
    try { ({ Pool } = require('pg')); }
    catch { throw new Error("STORE=pg needs the 'pg' package — run: npm install pg"); }

    this.pool = new Pool({ connectionString: this.url });

    // apply schema (idempotent)
    const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(ddl);

    // seed only when empty, so first boot mirrors the JSON store's behaviour
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM orgs');
    if (rows[0].n === 0) await this._seedFromBlob(seedFn());

    return this;
  }

  async close() {
    if (this.pool) await this.pool.end();
  }

  async _seedFromBlob(blob) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const orgId of Object.keys(blob.orgs)) {
        const t = blob.orgs[orgId];
        await c.query('INSERT INTO orgs (id, name, seats) VALUES ($1,$2,$3)', [t.org.id, t.org.name, t.org.seats]);
        for (const a of t.admins) {
          await c.query('INSERT INTO admins (id, org_id, email, name, salt, hash) VALUES ($1,$2,$3,$4,$5,$6)',
            [a.id, orgId, a.email, a.name, a.salt, a.hash]);
        }
        for (const g of t.groups) {
          await c.query('INSERT INTO groups (id, org_id, name, policy) VALUES ($1,$2,$3,$4)',
            [g.id, orgId, g.name, JSON.stringify(g.policy)]);
        }
        for (const e of t.enrollmentCodes) {
          await c.query('INSERT INTO enrollment_codes (code, org_id, group_id) VALUES ($1,$2,$3)',
            [e.code, orgId, e.groupId]);
        }
      }
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }

  async _q(text, params) {
    const { rows } = await this.pool.query(text, params);
    return rows;
  }

  /* ---------- auth / tenant ---------- */

  async findAdminByEmail(email) {
    const rows = await this._q(
      'SELECT id, org_id AS "orgId", email, name, salt, hash FROM admins WHERE lower(email)=lower($1) LIMIT 1',
      [email]);
    return rows[0] || null;
  }

  async getOrg(orgId) {
    const rows = await this._q('SELECT id, name, seats FROM orgs WHERE id=$1', [orgId]);
    return rows[0] || null;
  }

  async getToken(token) {
    const rows = await this._q(
      'SELECT kind, org_id AS "orgId", subject_id AS id, expires_at AS "expiresAt" FROM tokens WHERE token=$1',
      [token]);
    return rows[0] || null;
  }

  async putToken(token, rec) {
    await this._q(
      `INSERT INTO tokens (token, kind, org_id, subject_id, expires_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token) DO UPDATE SET kind=$2, org_id=$3, subject_id=$4, expires_at=$5`,
      [token, rec.kind, rec.orgId, rec.id, rec.expiresAt]);
  }

  async deleteToken(token) {
    await this._q('DELETE FROM tokens WHERE token=$1', [token]);
  }

  /* ---------- enrollment ---------- */

  async findEnrollmentCode(code) {
    const rows = await this._q(
      'SELECT code, org_id AS "orgId", group_id AS "groupId" FROM enrollment_codes WHERE code=$1',
      [String(code || '').trim().toUpperCase()]);
    return rows[0] || null;
  }

  async listEnrollmentCodes(orgId) {
    return this._q('SELECT code, org_id AS "orgId", group_id AS "groupId" FROM enrollment_codes WHERE org_id=$1', [orgId]);
  }

  /* ---------- groups ---------- */

  async listGroups(orgId) {
    return this._q('SELECT id, org_id AS "orgId", name, policy FROM groups WHERE org_id=$1', [orgId]);
  }

  async getGroup(orgId, groupId) {
    const rows = await this._q('SELECT id, org_id AS "orgId", name, policy FROM groups WHERE org_id=$1 AND id=$2', [orgId, groupId]);
    return rows[0] || null;
  }

  async updateGroupPolicy(orgId, groupId, patch) {
    // merge patch into the existing JSONB policy, then return the row
    const rows = await this._q(
      `UPDATE groups SET policy = policy || $3::jsonb
       WHERE org_id=$1 AND id=$2
       RETURNING id, org_id AS "orgId", name, policy`,
      [orgId, groupId, JSON.stringify(patch)]);
    return rows[0] || null;
  }

  /* ---------- devices ---------- */

  async createDevice(orgId, d) {
    await this._q(
      'INSERT INTO devices (id, org_id, name, group_id, enrolled_at, last_seen) VALUES ($1,$2,$3,$4,$5,$6)',
      [d.id, orgId, d.name, d.groupId, d.enrolledAt, d.lastSeen]);
    return d;
  }

  async getDevice(orgId, deviceId) {
    const rows = await this._q(
      'SELECT id, org_id AS "orgId", name, group_id AS "groupId", enrolled_at AS "enrolledAt", last_seen AS "lastSeen" FROM devices WHERE org_id=$1 AND id=$2',
      [orgId, deviceId]);
    return rows[0] || null;
  }

  async touchDevice(orgId, deviceId, ts) {
    await this._q('UPDATE devices SET last_seen=$3 WHERE org_id=$1 AND id=$2', [orgId, deviceId, ts]);
  }

  async listDevices(orgId) {
    return this._q(
      'SELECT id, org_id AS "orgId", name, group_id AS "groupId", enrolled_at AS "enrolledAt", last_seen AS "lastSeen" FROM devices WHERE org_id=$1',
      [orgId]);
  }

  /* ---------- requests ---------- */

  async createRequest(orgId, r) {
    await this._q(
      `INSERT INTO requests
         (id, org_id, device_id, device_name, group_id, domain, reason, requested_min, granted_min, status, self_serve, created_at, decided_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.id, orgId, r.deviceId, r.deviceName, r.groupId, r.domain, r.reason,
       r.requestedMin ?? null, r.grantedMin ?? null, r.status, !!r.selfServe,
       r.createdAt, r.decidedAt ?? null, r.expiresAt ?? null]);
    return r;
  }

  async getRequest(orgId, reqId) {
    const rows = await this._q(`${REQ_SELECT} WHERE org_id=$1 AND id=$2`, [orgId, reqId]);
    return rows[0] || null;
  }

  async saveRequest(orgId, r) {
    await this._q(
      `UPDATE requests SET status=$3, granted_min=$4, decided_at=$5, expires_at=$6, reason=$7
       WHERE org_id=$1 AND id=$2`,
      [orgId, r.id, r.status, r.grantedMin ?? null, r.decidedAt ?? null, r.expiresAt ?? null, r.reason ?? null]);
  }

  async listRequests(orgId) {
    return this._q(`${REQ_SELECT} WHERE org_id=$1`, [orgId]);
  }

  async listRequestsByDevice(orgId, deviceId) {
    return this._q(`${REQ_SELECT} WHERE org_id=$1 AND device_id=$2`, [orgId, deviceId]);
  }

  async findPendingRequest(orgId, deviceId, domain) {
    const rows = await this._q(
      `${REQ_SELECT} WHERE org_id=$1 AND device_id=$2 AND domain=$3 AND status='pending' LIMIT 1`,
      [orgId, deviceId, domain]);
    return rows[0] || null;
  }

  async activeAllowances(orgId, deviceId, now) {
    return this._q(
      `SELECT domain, expires_at AS "expiresAt" FROM requests
       WHERE org_id=$1 AND device_id=$2 AND status='approved' AND expires_at > $3`,
      [orgId, deviceId, now]);
  }

  async countPendingRequests(orgId) {
    const rows = await this._q("SELECT COUNT(*)::int AS n FROM requests WHERE org_id=$1 AND status='pending'", [orgId]);
    return rows[0].n;
  }

  /* ---------- events / telemetry ---------- */

  async addEvent(orgId, e) {
    await this._q(
      'INSERT INTO events (id, org_id, device_id, domain, type, ts) VALUES ($1,$2,$3,$4,$5,$6)',
      [e.id, orgId, e.deviceId, e.domain, e.type, e.ts]);
  }

  async countBlockedSince(orgId, ts) {
    const rows = await this._q("SELECT COUNT(*)::int AS n FROM events WHERE org_id=$1 AND type='blocked' AND ts >= $2", [orgId, ts]);
    return rows[0].n;
  }

  async topBlockedDomains(orgId, sinceTs, limit) {
    return this._q(
      `SELECT domain, COUNT(*)::int AS count FROM events
       WHERE org_id=$1 AND type='blocked' AND ts >= $2
       GROUP BY domain ORDER BY count DESC LIMIT $3`,
      [orgId, sinceTs, limit]);
  }
}

const REQ_SELECT = `SELECT id, org_id AS "orgId", device_id AS "deviceId", device_name AS "deviceName",
  group_id AS "groupId", domain, reason, requested_min AS "requestedMin", granted_min AS "grantedMin",
  status, self_serve AS "selfServe", created_at AS "createdAt", decided_at AS "decidedAt", expires_at AS "expiresAt"
  FROM requests`;

module.exports = PgStore;
