'use strict';

const { ValidationError } = require('./errors');

const MODES = ['Remote', 'Hybrid', 'On-site'];
const ID_RE = /^INT-\d{3,6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const REQUIRED = ['title', 'domain', 'mode', 'location', 'skills', 'openings'];
const FIELDS = [...REQUIRED, 'applications_open', 'duration_weeks'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function text(value, field, min, max, errors) {
  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} must be a string.` });
    return undefined;
  }
  const v = value.trim();
  if (v.length < min || v.length > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max} characters.` });
    return undefined;
  }
  if (CONTROL_RE.test(v)) {
    errors.push({ field, message: `${field} contains invalid characters.` });
    return undefined;
  }
  return v;
}

function integer(value, field, min, max, errors) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push({ field, message: `${field} must be a whole number between ${min} and ${max}.` });
    return undefined;
  }
  return value;
}

// Only http and https links, no embedded credentials. Rejects javascript:, data:, file: and similar.
function webUrl(value, field, errors) {
  const bad = () => { errors.push({ field, message: `${field} must be a valid http or https URL.` }); return undefined; };
  if (typeof value !== 'string' || value.length > 2048) return bad();
  let u;
  try { u = new URL(value.trim()); } catch (e) { return bad(); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return bad();
  return u.href;
}

function checkObject(body, allowed, errors) {
  if (!isObject(body)) {
    throw new ValidationError([{ field: 'body', message: 'Send a JSON object as the request body (Content-Type: application/json).' }]);
  }
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors.push({ field: key, message: 'Unknown field.' });
  }
}

function validateInternship(body, { partial = false, allowId = false } = {}) {
  const errors = [];
  checkObject(body, allowId ? ['id', ...FIELDS] : FIELDS, errors);
  const out = {};

  if (partial && Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'Send at least one field to update.' });
  }
  if (!partial) {
    for (const f of REQUIRED) if (!has(body, f)) errors.push({ field: f, message: `${f} is required.` });
  }

  if (allowId && has(body, 'id')) {
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) {
      errors.push({ field: 'id', message: 'id must look like INT-101.' });
    } else out.id = body.id;
  }
  if (has(body, 'title')) out.title = text(body.title, 'title', 3, 100, errors);
  if (has(body, 'domain')) out.domain = text(body.domain, 'domain', 2, 60, errors);
  if (has(body, 'location')) out.location = text(body.location, 'location', 2, 60, errors);
  if (has(body, 'mode')) {
    if (!MODES.includes(body.mode)) errors.push({ field: 'mode', message: `mode must be one of: ${MODES.join(', ')}.` });
    else out.mode = body.mode;
  }
  if (has(body, 'skills')) {
    if (!Array.isArray(body.skills) || body.skills.length < 1 || body.skills.length > 10) {
      errors.push({ field: 'skills', message: 'skills must be an array of 1 to 10 items.' });
    } else out.skills = body.skills.map((s) => text(s, 'skills', 1, 40, errors));
  }
  if (has(body, 'openings')) out.openings = integer(body.openings, 'openings', 0, 1000, errors);
  if (has(body, 'applications_open')) {
    if (typeof body.applications_open !== 'boolean') errors.push({ field: 'applications_open', message: 'applications_open must be true or false.' });
    else out.applications_open = body.applications_open;
  }
  if (has(body, 'duration_weeks')) {
    out.duration_weeks = body.duration_weeks === null ? null : integer(body.duration_weeks, 'duration_weeks', 1, 52, errors);
  }

  if (errors.length) throw new ValidationError(errors);
  return out;
}

function validateApplication(body) {
  const errors = [];
  checkObject(body, ['name', 'email', 'portfolio_url'], errors);
  const out = { portfolio_url: null };

  if (!has(body, 'name')) errors.push({ field: 'name', message: 'name is required.' });
  else out.name = text(body.name, 'name', 2, 100, errors);

  if (!has(body, 'email')) errors.push({ field: 'email', message: 'email is required.' });
  else {
    const e = text(body.email, 'email', 3, 254, errors);
    if (e !== undefined) {
      if (!EMAIL_RE.test(e)) errors.push({ field: 'email', message: 'email must be a valid email address.' });
      else out.email = e.toLowerCase();
    }
  }

  const rawUrl = body.portfolio_url;
  const urlIsEmpty = rawUrl === undefined || rawUrl === null || (typeof rawUrl === 'string' && rawUrl.trim() === '');
  if (!urlIsEmpty) out.portfolio_url = webUrl(rawUrl, 'portfolio_url', errors);

  if (errors.length) throw new ValidationError(errors);
  return out;
}

function validateListQuery(query) {
  const errors = [];
  for (const key of Object.keys(query)) {
    if (!['page', 'limit', 'q', 'domain', 'mode', 'open'].includes(key)) {
      errors.push({ field: key, message: 'Unknown query parameter.' });
    }
  }
  const get = (k) => {
    const v = query[k];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') { errors.push({ field: k, message: `${k} must be given once.` }); return undefined; }
    return v.trim();
  };
  const out = { page: 1, limit: 10, q: undefined, domain: undefined, mode: undefined, open: undefined };

  const page = get('page');
  if (page !== undefined) {
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000) errors.push({ field: 'page', message: 'page must be a whole number of 1 or more.' });
    else out.page = Number(page);
  }
  const limit = get('limit');
  if (limit !== undefined) {
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) errors.push({ field: 'limit', message: 'limit must be a whole number from 1 to 50.' });
    else out.limit = Number(limit);
  }
  const q = get('q');
  if (q) {
    if (q.length > 100) errors.push({ field: 'q', message: 'q must be 100 characters or fewer.' });
    else out.q = q;
  }
  const domain = get('domain');
  if (domain) {
    if (domain.length > 60) errors.push({ field: 'domain', message: 'domain must be 60 characters or fewer.' });
    else out.domain = domain;
  }
  const mode = get('mode');
  if (mode) {
    if (!MODES.includes(mode)) errors.push({ field: 'mode', message: `mode must be one of: ${MODES.join(', ')}.` });
    else out.mode = mode;
  }
  const open = get('open');
  if (open) {
    if (open !== 'true' && open !== 'false') errors.push({ field: 'open', message: 'open must be true or false.' });
    else out.open = open === 'true';
  }

  if (errors.length) throw new ValidationError(errors);
  return out;
}

module.exports = { MODES, validateInternship, validateApplication, validateListQuery };
