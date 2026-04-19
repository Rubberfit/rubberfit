#!/usr/bin/env bash
#
# Smoke-test a running rema-api instance (Task 9.5).
#
# Covers the three surfaces that MUST work end-to-end before we
# flip the USE_RUST_CUT_HISTORY flag:
#   1. /health is 200.
#   2. /openapi.json is 200 + begins with `{"openapi"`.
#   3. /api/v2/cuts/history returns JSON with a provided bearer
#      token (401 without one proves the middleware is live).
#
# Usage:
#   REMA_API_URL=https://rema-api-staging.fly.dev \
#   REMA_API_JWT=eyJ... \
#     ./engine/crates/rema-api/scripts/smoke.sh
#
# Exit 0 on full pass, non-zero with a diagnostic on the first
# failing check — fail-fast so CI/manual runs stop at the first
# broken invariant.

set -euo pipefail

: "${REMA_API_URL:?REMA_API_URL must be set (e.g. https://rema-api-staging.fly.dev)}"
TOKEN="${REMA_API_JWT:-}"

BASE="${REMA_API_URL%/}"

say() { printf "\033[1;36m==>\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m[ok]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

say "GET $BASE/health"
health=$(curl -fsS "$BASE/health") || die "/health did not return 2xx"
echo "  $health"
[[ "$health" == *'"status":"ok"'* ]] || die "health body missing status=ok"
ok "health"

say "GET $BASE/openapi.json"
openapi=$(curl -fsS "$BASE/openapi.json" | head -c 64)
[[ "$openapi" == '{'*'"openapi"'* ]] || die "openapi.json body unexpected: $openapi"
ok "openapi.json"

say "GET $BASE/api/v2/cuts/history (no token) — expect 401"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v2/cuts/history")
[[ "$code" == "401" ]] || die "expected 401 without token, got $code"
ok "401 without bearer"

if [[ -z "$TOKEN" ]]; then
  echo
  say "skip: auth smoke (set REMA_API_JWT to run the bearer path)"
  exit 0
fi

say "GET $BASE/api/v2/cuts/history?limit=1 (with token) — expect 200"
response=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v2/cuts/history?limit=1") \
  || die "authed request failed — is the token valid + issued by the same Supabase project?"
# Don't echo the full body (may contain PII) — just the length.
echo "  response: ${#response} bytes"
[[ "$response" == '['* ]] || die "expected JSON array, got: ${response:0:40}..."
ok "authed history"

echo
ok "ALL SMOKE CHECKS PASSED"
