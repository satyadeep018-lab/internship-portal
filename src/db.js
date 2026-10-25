'use strict';

const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('This project needs Node.js 22.13 or newer (built-in SQLite). You have ' + process.version + '.');
  process.exit(1);
}

const SCHEMA = path.join(__dirname, '..', 'db', 'schema.sql');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  return db;
}

module.exports = { openDb };
