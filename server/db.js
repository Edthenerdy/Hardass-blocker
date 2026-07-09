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
// keeps working without a manual reset.
function migrate() {
  if (!db.users) db.users = [];
  if (!db.checkouts) db.checkouts = [];
  if (db.org && db.org.subscriptionStatus === undefined) {
    db.org.plan = 'team_monthly';
    db.org.subscriptionStatus = 'active';
    db.org.currentPeriodEnd = Date.now() + 365 * 24 * 3600 * 1000;
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
