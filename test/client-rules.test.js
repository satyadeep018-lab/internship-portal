'use strict';

// Proves the browser-side rules (public/js/rules.js) and the server rules (src/validation.js) agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../public/js/rules');
const { validateApplication } = require('../src/validation');
const { ValidationError } = require('../src/errors');

const names = ['', '   ', 'A', 'Asha Rao', 'x'.repeat(100), 'x'.repeat(101), 'Bad\u0000name', "Robert'); DROP TABLE internships;--"];
const emails = ['', 'a@b.co', 'asha@example.com', 'nope', 'a@b', 'a b@c.co', 'x'.repeat(250) + '@b.co', 'Asha@Example.COM', 'a@b.c'];
const urls = ['', '  ', 'https://example.com', 'http://localhost:3000/me', 'javascript:alert(1)', 'data:text/html,hi',
  'file:///etc/passwd', 'ftp://x.com', 'https://user:pw@example.com', 'nonsense', 'https://' + 'a'.repeat(2050)];

function serverFields(values) {
  const body = { name: values.name, email: values.email };
  if (values.url.trim() !== '') body.portfolio_url = values.url;
  try { validateApplication(body); return []; } catch (e) {
    assert.ok(e instanceof ValidationError);
    return e.details.map((d) => (d.field === 'portfolio_url' ? 'url' : d.field)).sort();
  }
}

test('client and server rules reject exactly the same fields', () => {
  let checked = 0;
  for (const name of names) for (const email of emails) for (const url of urls) {
    const values = { name, email, url };
    const client = Object.keys(Rules.validateApplicationForm(values)).sort();
    assert.deepEqual(client, serverFields(values), JSON.stringify(values).slice(0, 120));
    checked++;
  }
  assert.ok(checked > 700);
});

test('client rules give readable messages', () => {
  const e = Rules.validateApplicationForm({ name: '', email: 'nope', url: 'javascript:alert(1)' });
  assert.equal(e.name, 'Enter your full name.');
  assert.match(e.email, /valid email/);
  assert.match(e.url, /http/);
  assert.deepEqual(Rules.validateApplicationForm({ name: 'Asha Rao', email: 'asha@example.com', url: '' }), {});
});
