#!/usr/bin/env bash
#
# Smoke-test a running rf-api instance.
#
# Covers the surfaces that MUST work end-to-end before flag flips:
#   1. /health is 200.
#   2. /openapi.json is 200 + begins with `{"openapi"`.
#   3. /api/v2/cuts/history gates on a bearer (401 w/o, 200 with).
#   4. /api/v2/inventory/material-types gates on a bearer (401 w/o,
#      200 with).
#   5. /api/v2/inventory/rolls gates on a bearer (401 w/o, 200 with).
#   6. /api/v2/inventory/rolls/stats/inventory-value returns JSON
#      with `value` field when authed.
#
# Usage:
#   RF_API_URL=https://rf-api-archanchor.fly.dev \
#   RF_API_JWT=eyJ... \
#     ./engine/crates/rf-api/scripts/smoke.sh
#
# Exit 0 on full pass, non-zero with a diagnostic on the first
# failing check — fail-fast so CI/manual runs stop at the first
# broken invariant.

set -euo pipefail

: "${RF_API_URL:?RF_API_URL must be set (e.g. https://rf-api-staging.fly.dev)}"
TOKEN="${RF_API_JWT:-}"

BASE="${RF_API_URL%/}"

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

expect_401() {
  local path="$1"
  local label="$2"
  say "GET $BASE$path (no token) — expect 401"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  [[ "$code" == "401" ]] || die "expected 401 for $label, got $code"
  ok "$label 401 without bearer"
}

expect_401 "/api/v2/cuts/history" "cuts.history"
expect_401 "/api/v2/inventory/material-types" "inventory.material-types"
expect_401 "/api/v2/inventory/suppliers" "inventory.suppliers"
expect_401 "/api/v2/inventory/material-suppliers" "inventory.material-suppliers"
expect_401 "/api/v2/inventory/rolls" "inventory.rolls"
expect_401 "/api/v2/inventory/rolls/stats/inventory-value" "inventory.rolls.stats"

if [[ -z "$TOKEN" ]]; then
  echo
  say "skip: auth smoke (set RF_API_JWT to run the bearer path)"
  exit 0
fi

authed_array() {
  local path="$1"
  local label="$2"
  say "GET $BASE$path (with token) — expect 200 + JSON array"
  local response
  response=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE$path") \
    || die "authed $label failed — is the token valid + from the same Supabase project?"
  echo "  response: ${#response} bytes"
  [[ "$response" == '['* ]] || die "$label expected JSON array, got: ${response:0:40}..."
  ok "authed $label"
}

authed_object_field() {
  local path="$1"
  local field="$2"
  local label="$3"
  say "GET $BASE$path (with token) — expect object with .$field"
  local response
  response=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE$path") \
    || die "authed $label failed"
  [[ "$response" == *"\"$field\""* ]] || die "$label body missing .$field: ${response:0:80}"
  ok "authed $label"
}

authed_array "/api/v2/cuts/history?limit=1" "cuts.history"
authed_array "/api/v2/inventory/material-types" "inventory.material-types"
authed_array "/api/v2/inventory/suppliers" "inventory.suppliers"
authed_array "/api/v2/inventory/rolls?status=active" "inventory.rolls"
authed_object_field \
  "/api/v2/inventory/rolls/stats/inventory-value" \
  "value" \
  "inventory.rolls.stats.inventory-value"

echo
ok "ALL SMOKE CHECKS PASSED"
