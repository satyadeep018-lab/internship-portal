'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createRepository } = require('../src/repository');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'internships-seed.json'), 'utf8')).internships;

// Starts an app, captures every log line it prints, and returns helpers.
async function start({ db, logRequests = true } = {}) {
  const real = db || openDb(':memory:');
  if (!db) createRepository(real).seedMany(seed);
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  const server = createApp(real, { logRequests, rateLimits: { api: 10000, apply: 10000 } }).listen(0);
  await new Promise((r) => server.on('listening', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    entries: () => lines.map((l) => JSON.parse(l)),
    close: () => { console.log = original; server.close(); }
  };
}

test('every request is logged as one JSON line with the expected fields', async () => {
  const s = await start();
  await fetch(s.base + '/api/internships');
  s.close();
  const e = s.entries().find((x) => x.msg === 'request');
  assert.ok(e, 'a request entry exists');
  for (const key of ['time', 'level', 'msg', 'id', 'method', 'path', 'status', 'ms']) assert.ok(key in e, key);
  assert.equal(e.level, 'info');
  assert.equal(e.path, '/api/internships');
  assert.ok(!Number.isNaN(Date.parse(e.time)));
});

test('responses carry a unique X-Request-Id that matches the log entry', async () => {
  const s = await start();
  const a = await fetch(s.base + '/api/internships');
  const b = await fetch(s.base + '/api/internships');
  s.close();
  const ida = a.headers.get('x-request-id');
  const idb = b.headers.get('x-request-id');
  assert.ok(ida && idb && ida !== idb);
  assert.ok(s.entries().some((x) => x.id === ida));
});

test('client errors are logged as warn, and error bodies include the request id', async () => {
  const s = await start();
  const res = await fetch(s.base + '/api/internships/INT-999');
  const body = await res.json();
  s.close();
  assert.equal(res.status, 404);
  assert.equal(body.error.requestId, res.headers.get('x-request-id'));
  const e = s.entries().find((x) => x.status === 404);
  assert.equal(e.level, 'warn');
});

test('successful health probes are not logged', async () => {
  const s = await start();
  await fetch(s.base + '/health');
  await fetch(s.base + '/ready');
  s.close();
  assert.equal(s.entries().filter((x) => x.path === '/health' || x.path === '/ready').length, 0);
});

test('/health reports ok with version and uptime; /ready checks the database', async () => {
  const s = await start({ logRequests: false });
  const health = await (await fetch(s.base + '/health')).json();
  assert.equal(health.data.ok, true);
  assert.match(health.data.version, /^\d+\.\d+\.\d+/);
  assert.equal(typeof health.data.uptime_s, 'number');
  const ready = await fetch(s.base + '/ready');
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).data.ready, true);
  s.close();
});

test('database failure: /ready returns 503, other routes return a generic 500, and logs hide the message', async () => {
  const broken = { prepare() { throw Object.assign(new Error('secret database detail'), { code: 'ERR_BROKEN' }); } };
  const s = await start({ db: broken });
  const ready = await fetch(s.base + '/ready');
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).error.code, 'NOT_READY');

  const res = await fetch(s.base + '/api/internships/INT-101');
  const body = await res.json();
  s.close();
  assert.equal(res.status, 500);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(body.error.message, 'Something went wrong.');
  assert.ok(body.error.requestId);

  const logged = JSON.stringify(s.entries());
  assert.ok(logged.includes('unhandled_error'));
  assert.ok(logged.includes('ERR_BROKEN'));
  assert.ok(!logged.includes('secret database detail'));
});
