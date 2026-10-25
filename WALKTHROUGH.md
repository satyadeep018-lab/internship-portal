# Two-minute walkthrough script

Record your screen with your voice (Windows: press Win+G for Game Bar, or use OBS or Loom). Keep it under 2 minutes. Upload as **unlisted** on YouTube or as a "anyone with the link" file on Google Drive, then put the link in the README.

Open the live site (or http://localhost:3000) and the GitHub repo in two tabs before you start.

| Time | Show | Say (in your own words) |
|---|---|---|
| 0:00 | Live site home page | "This is an internship portal I built in stages: plain HTML, CSS and JavaScript on the front, Express and SQLite behind it." |
| 0:15 | Filters: pick a domain and mode, search `sql`, point at the URL changing | "Search and filters combine and are shareable through the address bar." |
| 0:30 | Open DevTools, tick Offline, change a filter, then Retry | "If the network fails, there is a clear error with Retry, plus loading and empty states." |
| 0:45 | Open a card, submit the empty form, then a valid one, then repeat the email | "The form is checked in the browser and again on the server. Duplicate applications are rejected, and success gives a reference number." |
| 1:05 | Press Tab through the page; resize to 360px | "It works by keyboard, shows focus, and has no sideways scrolling at phone width." |
| 1:20 | Terminal with server logs, then `/health` in the browser | "Logs are structured JSON with request ids and never contain applicant details. Health and readiness endpoints are ready for the host." |
| 1:35 | Repo: SECURITY.md and TEST-REPORT.md | "Security controls are listed and tested: rate limits, strict headers, safe SQL. 42 automated tests pass, including accessibility and performance budgets." |
| 1:50 | Repo README | "The README covers setup, deployment, and honest limits. Thanks for watching." |

Tips: do one practice run, zoom the browser to 125% so text is readable, and close other tabs.
