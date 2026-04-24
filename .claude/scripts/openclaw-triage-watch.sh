#!/usr/bin/env bash
# .claude/scripts/openclaw-triage-watch.sh
#
# Poll GitHub for issues created since the last run and auto-triage each new
# one via openclaw-triage-issue.sh <N> --yes.
#
# Designed to run periodically as a LaunchAgent on macOS (see
# ai.openclaw.triage-watch.plist in this same directory). Stateless about
# issue IDs — relies on a "last-seen createdAt" timestamp to decide what's
# new. Idempotent per-timestamp so a re-run without new issues is a no-op.
#
# State file: $OPENCLAW_TRIAGE_STATE_DIR/triage-last-seen.txt
# Default:    ~/.openclaw/state/triage-last-seen.txt
#
# Bootstrap: on first run, if the state file is missing, it writes the
# current UTC ISO-8601 timestamp and exits without triaging. This ensures
# existing issues are NOT retroactively triaged — only issues created from
# that moment onward.

set -euo pipefail

REPO_SLUG="${OPENCLAW_TRIAGE_REPO:-Arc-and-Anchor/rema-portal}"
STATE_DIR="${OPENCLAW_TRIAGE_STATE_DIR:-$HOME/.openclaw/state}"
STATE_FILE="$STATE_DIR/triage-last-seen.txt"
LOG_DIR="${OPENCLAW_TRIAGE_LOG_DIR:-/tmp/openclaw}"
LOG_FILE="$LOG_DIR/triage-watch.log"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TRIAGE_SCRIPT="$SCRIPT_DIR/openclaw-triage-issue.sh"

mkdir -p "$STATE_DIR" "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE" >&2
}

# Dependency probe.
for cmd in gh jq "$TRIAGE_SCRIPT"; do
  if ! command -v "$cmd" >/dev/null 2>&1 && [ ! -x "$cmd" ]; then
    log "error: '$cmd' not on PATH or not executable"
    exit 1
  fi
done

# First-run bootstrap: stamp now, exit. Nothing retroactive.
if [ ! -f "$STATE_FILE" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '%s\n' "$NOW" > "$STATE_FILE"
  log "bootstrap: initialized $STATE_FILE to $NOW (no issues triaged this run)"
  exit 0
fi

LAST_SEEN=$(cat "$STATE_FILE")
log "polling $REPO_SLUG for issues created > $LAST_SEEN"

# gh issue list returns issues >= `created:$LAST_SEEN`. We post-filter
# strictly > LAST_SEEN to avoid re-triaging the boundary issue on every
# tick. Pull both number and createdAt so we can advance the watermark
# atomically after each success.
QUERY="repo:$REPO_SLUG state:open created:>=$LAST_SEEN sort:created-asc"
ISSUES=$(gh api -X GET search/issues \
  -f q="$QUERY" \
  -f per_page=50 \
  --jq '.items[] | select(.pull_request == null) | "\(.number)\t\(.created_at)\t\(.user.login)"' \
  2>/dev/null || true)

if [ -z "$ISSUES" ]; then
  log "no new issues"
  exit 0
fi

# Advance the watermark progressively so a crash mid-batch doesn't redo
# already-triaged issues on next tick.
HIGH_WATER="$LAST_SEEN"
TRIAGED=0
SKIPPED=0

while IFS=$'\t' read -r NUM CREATED AUTHOR; do
  [ -z "$NUM" ] && continue

  # Strict >: boundary issue from prior run shouldn't re-fire.
  if [ "$CREATED" = "$LAST_SEEN" ] || [[ "$CREATED" < "$LAST_SEEN" ]]; then
    continue
  fi

  # Don't triage bot-authored issues — they tend to be CI pings /
  # release notes / security scanner reports, all of which have their
  # own structured bodies already.
  case "$AUTHOR" in
    *"[bot]"|dependabot|renovate|coderabbitai|github-actions)
      log "skip #$NUM (bot author: $AUTHOR)"
      SKIPPED=$((SKIPPED + 1))
      if [[ "$CREATED" > "$HIGH_WATER" ]]; then HIGH_WATER="$CREATED"; fi
      printf '%s\n' "$HIGH_WATER" > "$STATE_FILE"
      continue
      ;;
  esac

  log "triaging #$NUM (created $CREATED by $AUTHOR)"
  if "$TRIAGE_SCRIPT" "$NUM" --yes >>"$LOG_FILE" 2>&1; then
    TRIAGED=$((TRIAGED + 1))
    log "✓ applied to #$NUM"
  else
    log "✗ triage failed for #$NUM (will retry next tick if still newest)"
    # Don't advance the watermark — we'll retry this issue on the next
    # poll. A persistently-failing issue will log noise every 15 min
    # until a human intervenes, which is the right behavior.
    exit 1
  fi

  if [[ "$CREATED" > "$HIGH_WATER" ]]; then HIGH_WATER="$CREATED"; fi
  printf '%s\n' "$HIGH_WATER" > "$STATE_FILE"
done <<< "$ISSUES"

log "done: triaged=$TRIAGED skipped=$SKIPPED watermark=$HIGH_WATER"
