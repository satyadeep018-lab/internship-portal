'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');
const { createRepository } = require('./repository');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'internships.db');
const SEED = path.join(__dirname, '..', 'db', 'internships-seed.json');

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
  console.log('Database file removed.');
}

const db = openDb(DB_PATH);
const records = JSON.parse(fs.readFileSync(SEED, 'utf8')).internships;
const inserted = createRepository(db).seedMany(records);
console.log(`Seed complete: ${inserted} inserted, ${records.length - inserted} already present.`);
