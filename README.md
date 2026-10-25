# Internship Portal (Production-Ready Capstone)

A student internship portal: browse, search and filter openings, inspect details, and apply. A static frontend (plain HTML, CSS, JavaScript) and an Express and SQLite API run from one server. This capstone adds the production layer on top of the earlier milestones: structured logging, health checks, hardening, automated accessibility, performance and regression checks, and deployment notes.

| | |
|---|---|
| **Live application** | https://internship-portal-p88e.onrender.com |
| **Repository** | https://github.com/satyadeep018-lab/internship-portal |
| **Walkthrough video (2 min)** | https://www.loom.com/share/884da6d184784e9bb5820047a7c71635 |
| **Test evidence** | [TEST-REPORT.md](TEST-REPORT.md) |
| **Security checklist** | [SECURITY.md](SECURITY.md) |

## The user journey

1. **Land and browse:** cards load from the API with a visible loading state. Filters and search combine, and the address bar updates, so a filtered view can be bookmarked or shared (`?q=sql&mode=Remote`).
2. **Inspect:** each card opens a details dialog (native `<dialog>`, keyboard and screen-reader friendly).
3. **Apply:** the form checks input as you submit, the server checks again, and a successful application returns a reference number. Closed internships say so on the card and in the dialog instead of showing a form.
4. **When things go wrong:** empty results, network failures (with Retry), timeouts, rate limiting (with a wait time) and server errors (with a reference id) each have a clear message.

## Architecture

```
Browser ──► Express server (src/app.js)
            ├─ request id, secure headers (Helmet + CSP), JSON request log
            ├─ /health  /ready                      (liveness and database check)
            ├─ /api/*   rate limit, validation, SQLite via parameterized queries
            └─ /*       static frontend from public/  (same origin, so no CORS)
                         │
                         └─► SQLite file (data/internships.db), schema in db/schema.sql
```

## Quick start (Git Bash)

Requires Node.js **22.13 or newer** (`node --version`).

```bash
npm install
npm run seed     # creates the database with the 5 seed records (safe to repeat)
npm start        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm test` | All automated tests (API, validation, security, logging, accessibility, budgets) |
| `npm run perf` | Response-time check against a budget (p95 under 100 ms) |
| `npm run check` | Tests plus `npm audit` |
| `npm run db:reset` | Deletes the database and reseeds |
| `npm run dev` | Restarts on file changes |

### Environment variables

Optional. Copy `.env.example` to `.env` (never commit it). The example contains no secrets.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port (hosts set this for you) |
| `DB_PATH` | `data/internships.db` | SQLite file |
| `ADMIN_API_KEY` | empty | Enables create, update and delete. Empty means those routes are off. Use 16+ random characters |
| `RATE_LIMIT_MAX` | 100 | API requests per minute per IP |
| `APPLY_RATE_LIMIT_MAX` | 10 | Applications per 15 minutes per IP |
| `TRUST_PROXY` | 0 | Set to `1` behind one trusted reverse proxy (needed on most hosts so limits use the real client IP) |

## API

Success: `{ "status": "success", "data": ..., "pagination": ... }`. Error: `{ "status": "error", "error": { "code", "message", "details", "requestId" } }`.

| Method and path | Who | Success | Errors |
|---|---|---|---|
| `GET /health` | public | 200 (version, uptime) | |
| `GET /ready` | public | 200 | 503 if the database is down |
| `GET /api/internships` (`page`, `limit`, `q`, `domain`, `mode`, `open`) | public | 200 | 400, 429 |
| `GET /api/internships/:id` | public | 200 | 404, 429 |
| `POST /api/internships/:id/applications` | public | 201 | 400, 404, 409, 413, 429 |
| `POST`, `PUT`, `PATCH`, `DELETE /api/internships[/:id]` | admin key | 201 or 200 | 400, 401, 403, 404, 409 |

Admin calls send `Authorization: Bearer <ADMIN_API_KEY>`. Examples: `bash requests/api-examples.sh`.

## Logging and monitoring

Logs are one JSON object per line on stdout, so they are readable locally and searchable on any host:

```json
{"time":"2026-10-25T10:15:02.114Z","level":"info","msg":"request","id":"6c1e...","method":"POST","path":"/api/internships/INT-101/applications","status":201,"ms":14}
```

- `info` for success, `warn` for 4xx, `error` for 5xx and unexpected failures
- Every response has an `X-Request-Id` header, and error bodies include the same id, so a user's "reference" can be found in the logs
- **Never logged:** request bodies, query strings, headers, API keys, names, emails or links. Unexpected errors log only the error name and code. Tests enforce this
- Successful `/health` and `/ready` probes are not logged, to keep logs useful
- On `SIGTERM` (deploys and restarts) the server stops accepting requests, finishes current ones and closes the database

## Quality checks

| Area | How it is checked | Evidence |
|---|---|---|
| Regression | `npm test` (42 tests) | [TEST-REPORT.md](TEST-REPORT.md) |
| Accessibility | Static checks in `test/quality.test.js` (labels, landmarks, live region, dialog, focus styles, reduced motion, contrast of every colour pair), plus manual keyboard pass and Lighthouse | TEST-REPORT.md |
| Performance | `npm run perf` budget, page-weight budget (frontend under 70 KB), caching headers, Lighthouse | TEST-REPORT.md |
| Security | Security tests, `npm audit`, [SECURITY.md](SECURITY.md) | TEST-REPORT.md |

## Deploying (Render, free tier)

Vercel is not suitable because it cannot keep a SQLite file. On Render:

1. Push this repo to GitHub, then at https://render.com choose **New**, **Web Service**, and pick the repo.
2. **Build command:** `npm install`. **Start command:** `npm run seed && npm start`. **Instance type:** Free.
3. **Environment variables:** `NODE_VERSION` = `24`, `TRUST_PROXY` = `1`.
4. In the advanced settings, set the **Health Check Path** to `/health` (the label may differ slightly).
5. After the deploy, open the `.onrender.com` URL and check `/health` and `/ready`.

**Free-tier behaviour to expect:** the service sleeps after a period without traffic and takes about a minute to wake, and its disk is temporary. Applications are lost on every restart or redeploy, and the start command reloads the 5 seed records each time. Use a paid plan with a persistent disk, or PostgreSQL, for real data. Check Render's current free-tier terms before relying on this.

## Product and engineering decisions

- **One server, one origin.** Simpler deployment, no CORS, and the strict Content-Security-Policy can allow only `'self'`.
- **No framework on the frontend.** The page is small (under 70 KB total, no build step), loads fast on weak mobile connections, and is easy to audit for accessibility.
- **Server is the gatekeeper.** Client checks give instant feedback, but every rule is enforced again on the server, and a test proves the two stay in agreement.
- **Native `<dialog>`.** Gives focus trapping, Esc to close and correct semantics without extra code.
- **SQLite via built-in `node:sqlite`.** No native build step on Windows. The cost is that the file does not survive on temporary-disk hosts.
- **Admin writes behind a key, off by default.** Public visitors can read and apply; changing listings needs a key the server must be configured with.
- **Rate limits in memory.** Fine for one process. Several servers would need a shared store such as Redis.

## Known limits and next steps

- No user accounts, email verification or CAPTCHA; only rate limits slow abuse
- The admin key is one shared secret; a real admin area needs accounts and roles
- Duplicate-application checks use email only, with no verification that the address is real
- Possible next steps: an admin screen, email confirmation, PostgreSQL, a shared rate-limit store, end-to-end browser tests

## Project history

Built in stages: the responsive board (HTML, CSS, JavaScript), the REST API (Express, SQLite, validation, pagination), secure integration (rate limits, headers, tests), and this capstone (logging, health checks, polish, quality evidence, deployment).
