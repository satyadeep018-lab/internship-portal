'use strict';

const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

// Secure response headers. The CSP only allows scripts, styles and requests from this same origin,
// which is why the frontend uses no inline scripts, inline styles or third-party files.
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': null // off so http://localhost works; the host handles HTTPS
      }
    }
  });
}

// Fixed-window limiter per IP. Responds with the same JSON error envelope as the rest of the API,
// plus a Retry-After header (set by the library) and the request id for support.
function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ status: 'error', error: { code: 'RATE_LIMITED', message, requestId: req.id } });
    }
  });
}

module.exports = { securityHeaders, makeLimiter };
