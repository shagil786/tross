#!/usr/bin/env bash
# Verification harness for the Tross LinkedIn Profile API.
# Usage: ./verify.sh [BASE_URL]
# Requires the server to be running (e.g. PORT=4000 node --env-file=.env dist/src/server.js)
# Reads API_KEY and ADMIN_SETUP_KEY from ./.env (never committed).
set -u

BASE="${1:-http://127.0.0.1:4000}"
if [ ! -f .env ]; then echo "verify.sh requires a local .env with API_KEY/ADMIN_SETUP_KEY"; exit 2; fi
env_val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
API_KEY="$(env_val API_KEY)"
ADMIN_KEY="$(env_val ADMIN_SETUP_KEY)"
[ -n "$API_KEY" ] && [ -n "$ADMIN_KEY" ] || { echo "verify.sh requires API_KEY and ADMIN_SETUP_KEY in .env"; exit 2; }

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ✅ $1"; }
bad()  { fail=$((fail+1)); echo "  ❌ $1"; }
check_status() { # desc expected actual
  if [ "$2" = "$3" ]; then ok "$1 (HTTP $3)"; else bad "$1 (expected $2, got $3)"; fi
}

echo "=== 1. Static checks ==="
cd "$(dirname "$0")"
if npm run check >/dev/null 2>&1; then ok "npm run check (typecheck)"; else bad "npm run check"; fi
if npm test >/dev/null 2>&1; then ok "npm test ($(npm test 2>/dev/null | grep -oE 'pass [0-9]+' | head -1 | awk '{print $2}') tests)"; else bad "npm test"; fi
if npm run build >/dev/null 2>&1; then ok "npm run build"; else bad "npm run build"; fi
echo

echo "=== 2. Health + auth + validation ==="
H=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
check_status "GET /health" 200 "$H"

S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H 'x-api-key: wrong-key' \
  -d '{"profile_url":"https://www.linkedin.com/in/x"}')
check_status "extract with wrong API key" 401 "$S"

S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://linkedin.com/company/acme"}')
check_status "extract with invalid (non-/in/) URL" 400 "$S"

S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{}')
check_status "extract with missing profile_url" 400 "$S"

S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/config" \
  -H 'content-type: application/json' -H 'x-admin-setup-key: bad-key' \
  -d '{"endpoints":{"profile":{"url":"https://x.com"}},"session_cookie":"s"}')
check_status "admin config with wrong admin key" 401 "$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
check_status "GET /admin page" 200 "$S"
echo

echo "=== 3. Live extraction: Bill Gates (expect full profile) ==="
R=$(curl -s -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://www.linkedin.com/in/williamhgates"}' --max-time 45)
echo "$R" | python3 -c '
import json,sys
d=json.load(sys.stdin)
p=d["data"]; m=d["meta"]
name = p.get("name") == "Bill Gates"
headline = bool(p.get("headline"))
loc = "Seattle" in (p.get("location") or "")
about = bool(p.get("about"))
img = bool(p.get("profile_image",{}).get("url"))
exp = len(p.get("experience",[])) >= 2
edu = len(p.get("education",[])) >= 1
cached = m.get("cached") is False
print("  name=Bill Gates:", "✅" if name else "❌", p.get("name"))
print("  headline present:", "✅" if headline else "❌")
print("  location Seattle:", "✅" if loc else "❌", p.get("location"))
print("  about present:", "✅" if about else "❌")
print("  profile_image url:", "✅" if img else "❌")
print("  experience >= 2:", "✅" if exp else "❌", len(p.get("experience",[])))
print("  education >= 1:", "✅" if edu else "❌", len(p.get("education",[])))
print("  cached=false first call:", "✅" if cached else "❌")
if not all([name,headline,loc,about,img,exp,edu,cached]): sys.exit(1)
'
if [ $? -eq 0 ]; then ok "Bill Gates full extraction"; else bad "Bill Gates full extraction"; fi
echo

echo "=== 4. Cache hit on second call ==="
C=$(curl -s -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://www.linkedin.com/in/williamhgates"}' --max-time 45 \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["meta"]["cached"])')
if [ "$C" = "True" ]; then ok "second call cached=True"; else bad "second call cached (got $C)"; fi
echo

echo "=== 5. Live extraction: Satya Nadella (education + degree + Feb dates) ==="
R=$(curl -s -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://www.linkedin.com/in/satyanadella"}' --max-time 45)
echo "$R" | python3 -c '
import json,sys
d=json.load(sys.stdin)
p=d["data"]
name = p.get("name") == "Satya Nadella"
edu = len(p.get("education",[])) >= 1
exp = len(p.get("experience",[])) >= 2
has_ms = any("Microsoft" in (e.get("company") or "") for e in p.get("experience",[]))
has_date = any((e.get("start_date") or "").startswith("2014") for e in p.get("experience",[]))
print("  name=Satya Nadella:", "✅" if name else "❌", p.get("name"))
print("  education >= 1:", "✅" if edu else "❌", len(p.get("education",[])))
print("  experience >= 2:", "✅" if exp else "❌", len(p.get("experience",[])))
print("  has Microsoft exp:", "✅" if has_ms else "❌")
print("  Microsoft start 2014:", "✅" if has_date else "❌")
if not all([name,edu,exp,has_ms,has_date]): sys.exit(1)
'
if [ $? -eq 0 ]; then ok "Satya Nadella extraction"; else bad "Satya Nadella extraction"; fi
echo

echo "=== 6. Live extraction: sindresorhus (skills) ==="
R=$(curl -s -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://www.linkedin.com/in/sindresorhus"}' --max-time 45)
echo "$R" | python3 -c '
import json,sys
d=json.load(sys.stdin)
p=d["data"]
name = p.get("name") == "Sindre Sorhus"
skills = len(p.get("skills",[])) >= 1
print("  name=Sindre Sorhus:", "✅" if name else "❌", p.get("name"))
print("  skills >= 1:", "✅" if skills else "❌", p.get("skills"))
if not (name and skills): sys.exit(1)
'
if [ $? -eq 0 ]; then ok "sindresorhus skills extraction"; else bad "sindresorhus skills extraction"; fi
echo

echo "=== 7. No fabricated data for unreachable profile (torvalds) ==="
R=$(curl -s -X POST "$BASE/v1/profiles/extract" \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"profile_url":"https://www.linkedin.com/in/torvalds"}' --max-time 45)
echo "$R" | python3 -c '
import json,sys
d=json.load(sys.stdin)
# Must NOT return name:"viewport" etc. Either an error, or a profile whose name
# is not a UI-chrome token.
if "error" in d:
    code = d["error"]["code"]
    print("  returned error:", "✅" if code in ("UPSTREAM_SCHEMA_MISMATCH","UPSTREAM_UNAVAILABLE","UPSTREAM_AUTH_REQUIRED") else "❌", code)
    sys.exit(0 if code in ("UPSTREAM_SCHEMA_MISMATCH","UPSTREAM_UNAVAILABLE","UPSTREAM_AUTH_REQUIRED") else 1)
name = d.get("data",{}).get("name")
chrome = name in ("viewport","topStart","como-pk","")
print("  name not UI-chrome:", "✅" if not chrome else "❌", repr(name))
sys.exit(0 if not chrome else 1)
'
if [ $? -eq 0 ]; then ok "no fabricated data for torvalds"; else bad "no fabricated data for torvalds"; fi
echo

echo "=============================================="
echo "RESULT: $pass passed, $fail failed"
echo "=============================================="
exit $((fail > 0 ? 1 : 0))
