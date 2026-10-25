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

// Starts a fresh app (own database and own rate-limit counters) and returns helpers.
async function start(opts = {}) {
  const db = openDb(':memory:');
  createRepository(db).seedMany(seed);
  const server = createApp(db, { logRequests: false, adminKey: KEY, rateLimits: { api: 10000, apply: 10000 }, ...opts }).listen(0);
  await new Promise((r) => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, close: () => server.close() };
}
const post = (base, url, body, headers = {}) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('secure headers are set and the server does not advertise Express', async () => {
  const s = await start();
  const res = await fetch(s.base + '/api/internships');
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(!csp.includes('upgrade-insecure-requests'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('referrer-policy'));
  assert.ok(res.headers.get('x-frame-options'));
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null); // same-origin only, no CORS
  s.close();
});

test('the frontend is served from the same server with the same headers', async () => {
  const s = await start();
  const page = await fetch(s.base + '/');
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('<h1>Internship Board</h1>'));
  assert.ok(page.headers.get('content-security-policy'));
  assert.equal((await fetch(s.base + '/js/app.js')).status, 200);
  assert.equal((await fetch(s.base + '/js/rules.js')).status, 200);
  assert.equal((await fetch(s.base + '/db/schema.sql')).status, 404); // database files are not public
  assert.equal((await fetch(s.base + '/.env')).status, 404);
  s.close();
});

test('the page uses no inline scripts, inline styles or external files (so the CSP can stay strict)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'inline <script>');
  assert.ok(!/\sstyle=/i.test(html), 'inline style attribute');
  assert.ok(!/<style/i.test(html), '<style> block');
  assert.ok(!/(src|href)=["']https?:/i.test(html), 'external file');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js), 'unsafe DOM API');
});

test('API rate limit returns 429 with Retry-After and the JSON error envelope', async () => {
  const s = await start({ rateLimits: { api: 3, apply: 10000 } });
  for (let i = 0; i < 3; i++) assert.equal((await fetch(s.base + '/api/internships')).status, 200);
  const res = await fetch(s.base + '/api/internships');
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('retry-after'));
  const body = await res.json();
  assert.equal(body.status, 'error');
  assert.equal(body.error.code, 'RATE_LIMITED');
  s.close();
});

test('application endpoint has its own stricter limit', async () => {
  const s = await start({ rateLimits: { api: 10000, apply: 2 } });
  const url = '/api/internships/INT-101/applications';
  assert.equal((await post(s.base, url, { name: 'Ann Lee', email: 'ann@example.com' })).status, 201);
  assert.equal((await post(s.base, url, { name: 'Ann Lee', email: 'ann@example.com' })).status, 409);
  const third = await post(s.base, url, { name: 'Bob Roy', email: 'bob@example.com' });
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.code, 'RATE_LIMITED');
  assert.equal((await fetch(s.base + '/api/internships')).status, 200); // reading is not blocked
  s.close();
});

test('admin routes are disabled (403) when no ADMIN_API_KEY is configured', async () => {
  const s = await start({ adminKey: '' });
  const res = await post(s.base, '/api/internships', { title: 'x' }, { Authorization: 'Bearer anything' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'ADMIN_DISABLED');
  s.close();
});

test('SQL injection strings are treated as plain data (parameterized queries)', async () => {
  const s = await start();
  for (const q of ["' OR 1=1 --", "'; DROP TABLE internships; --", '" OR ""="', '%', '_']) {
    const r = await fetch(s.base + '/api/internships?q=' + encodeURIComponent(q));
    assert.equal(r.status, 200, q);
    assert.equal((await r.json()).pagination.total, 0, q);
  }
  const evil = "Robert'); DROP TABLE applications;--";
  assert.equal((await post(s.base, '/api/internships/INT-101/applications', { name: evil, email: 'bobby@example.com' })).status, 201);
  const row = s.db.prepare('SELECT applicant_name FROM applications WHERE applicant_email = ?').get('bobby@example.com');
  assert.equal(row.applicant_name, evil); // stored literally
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM internships').get().n, 5); // tables intact
  s.close();
});

test('oversized request bodies are rejected with 413', async () => {
  const s = await start();
  const res = await post(s.base, '/api/internships/INT-101/applications', { name: 'x'.repeat(20000), email: 'a@b.co' });
  assert.equal(res.status, 413);
  s.close();
});

test('logs never contain applicant details, API keys or request bodies', async () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  const s = await start({ logRequests: true });
  try {
    await post(s.base, '/api/internships/INT-101/applications', { name: 'Secret Person', email: 'secret.person@example.com', portfolio_url: 'https://secret.example.com/me' });
    await post(s.base, '/api/internships', { title: 'x' }, { Authorization: 'Bearer ' + KEY });
    await fetch(s.base + '/api/internships?q=secret.person@example.com');
  } finally {
    console.log = original;
    s.close();
  }
  const entries = lines.map((l) => JSON.parse(l));
  assert.ok(entries.some((e) => e.method === 'POST' && e.path === '/api/internships/INT-101/applications' && e.status === 201), 'requests are logged');
  const log = lines.join('\n');
  for (const secret of ['Secret Person', 'secret.person', 'secret.example.com', KEY, 'Bearer']) {
    assert.ok(!log.includes(secret), 'log leaked: ' + secret);
  }
});

test('static assets are cacheable but the HTML is always revalidated', async () => {
  const s = await start();
  const asset = await fetch(s.base + '/js/app.js');
  assert.match(asset.headers.get('cache-control'), /max-age=300/);
  const page = await fetch(s.base + '/');
  assert.match(page.headers.get('cache-control'), /no-cache/);
  s.close();
});
