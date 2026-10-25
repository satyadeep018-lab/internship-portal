# Security checklist

Each row says what was done, where, and how it is checked. Test names refer to files in `test/`.

| # | Control | Where | Checked by |
|---|---|---|---|
| 1 | **Server-side validation** of every input (types, lengths, enums; unknown fields rejected) | `src/validation.js` | `validation.test.js`, `api.test.js` |
| 2 | **Client-side validation** mirrors the server rules for fast feedback | `public/js/rules.js` | `client-rules.test.js` (700+ combinations must match the server) |
| 3 | **Parameterized queries** only; `%` and `_` in search are literal | `src/repository.js` | `security.test.js` injection test |
| 4 | **Rate limiting**: 100 API requests/min/IP, 10 applications/15 min/IP, JSON 429 with `Retry-After` | `src/security.js` | `security.test.js` |
| 5 | **Secure headers** (Helmet): strict CSP, `nosniff`, referrer policy, frame protection; `X-Powered-By` removed; API responses `no-store` | `src/security.js` | `security.test.js` |
| 6 | **XSS defence**: `textContent` only, no inline scripts or styles, CSP blocks injected scripts | `public/` | `security.test.js` |
| 7 | **No CORS**: page and API share one origin | `src/app.js` | `security.test.js` |
| 8 | **Protected writes**: admin key (constant-time compare); routes disabled when no key is set | `src/app.js` | `api.test.js`, `security.test.js` |
| 9 | **Duplicates blocked** by database constraint and server check; email lower-cased | `db/schema.sql`, `src/app.js` | `api.test.js` |
| 10 | **Unsafe URLs rejected**: http and https only, no embedded credentials | `src/validation.js` | `api.test.js`, `client-rules.test.js` |
| 11 | **Safe structured logs**: ids, method, path, status, timing only; no bodies, queries, headers, keys or applicant data | `src/logger.js`, `src/app.js` | `security.test.js`, `logging.test.js` |
| 12 | **Minimal responses**: applying returns only ids and a timestamp; no endpoint lists applications | `src/app.js` | `api.test.js` |
| 13 | **Request size limit** (10 KB) | `src/app.js` | `security.test.js` |
| 14 | **No leaked internals**: generic 500 with only a request id; database errors never shown; dotfiles and database folders not served | `src/app.js` | `logging.test.js`, `security.test.js` |
| 15 | **Health checks reveal nothing sensitive**: only ok, version, uptime, and ready or not | `src/app.js` | `logging.test.js` |
| 16 | **Secrets**: `.env` and the database are git-ignored; `.env.example` holds no real values | `.gitignore` | manual: `git status` |
| 17 | **Clean shutdown** on SIGTERM so requests and the database are not cut off mid-write | `src/server.js` | manual |
| 18 | **Dependencies**: small set (Express, Helmet, express-rate-limit); audited | `package.json` | `npm audit` in TEST-REPORT.md |

## Not covered

- **HTTPS** is provided by the host, not the app. Set `TRUST_PROXY=1` only when exactly one trusted proxy sits in front, otherwise rate limiting sees the wrong address. Some hosts put more than one proxy in front, in which case users may share a limit.
- **CSRF** is not needed because there are no cookies or sessions. Revisit if login is added.
- **Bots and spam:** only rate limits; no CAPTCHA or email verification.
- **Stored applicant data** is unencrypted in SQLite. Do not collect real personal data in this practice project.
- **Single shared admin key:** not suitable for a team.
- **Rate-limit counters** live in memory, so they reset on restart and are per server.
