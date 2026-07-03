'use strict';
const fs = require('node:fs');
const path = require('node:path');
const seed = require('./seed');

const FILE = path.join(__dirname, 'data.json');
let db = null;

function load() {
  if (fs.existsSync(FILE)) {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    db = seed();
    save();
  }
  return db;
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function get() {
  if (!db) load();
  return db;
}

module.exports = { load, save, get, FILE };
