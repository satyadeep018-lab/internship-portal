'use strict';

// Static accessibility, contrast and page-weight checks on the frontend files.
// These do not replace a browser audit (Lighthouse) or a screen-reader pass; they catch regressions early.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'css', 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'js', 'app.js'), 'utf8');

test('a11y: language, single h1, viewport allows zoom', () => {
  assert.match(html, /<html lang="en"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)[1];
  assert.ok(!/user-scalable\s*=\s*(no|0)/i.test(viewport));
  assert.ok(!/maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport));
});

test('a11y: every input and select has a matching label', () => {
  const fields = [...html.matchAll(/<(input|select)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[2]);
  assert.ok(fields.length >= 6);
  for (const id of fields) assert.ok(new RegExp(`<label[^>]*for="${id}"`).test(html), 'no label for #' + id);
});

test('a11y: skip link target, live region, dialog name and error links exist', () => {
  assert.match(html, /<a class="skip" href="#results"/);
  assert.match(html, /id="results"/);
  assert.match(html, /id="count"[^>]*aria-live="polite"/);
  const labelledby = html.match(/<dialog[^>]*aria-labelledby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${labelledby}"`));
  for (const f of ['name', 'email', 'url']) {
    assert.ok(html.includes(`aria-describedby="${f}-err"`) && html.includes(`id="${f}-err"`), f);
  }
});

test('a11y: every static button has visible text, and generated card buttons have names', () => {
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) assert.ok(m[1].trim().length > 0, m[0]);
  assert.match(js, /setAttribute\('aria-label', label \+ ': ' \+ i\.title\)/);
});

test('a11y: visible focus style and reduced-motion support in the CSS', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

// WCAG 2.x contrast ratio from the CSS colour tokens.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const tokens = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
tokens.white = '#ffffff';

test('contrast: text and UI colour pairs meet WCAG AA', () => {
  const pairs = [
    ['ink', 'bg', 4.5], ['ink', 'surface', 4.5], ['ink', 'chip', 4.5],
    ['muted', 'bg', 4.5], ['muted', 'surface', 4.5],
    ['brand', 'surface', 4.5], ['brand', 'chip', 4.5],
    ['white', 'brand', 4.5], ['white', 'ink', 4.5],
    ['bad', 'surface', 4.5], ['ok', 'surface', 4.5],
    ['focus', 'bg', 3], ['focus', 'surface', 3]
  ];
  for (const [fg, bg, min] of pairs) {
    assert.ok(tokens[fg] && tokens[bg], `missing token ${fg} or ${bg}`);
    const r = ratio(tokens[fg], tokens[bg]);
    assert.ok(r >= min, `${fg} on ${bg} is ${r.toFixed(2)}, needs ${min}`);
  }
});

test('performance budget: the whole frontend stays under 70 KB', () => {
  let total = 0;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else total += fs.statSync(p).size;
  });
  walk(PUBLIC);
  assert.ok(total < 70 * 1024, `frontend is ${(total / 1024).toFixed(1)} KB`);
});
