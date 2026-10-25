'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { ApiError, ValidationError } = require('./errors');
const { createRepository } = require('./repository');
const { validateInternship, validateApplication, validateListQuery } = require('./validation');
const { securityHeaders, makeLimiter } = require('./security');
const logger = require('./logger');
const { version } = require('../package.json');

const startedAt = Date.now();
const success = (data, extra) => ({ status: 'success', data, ...extra });
const failure = (code, message, details, requestId) => ({
  status: 'error',
  error: { code, message, ...(details ? { details } : {}), ...(requestId ? { requestId } : {}) }
});

// Every request gets a fresh id, returned in X-Request-Id and used in logs and error bodies.
function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

// Logs id, method, path, status and timing only. Never bodies, query strings, headers or keys.
// 5xx is logged as error, 4xx as warn. Successful health probes are skipped to keep logs readable.
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if ((req.path === '/health' || req.path === '/ready') && res.statusCode < 400) return;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, 'request', { id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
  });
  next();
}

// Compare secrets without leaking length or content through timing.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createApp(db, opts = {}) {
  const {
    logRequests = true,
    adminKey = '',
    rateLimits = {},
    trustProxy = 0,
    publicDir = path.join(__dirname, '..', 'public')
  } = opts;

  const repo = createRepository(db);
  const app = express();
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.use(requestContext);
  app.use(securityHeaders());
  if (logRequests) app.use(requestLogger);

  // Health checks: /health says the process is up, /ready also proves the database answers.
  app.get('/health', (req, res) => {
    res.json(success({ ok: true, version, uptime_s: Math.round((Date.now() - startedAt) / 1000) }));
  });
  app.get('/ready', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json(success({ ready: true }));
    } catch (e) {
      logger.error('not_ready', { id: req.id, name: e.name, code: e.code || null });
      res.status(503).json(failure('NOT_READY', 'The database is not available.', undefined, req.id));
    }
  });

  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', makeLimiter({ windowMs: 60 * 1000, limit: rateLimits.api ?? 100, message: 'Too many requests. Please slow down and try again shortly.' }));
  app.use(express.json({ limit: '10kb' }));

  const applyLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: rateLimits.apply ?? 10, message: 'Too many application attempts from this address. Please try again later.' });

  // Create, update and delete need the admin key: Authorization: Bearer <ADMIN_API_KEY>
  const requireAdmin = (req, res, next) => {
    if (!adminKey) throw new ApiError(403, 'ADMIN_DISABLED', 'Changing internships is not enabled on this server.');
    const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!match || !safeEqual(match[1], adminKey)) throw new ApiError(401, 'UNAUTHORIZED', 'A valid API key is required.');
    next();
  };

  const mustFind = (id) => {
    const found = repo.get(id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Internship not found.');
    return found;
  };
  const conflict = (message) => new ApiError(409, 'CONFLICT', message);

  app.get('/api/internships', (req, res) => {
    const query = validateListQuery(req.query);
    const { rows, total } = repo.list(query);
    res.json(success(rows, {
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
    }));
  });

  app.get('/api/internships/:id', (req, res) => {
    res.json(success(mustFind(req.params.id)));
  });

  app.post('/api/internships', requireAdmin, (req, res) => {
    const data = validateInternship(req.body ?? null, { allowId: true });
    if (data.id && repo.get(data.id)) throw conflict(`An internship with id ${data.id} already exists.`);
    let created;
    try {
      created = repo.create(data);
    } catch (e) {
      if (repo.isUniqueViolation(e)) throw conflict('An internship with that id already exists.');
      throw e;
    }
    res.status(201).location(`/api/internships/${created.id}`).json(success(created));
  });

  app.put('/api/internships/:id', requireAdmin, (req, res) => {
    mustFind(req.params.id);
    const data = validateInternship(req.body ?? null);
    const full = { applications_open: true, duration_weeks: null, ...data };
    res.json(success(repo.update(req.params.id, full)));
  });

  app.patch('/api/internships/:id', requireAdmin, (req, res) => {
    mustFind(req.params.id);
    const data = validateInternship(req.body ?? null, { partial: true });
    res.json(success(repo.update(req.params.id, data)));
  });

  app.delete('/api/internships/:id', requireAdmin, (req, res) => {
    mustFind(req.params.id);
    repo.remove(req.params.id);
    res.json(success({ id: req.params.id, deleted: true }));
  });

  // Public: applicants submit here. Stricter rate limit, server-side validation, no applicant data in the response.
  app.post('/api/internships/:id/applications', applyLimiter, (req, res) => {
    const internship = mustFind(req.params.id);
    const data = validateApplication(req.body ?? null);
    if (!internship.applications_open) throw conflict('Applications are closed for this internship.');
    if (repo.hasApplied(internship.id, data.email)) throw conflict('This email has already applied to this internship.');
    let application;
    try {
      application = repo.addApplication(internship.id, data);
    } catch (e) {
      if (repo.isUniqueViolation(e)) throw conflict('This email has already applied to this internship.');
      throw e;
    }
    res.status(201).json(success(application));
  });

  // The frontend: same origin as the API, so no CORS is needed or enabled.
  // Assets are cached for 5 minutes; the HTML is always revalidated so new deploys show up quickly.
  app.use(express.static(publicDir, {
    dotfiles: 'ignore',
    maxAge: '5m',
    setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); }
  }));

  app.use((req, res) => {
    res.status(404).json(failure('NOT_FOUND', 'Route not found.', undefined, req.id));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json(failure('VALIDATION_ERROR', 'Some fields are invalid.', err.details, req.id));
    if (err instanceof ApiError) return res.status(err.status).json(failure(err.code, err.message, undefined, req.id));
    if (err.type === 'entity.parse.failed') return res.status(400).json(failure('INVALID_JSON', 'The request body is not valid JSON.', undefined, req.id));
    if (err.type === 'entity.too.large') return res.status(413).json(failure('PAYLOAD_TOO_LARGE', 'The request body is too large.', undefined, req.id));
    logger.error('unhandled_error', { id: req.id, name: err.name, code: err.code || null }); // never the message, body or stack
    return res.status(500).json(failure('INTERNAL_ERROR', 'Something went wrong.', undefined, req.id));
  });

  return app;
}

module.exports = { createApp };
