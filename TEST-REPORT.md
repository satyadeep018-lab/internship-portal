# Test report

Environment: Windows, Git Bash, Node (version in section 1).

## 1. Regression: automated tests

Command: `npm test`

```
Node v24.22.1: tests 42, pass 42, fail 0
```

Covers: list, filters and pagination; admin create, update and delete (and rejection without a key); successful and rejected applications (missing or blank name, invalid email, unsafe URLs, unknown fields, duplicates, closed internship); client and server rules agreeing on 700+ inputs; secure headers; both rate limits; SQL injection strings; oversized bodies; JSON log format, request ids, log-leak checks; health and readiness including a database failure; caching headers; accessibility and contrast checks; page-weight budget.

## 2. Security: dependency audit

Command: `npm audit`

```
found 0 vulnerabilities
```

Controls and where each is tested: see [SECURITY.md](SECURITY.md).

## 3. Performance

Command: `npm run perf` (in-process, rate limits off, local machine)

```
Node v24.22.1, all five URLs PASS: p95 between 4.4 ms and 17.8 ms (budget 100 ms)
```

Budget: p95 under 100 ms per URL. Frontend weight budget (under 70 KB) is enforced by `test/quality.test.js`.

### Lighthouse (Chrome DevTools, Lighthouse tab, Mobile, `npm start` running)

| Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|
| LH_PERF | LH_A11Y | LH_BP | LH_SEO |

## 4. Accessibility

Automated (in `npm test`): language, one h1, zoom allowed, label for every field, skip link target, live region for the result count, dialog name, error messages linked to fields, visible focus style, reduced motion, and WCAG AA contrast for every colour pair.

Manual checks (fill in the Result column):

| Check | How | Result |
|---|---|---|
| Keyboard only | Tab through search, filters, card buttons, dialog and form; Esc closes the dialog and focus returns to the card | |
| Visible focus | Focus outline visible on every control | |
| Errors without colour | Invalid form shows "Error:" text, not only a red border | |
| 360px width | DevTools device toolbar at 360px; no horizontal scroll | |
| 320px width | Same at 320px | |
| 200% zoom | Browser zoom 200%; content still usable | |

## 5. Manual user-journey checks

Run `npm start` and open http://localhost:3000.

| Check | How | Result |
|---|---|---|
| Loading state | DevTools Network, throttling Slow 4G, reload; spinner shows | |
| Cards from the API | Five cards; Network tab shows `GET /api/internships` | |
| Filters, search and shareable URL | Pick a domain and mode, search `sql`; the address bar updates; reload keeps the view | |
| Empty state | Search `zzz`; message and Clear filters button | |
| Error and retry | Network, tick Offline, change a filter; error and Retry appear; untick Offline, click Retry | |
| Client validation | Submit the empty form; errors show and no POST appears in Network | |
| Successful application | Valid name and email; success message with a reference number | |
| Duplicate | Apply again with the same email; the server's duplicate message shows | |
| Rate limit | Run the loop below; ten `201`, then `429` | |
| Headers | `curl -I http://localhost:3000/` shows `content-security-policy` and `x-request-id` | |
| Health | `curl http://localhost:3000/health` and `/ready` return success | |
| Logs | Server window shows JSON lines with no names or emails | |

Rate-limit loop (Git Bash, fresh server):

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/internships/INT-101/applications -H 'Content-Type: application/json' -d "{\"name\":\"Test User\",\"email\":\"user$i@example.com\"}"; done; echo
```

## 6. Deployed application

| Check | Result |
|---|---|
| Live URL opens and shows cards | |
| `/health` and `/ready` succeed on the live URL | |
| Free-tier sleep and data reset noted in README | Yes |

## 7. Known limitations

See "Not covered" in [SECURITY.md](SECURITY.md) and "Known limits" in the README.
