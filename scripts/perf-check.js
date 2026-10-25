'use strict';

// Starts the app in-process (in-memory database, rate limits off) and measures response times.
// Run: npm run perf   Exits with code 1 if any p95 is over the budget.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createRepository } = require('../src/repository');

const BUDGET_P95_MS = 100;
const REQUESTS = 300;
const CONCURRENCY = 10;
const targets = ['/', '/health', '/api/internships?limit=6', '/api/internships?q=sql&mode=Remote', '/api/internships/INT-101'];

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

(async () => {
  const db = openDb(':memory:');
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'internships-seed.json'), 'utf8')).internships;
  createRepository(db).seedMany(seed);
  const server = createApp(db, { logRequests: false, rateLimits: { api: 1e9, apply: 1e9 } }).listen(0);
  await new Promise((r) => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  let failed = false;
  console.log(`Node ${process.version}, ${REQUESTS} requests per URL, ${CONCURRENCY} at a time, budget p95 < ${BUDGET_P95_MS} ms\n`);
  console.log('URL'.padEnd(42) + 'p50 ms'.padStart(9) + 'p95 ms'.padStart(9) + 'max ms'.padStart(9) + '   bytes');
  for (const t of targets) {
    for (let i = 0; i < 10; i++) await (await fetch(base + t)).arrayBuffer(); // warm-up
    const times = [];
    let bytes = 0;
    let next = 0;
    const worker = async () => {
      while (next < REQUESTS) {
        next++;
        const start = performance.now();
        const res = await fetch(base + t);
        bytes = (await res.arrayBuffer()).byteLength;
        times.push(performance.now() - start);
        if (res.status !== 200) throw new Error(t + ' returned ' + res.status);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    times.sort((a, b) => a - b);
    const p95 = pct(times, 0.95);
    if (p95 > BUDGET_P95_MS) failed = true;
    console.log(t.padEnd(42) + pct(times, 0.5).toFixed(1).padStart(9) + p95.toFixed(1).padStart(9) + times[times.length - 1].toFixed(1).padStart(9) + String(bytes).padStart(9) + (p95 > BUDGET_P95_MS ? '  OVER BUDGET' : ''));
  }
  server.close();
  console.log(failed ? '\nResult: FAIL (over budget)' : '\nResult: PASS (all within budget)');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Perf check failed:', e.message); process.exit(1); });
