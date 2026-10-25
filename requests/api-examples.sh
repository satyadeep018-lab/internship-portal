#!/usr/bin/env bash
# Usage (Git Bash), with the server running:
#   bash requests/api-examples.sh                      # public endpoints only
#   ADMIN_API_KEY=your-key bash requests/api-examples.sh   # also tries create/update/delete
BASE="${BASE:-http://localhost:3000}"
H='Content-Type: application/json'

echo '--- security headers (look for content-security-policy, x-content-type-options)'
curl -s -I "$BASE/" | grep -i -E 'content-security-policy|x-content-type-options|referrer-policy|x-frame-options|x-powered-by' ; echo
echo '--- list';                  curl -s "$BASE/api/internships?limit=2&page=1"; echo
echo '--- filter: Remote + sql';  curl -s "$BASE/api/internships?mode=Remote&q=sql"; echo
echo '--- injection attempt in search (returns no results, harmless)'
curl -s -G "$BASE/api/internships" --data-urlencode "q=' OR 1=1 --"; echo
echo '--- apply (201)';           curl -s -X POST "$BASE/api/internships/INT-102/applications" -H "$H" \
  -d '{"name":"Asha Rao","email":"asha@example.com","portfolio_url":"https://example.com"}'; echo
echo '--- apply again (409 duplicate)'; curl -s -X POST "$BASE/api/internships/INT-102/applications" -H "$H" \
  -d '{"name":"Asha Rao","email":"asha@example.com"}'; echo
echo '--- apply missing name (400)';  curl -s -X POST "$BASE/api/internships/INT-102/applications" -H "$H" -d '{"email":"b@example.com"}'; echo
echo '--- apply bad email (400)';     curl -s -X POST "$BASE/api/internships/INT-102/applications" -H "$H" -d '{"name":"Bo Li","email":"nope"}'; echo
echo '--- apply unsafe url (400)';    curl -s -X POST "$BASE/api/internships/INT-102/applications" -H "$H" \
  -d '{"name":"Bo Li","email":"bo@example.com","portfolio_url":"javascript:alert(1)"}'; echo
echo '--- create WITHOUT key (401 or 403)'; curl -s -X POST "$BASE/api/internships" -H "$H" \
  -d '{"title":"Testing Intern","domain":"Full Stack Development","mode":"Hybrid","location":"Pune","skills":["Jest"],"openings":1}'; echo

if [ -n "$ADMIN_API_KEY" ]; then
  A="Authorization: Bearer $ADMIN_API_KEY"
  echo '--- create WITH key (201)'; curl -s -X POST "$BASE/api/internships" -H "$H" -H "$A" \
    -d '{"title":"Testing Intern","domain":"Full Stack Development","mode":"Hybrid","location":"Pune","skills":["Jest"],"openings":1}'; echo
  echo '--- delete it (200)';       curl -s -X DELETE "$BASE/api/internships/INT-106" -H "$A"; echo
fi
