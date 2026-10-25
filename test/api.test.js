'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createRepository } = require('../src/repository');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'internships-seed.json'), 'utf8')).internships;
const KEY = 'test-admin-key-0123456789';
const ADMIN = { Authorization: 'Bearer ' + KEY };
let server;
let base;

test.before(async () => {
  const db = openDb(':memory:');
  createRepository(db).seedMany(seed);
  server = createApp(db, { logRequests: false, adminKey: KEY, rateLimits: { api: 10000, apply: 10000 } }).listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, url, body, { raw = false, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body))
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

const newRecord = { title: 'Testing Intern', domain: 'Full Stack Development', mode: 'Hybrid', location: 'Pune', skills: ['Jest', 'Node.js'], openings: 1 };

test('GET /api/internships returns the envelope with pagination', async () => {
  const r = await call('GET', '/api/internships');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'success');
  assert.equal(r.json.data.length, 5);
  assert.deepEqual(r.json.pagination, { page: 1, limit: 10, total: 5, totalPages: 1 });
});

test('pagination and filters work together', async () => {
  const p = await call('GET', '/api/internships?limit=2&page=3');
  assert.equal(p.json.data.length, 1);
  assert.equal(p.json.pagination.totalPages, 3);
  assert.equal((await call('GET', '/api/internships?domain=ui%2Fux')).json.pagination.total, 1);
  assert.equal((await call('GET', '/api/internships?mode=Remote')).json.pagination.total, 3);
  assert.equal((await call('GET', '/api/internships?q=sql&mode=Hybrid')).json.pagination.total, 1);
  assert.equal((await call('GET', '/api/internships?q=%25')).json.pagination.total, 0);
});

test('invalid query values return 400 VALIDATION_ERROR', async () => {
  for (const url of ['?page=0', '?limit=1000', '?mode=Office', '?unknown=1']) {
    const r = await call('GET', '/api/internships' + url);
    assert.equal(r.status, 400, url);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  }
});

test('GET detail: 200 for known id, 404 for unknown', async () => {
  assert.equal((await call('GET', '/api/internships/INT-102')).json.data.title, 'API Engineering Intern');
  const missing = await call('GET', '/api/internships/INT-999');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'NOT_FOUND');
});

test('admin writes: create, replace, update and delete with a valid key', async () => {
  const created = await call('POST', '/api/internships', newRecord, { headers: ADMIN });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.id, 'INT-106');
  assert.equal(created.headers.get('location'), '/api/internships/INT-106');

  assert.equal((await call('PUT', '/api/internships/INT-106', { ...newRecord, title: 'Replaced Intern' }, { headers: ADMIN })).json.data.title, 'Replaced Intern');
  const patch = await call('PATCH', '/api/internships/INT-106', { openings: 9 }, { headers: ADMIN });
  assert.equal(patch.json.data.openings, 9);
  assert.equal((await call('PATCH', '/api/internships/INT-106', {}, { headers: ADMIN })).status, 400);

  const del = await call('DELETE', '/api/internships/INT-106', undefined, { headers: ADMIN });
  assert.deepEqual(del.json.data, { id: 'INT-106', deleted: true });
  assert.equal((await call('GET', '/api/internships/INT-106')).status, 404);
});

test('admin writes: rejected without a valid key', async () => {
  assert.equal((await call('POST', '/api/internships', newRecord)).status, 401);
  assert.equal((await call('POST', '/api/internships', newRecord, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call('POST', '/api/internships', newRecord, { headers: { Authorization: 'Basic abc' } })).status, 401);
  assert.equal((await call('PUT', '/api/internships/INT-101', newRecord)).status, 401);
  assert.equal((await call('PATCH', '/api/internships/INT-101', { openings: 1 })).status, 401);
  const del = await call('DELETE', '/api/internships/INT-101');
  assert.equal(del.status, 401);
  assert.equal(del.json.error.code, 'UNAUTHORIZED');
  assert.equal((await call('GET', '/api/internships/INT-101')).status, 200); // still there
});

test('admin writes: validation errors, duplicates and bad JSON with a valid key', async () => {
  const bad = await call('POST', '/api/internships', { title: 'x' }, { headers: ADMIN });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error.details.length >= 5);
  assert.equal((await call('POST', '/api/internships', { ...newRecord, id: 'INT-101' }, { headers: ADMIN })).status, 409);
  const broken = await call('POST', '/api/internships', '{"title":', { raw: true, headers: ADMIN });
  assert.equal(broken.status, 400);
  assert.equal(broken.json.error.code, 'INVALID_JSON');
});

test('applications: successful submission', async () => {
  const ok = await call('POST', '/api/internships/INT-101/applications', { name: 'Asha Rao', email: 'asha@example.com', portfolio_url: 'https://example.com' });
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.json.data).sort(), ['created_at', 'id', 'internship_id']); // no applicant details echoed
  assert.equal((await call('POST', '/api/internships/INT-102/applications', { name: 'Asha Rao', email: 'asha@example.com' })).status, 201);
});

test('applications: rejected submissions', async () => {
  const url = '/api/internships/INT-104/applications';
  assert.equal((await call('POST', url, { name: 'Bo Li', email: 'bo@example.com' })).status, 201);

  const dup = await call('POST', url, { name: 'Bo Li', email: 'BO@example.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'CONFLICT');

  const missing = await call('POST', url, { email: 'c@example.com' });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.details[0].field, 'name');

  assert.equal((await call('POST', url, { name: '   ', email: 'c@example.com' })).status, 400);
  assert.equal((await call('POST', url, { name: 'Cy Ng', email: 'not-an-email' })).status, 400);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://u:p@example.com']) {
    const r = await call('POST', url, { name: 'Cy Ng', email: 'cy@example.com', portfolio_url: bad });
    assert.equal(r.status, 400, bad);
    assert.equal(r.json.error.details[0].field, 'portfolio_url');
  }
  assert.equal((await call('POST', url, { name: 'Cy Ng', email: 'cy@example.com', extra: 1 })).status, 400);
  assert.equal((await call('POST', '/api/internships/INT-999/applications', { name: 'Cy Ng', email: 'cy@example.com' })).status, 404);

  await call('PATCH', '/api/internships/INT-103', { applications_open: false }, { headers: ADMIN });
  assert.equal((await call('POST', '/api/internships/INT-103/applications', { name: 'Cy Ng', email: 'cy@example.com' })).status, 409);
});

test('unknown routes return a JSON 404', async () => {
  const r = await call('GET', '/api/nothing');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'NOT_FOUND');
});
