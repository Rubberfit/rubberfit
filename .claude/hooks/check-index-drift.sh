#!/usr/bin/env bash
# Stop hook — non-blocking warning when the most recent commit (HEAD vs
# HEAD~1) touched domain folders without updating the matching index
# README. See AGENTS.md "Definition of done" (rules table near line 125)
# for the surfaces this enforces.
#
# Always exits 0. Warnings go to stderr so they're visible without
# polluting Claude's output stream. Silent on success — no output is the
# success signal.
#
# Heuristic (POSIX sh / Git Bash on Windows):
#   - Rules #1, #2, #3, #4, #5: only fire on adds/renames (A/R), not on
#     plain modifications. A README must catalog *new* entries; editing
#     an existing entity/service/use-case body doesn't necessarily
#     require a README touch.
#   - Rule #6 (di/tokens.ts, di/di-registration.ts): fire on any change
#     type (A/M/R). Renames or removals of tokens also warrant a README
#     touch, and detecting "new token symbol added" requires parsing
#     the diff body — the modified-file heuristic is conservative but
#     cheap and catches the common case (new token added).

set -u

# --- Resolve the diff range. If HEAD~1 doesn't exist (first commit,
# shallow clone), there's nothing to compare against — exit silently.
if ! git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  exit 0
fi

# Capture name-status pairs. Output format is one line per file:
#   <STATUS>\t<PATH>      for A/M/D
#   R<score>\t<OLD>\t<NEW> for renames (e.g. R100, R087)
# We normalize that into "<STATUS><TAB><PATH>" pairs (rename uses the
# NEW path, which is what the rules care about).
DIFF_RAW="$(git diff --name-status HEAD~1..HEAD 2>/dev/null || true)"
if [ -z "$DIFF_RAW" ]; then
  exit 0
fi

# Normalize: rename lines (R<score>) collapse to "R\t<new-path>".
# All other lines pass through. Strip Windows backslashes just in case.
DIFF_NORMALIZED="$(printf '%s\n' "$DIFF_RAW" | awk -F'\t' '
  /^R/ { print "R\t" $3; next }
  { print $1 "\t" $2 }
' | tr '\\' '/')"

# Build status-indexed lists for downstream rules.
PATHS_AR="$(printf '%s\n' "$DIFF_NORMALIZED" | awk -F'\t' '$1 == "A" || $1 == "R" { print $2 }')"
PATHS_ALL="$(printf '%s\n' "$DIFF_NORMALIZED" | awk -F'\t' '{ print $2 }')"

WARN_COUNT=0
HEADER_PRINTED=0
print_header() {
  if [ "$HEADER_PRINTED" -eq 0 ]; then
    {
      echo ""
      echo "[index-drift] domain files changed without a matching README update."
      echo "  See AGENTS.md \"Definition of done\" for the rules. This is a"
      echo "  non-blocking warning — update the README in this commit if"
      echo "  your work is done."
      echo ""
    } >&2
    HEADER_PRINTED=1
  fi
}

# fire_warn LABEL README EXAMPLES
fire_warn() {
  print_header
  echo "[index-drift] $1 changed without updating $2: $3" >&2
  WARN_COUNT=$((WARN_COUNT + 1))
}

# Rule helper: A/R-only rules. Args: pattern, readme, label.
check_add_rename() {
  pattern="$1"
  readme="$2"
  label="$3"
  matches="$(printf '%s\n' "$PATHS_AR" | grep -E "$pattern" || true)"
  if [ -n "$matches" ]; then
    if ! printf '%s\n' "$PATHS_ALL" | grep -qxF "$readme"; then
      examples="$(printf '%s\n' "$matches" | head -n 3 | paste -sd ',' -)"
      fire_warn "$label" "$readme" "$examples"
    fi
  fi
}

# Rule helper: any-status rule (rule #6). Args: pattern, readme, label.
check_any_status() {
  pattern="$1"
  readme="$2"
  label="$3"
  matches="$(printf '%s\n' "$PATHS_ALL" | grep -E "$pattern" || true)"
  if [ -n "$matches" ]; then
    if ! printf '%s\n' "$PATHS_ALL" | grep -qxF "$readme"; then
      examples="$(printf '%s\n' "$matches" | head -n 3 | paste -sd ',' -)"
      fire_warn "$label" "$readme" "$examples"
    fi
  fi
}

# 1. src/entities/*.ts (excluding value-objects/ and shared/) — A/R only
check_add_rename \
  '^src/entities/[^/]+\.ts$' \
  'src/entities/README.md' \
  'src/entities/*.ts'

# 2. src/entities/value-objects/*.ts — A/R only
check_add_rename \
  '^src/entities/value-objects/[^/]+\.ts$' \
  'src/entities/value-objects/README.md' \
  'src/entities/value-objects/*.ts'

# 3. src/application/services/*.interface.ts — A/R only
check_add_rename \
  '^src/application/services/[^/]+\.interface\.ts$' \
  'src/application/services/README.md' \
  'src/application/services/*.interface.ts'

# 4. src/application/use-cases/**/*.use-case.ts — A/R only
check_add_rename \
  '^src/application/use-cases/.+\.use-case\.ts$' \
  'src/application/use-cases/README.md' \
  'src/application/use-cases/*.use-case.ts'

# 5. app/actions/*.ts (directly under actions/, not subdirs) — A/R only
check_add_rename \
  '^app/actions/[^/]+\.ts$' \
  'app/actions/README.md' \
  'app/actions/*.ts'

# 6. di/tokens.ts or di/di-registration.ts — any change type
check_any_status \
  '^di/(tokens|di-registration)\.ts$' \
  'di/README.md' \
  'di/tokens.ts or di/di-registration.ts'

# Always exit 0 — informational, never blocking.
exit 0
