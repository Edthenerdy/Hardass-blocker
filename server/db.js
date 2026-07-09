'use strict';
const fs = require('node:fs');
const path = require('node:path');
const seed = require('./seed');

const FILE = path.join(__dirname, 'data.json');
let db = null;

function load() {
  if (fs.existsSync(FILE)) {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    migrate();
  } else {
    db = seed();
    save();
  }
  return db;
}

// Backfill fields added after a data.json was first written, so older dev data
// keeps working without a manual reset — including the single-org -> multi-org
// conversion.
function migrate() {
  if (!db.users) db.users = [];
  if (!db.checkouts) db.checkouts = [];
  if (!db.orgs) {
    const o = db.org || { id: 'org1', name: 'Organization', seats: 0 };
    o.groups = db.groups || [];
    o.enrollmentCodes = db.enrollmentCodes || [];
    if (o.subscriptionStatus === undefined) {
      o.plan = 'team_monthly';
      o.subscriptionStatus = 'active';
      o.currentPeriodEnd = Date.now() + 365 * 24 * 3600 * 1000;
    }
    db.orgs = [o];
    (db.admins || []).forEach(a => { if (!a.orgId) a.orgId = o.id; });
    (db.devices || []).forEach(d => { if (!d.orgId) d.orgId = o.id; });
    (db.requests || []).forEach(r => { if (!r.orgId) r.orgId = o.id; });
    (db.events || []).forEach(e => { if (!e.orgId) e.orgId = o.id; });
    Object.values(db.tokens || {}).forEach(t => { if ((t.kind === 'admin' || t.kind === 'device') && !t.orgId) t.orgId = o.id; });
    delete db.org; delete db.groups; delete db.enrollmentCodes;
  }
  save();
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function get() {
  if (!db) load();
  return db;
}

module.exports = { load, save, get, FILE };
