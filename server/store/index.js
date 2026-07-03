'use strict';
/*
 * Store factory + the data-access contract for the whole backend.
 *
 * server.js never touches storage directly — it awaits these methods, so the
 * underlying engine is swappable via the STORE env var without changing a
 * single handler:
 *
 *   STORE=json  (default)  → JsonStore, zero dependencies, data.json on disk
 *   STORE=pg               → PgStore, needs `npm install pg` + DATABASE_URL
 *
 * The contract every store implements (all async, all tenant-scoped by orgId
 * except the two global lookups login/enroll must do):
 *
 *   init(seedFn) / close()
 *   findAdminByEmail(email)                       -> admin{...,orgId} | null   (global)
 *   getOrg(orgId)                                 -> org | null
 *   getToken(token) / putToken(token, rec) / deleteToken(token)
 *   findEnrollmentCode(code)                      -> {code,orgId,groupId} | null (global)
 *   listEnrollmentCodes(orgId)
 *   listGroups(orgId) / getGroup(orgId,id) / updateGroupPolicy(orgId,id,patch)
 *   createDevice(orgId,d) / getDevice(orgId,id) / touchDevice(orgId,id,ts) / listDevices(orgId)
 *   createRequest(orgId,r) / getRequest(orgId,id) / saveRequest(orgId,r)
 *   listRequests(orgId) / listRequestsByDevice(orgId,deviceId)
 *   findPendingRequest(orgId,deviceId,domain) / activeAllowances(orgId,deviceId,now)
 *   countPendingRequests(orgId)
 *   addEvent(orgId,e) / countBlockedSince(orgId,ts) / topBlockedDomains(orgId,ts,limit)
 */
const JsonStore = require('./json-store');
const PgStore = require('./pg-store');
const seed = require('./seed');

function createStore() {
  const kind = (process.env.STORE || 'json').toLowerCase();
  switch (kind) {
    case 'json':
      return new JsonStore({ file: process.env.DATA_FILE });
    case 'pg':
    case 'postgres':
      return new PgStore({ url: process.env.DATABASE_URL });
    default:
      throw new Error(`Unknown STORE '${kind}' — use 'json' or 'pg'`);
  }
}

module.exports = { createStore, seed };
