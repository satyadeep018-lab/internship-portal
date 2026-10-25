'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInternship, validateApplication, validateListQuery } = require('../src/validation');
const { ValidationError } = require('../src/errors');

const good = { title: 'Backend Intern', domain: 'Full Stack Development', mode: 'Remote', location: 'India', skills: ['Node.js'], openings: 2 };
const fields = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof ValidationError); return e.details.map((d) => d.field); } assert.fail('expected ValidationError'); };

test('internship: accepts a valid record and trims text', () => {
  const out = validateInternship({ ...good, title: '  Backend Intern  ' });
  assert.equal(out.title, 'Backend Intern');
});

test('internship: reports every missing required field', () => {
  assert.deepEqual(fields(() => validateInternship({})).sort(), ['domain', 'location', 'mode', 'openings', 'skills', 'title']);
});

test('internship: rejects bad types, enums, ranges and unknown fields', () => {
  assert.ok(fields(() => validateInternship({ ...good, mode: 'Office' })).includes('mode'));
  assert.ok(fields(() => validateInternship({ ...good, openings: -1 })).includes('openings'));
  assert.ok(fields(() => validateInternship({ ...good, openings: 1.5 })).includes('openings'));
  assert.ok(fields(() => validateInternship({ ...good, skills: [] })).includes('skills'));
  assert.ok(fields(() => validateInternship({ ...good, hacker: 1 })).includes('hacker'));
  assert.ok(fields(() => validateInternship({ ...good, id: 'INT-999' })).includes('id')); // id not allowed here
});

test('internship: partial needs at least one field; non-objects rejected', () => {
  assert.deepEqual(fields(() => validateInternship({}, { partial: true })), ['body']);
  assert.deepEqual(fields(() => validateInternship(null)), ['body']);
  assert.deepEqual(fields(() => validateInternship([])), ['body']);
});

test('application: accepts valid data, lower-cases email, optional url', () => {
  const out = validateApplication({ name: 'Asha Rao', email: 'Asha@Example.com', portfolio_url: 'https://example.com/me' });
  assert.equal(out.email, 'asha@example.com');
  assert.equal(validateApplication({ name: 'Asha Rao', email: 'a@b.co' }).portfolio_url, null);
});

test('application: rejects missing name, invalid email and unsafe URLs', () => {
  assert.ok(fields(() => validateApplication({ email: 'a@b.co' })).includes('name'));
  assert.ok(fields(() => validateApplication({ name: '   ', email: 'a@b.co' })).includes('name'));
  assert.ok(fields(() => validateApplication({ name: 'Asha', email: 'not-an-email' })).includes('email'));
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://x.com', 'https://user:pw@example.com', 'nonsense']) {
    assert.ok(fields(() => validateApplication({ name: 'Asha', email: 'a@b.co', portfolio_url: url })).includes('portfolio_url'), url);
  }
});

test('list query: defaults, limits and bad values', () => {
  assert.deepEqual(validateListQuery({}), { page: 1, limit: 10, q: undefined, domain: undefined, mode: undefined, open: undefined });
  assert.equal(validateListQuery({ page: '2', limit: '5', open: 'true' }).open, true);
  for (const q of [{ page: '0' }, { limit: '51' }, { limit: 'abc' }, { mode: 'x' }, { open: 'yes' }, { nope: '1' }, { page: ['1', '2'] }]) {
    assert.throws(() => validateListQuery(q), ValidationError, JSON.stringify(q));
  }
});
