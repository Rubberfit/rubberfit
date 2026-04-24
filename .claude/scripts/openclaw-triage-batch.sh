#!/usr/bin/env bash
# .claude/scripts/openclaw-triage-batch.sh
#
# Run openclaw-triage-issue.sh across every open issue in preview-only mode
# and dump all results to one markdown file for review.
#
# Usage:
#   .claude/scripts/openclaw-triage-batch.sh                    # all open issues
#   .claude/scripts/openclaw-triage-batch.sh --limit 5          # first 5 open issues
#   .claude/scripts/openclaw-triage-batch.sh --state all        # open + closed
#
# Output: .claude/reports/openclaw-triage-<YYYY-MM-DD-HHMM>.md
#
# Runtime: ~20-40s per issue on kimi-k2.6:cloud. 30 issues ~ 15 min.

set -euo pipefail

LIMIT=""
STATE="open"

while [ $# -gt 0 ]; do
  case "$1" in
    --limit) LIMIT="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT=$(git rev-parse --show-toplevel)
SCRIPT="$REPO_ROOT/.claude/scripts/openclaw-triage-issue.sh"
REPORT_DIR="$REPO_ROOT/.claude/reports"
mkdir -p "$REPORT_DIR"
STAMP=$(date +%Y-%m-%d-%H%M)
REPORT="$REPORT_DIR/openclaw-triage-$STAMP.md"

if [ ! -x "$SCRIPT" ]; then
  echo "error: $SCRIPT not found or not executable" >&2
  exit 1
fi

LIST_ARGS="--state $STATE --json number,title --jq '.[] | \"\(.number)\t\(.title)\"'"
[ -n "$LIMIT" ] && LIST_ARGS="--limit $LIMIT $LIST_ARGS"

# Collect issue numbers.
ISSUE_NUMBERS=()
while IFS=$'\t' read -r NUM _TITLE; do
  [ -n "$NUM" ] && ISSUE_NUMBERS+=("$NUM")
done < <(eval "gh issue list $LIST_ARGS")

TOTAL=${#ISSUE_NUMBERS[@]}
if [ "$TOTAL" -eq 0 ]; then
  echo "no issues to triage" >&2
  exit 0
fi

{
  printf '# OpenClaw batch triage — %s\n\n' "$(date '+%Y-%m-%d %H:%M')"
  printf '**Repo:** `%s`\n' "$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  printf '**Model:** `kimi-k2.6:cloud` via OpenClaw (agent: `triage`)\n'
  printf '**Total issues:** %s\n\n' "$TOTAL"
  printf 'To apply any single suggestion: `.claude/scripts/openclaw-triage-issue.sh <N> --apply`\n\n'
  printf '---\n\n'
} > "$REPORT"

echo "batch triage -> $REPORT ($TOTAL issues, ~$((TOTAL * 3)) min)"

i=0
for NUM in "${ISSUE_NUMBERS[@]}"; do
  i=$((i + 1))
  echo "[$i/$TOTAL] #$NUM ..."
  {
    printf '## Issue #%s\n\n' "$NUM"
    "$SCRIPT" "$NUM" --preview 2>&1 || printf '_(triage failed — see script output above)_\n'
    printf '\n---\n\n'
  } >> "$REPORT"
done

echo "done. report: $REPORT"
