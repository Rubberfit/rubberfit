#!/usr/bin/env bash
# .claude/scripts/openclaw-triage-watch.sh
#
# Poll GitHub for new issues across every (repo, project) target listed
# in openclaw-targets.tsv and auto-triage each new one via Kimi K2.6
# (openclaw-triage-issue.sh <N> --yes).
#
# Designed to run periodically as a LaunchAgent on macOS (see
# ai.openclaw.triage-watch.plist in this same directory). One watermark
# file per repo so a slow-moving repo can't block triage on a busy one,
# and so adding a new target row only bootstraps that row (no
# retroactive triage of existing repos).
#
# State files: $OPENCLAW_TRIAGE_STATE_DIR/triage-last-seen-<owner>-<repo>.txt
# Default dir: ~/.openclaw/state/
#
# Bootstrap: on first sight of a target, if its state file is missing,
# the script stamps the current UTC ISO-8601 timestamp and skips
# triaging that repo on this tick. Existing issues in newly-added
# targets are NOT retroactively triaged.
#
# Targets file: openclaw-targets.tsv next to this script, or override
# via OPENCLAW_TARGETS_FILE.

set -euo pipefail

# LaunchAgent runs under `bash -lc`, which sources the user's login
# shell init and prepends /usr/local/bin via path_helper. That dir
# has a stale node 22.13.1 which openclaw (>=22.14.0) rejects. Force
# the Herd nvm node to the front so openclaw picks up 22.14.0.
NVM_NODE="/Users/danielmartinezjulio/Library/Application Support/Herd/config/nvm/versions/node/v22.14.0/bin"
if [ -d "$NVM_NODE" ]; then
  export PATH="$NVM_NODE:$PATH"
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TRIAGE_SCRIPT="$SCRIPT_DIR/openclaw-triage-issue.sh"
TARGETS_FILE="${OPENCLAW_TARGETS_FILE:-$SCRIPT_DIR/openclaw-targets.tsv}"

STATE_DIR="${OPENCLAW_TRIAGE_STATE_DIR:-$HOME/.openclaw/state}"
LOG_DIR="${OPENCLAW_TRIAGE_LOG_DIR:-/tmp/openclaw}"
LOG_FILE="$LOG_DIR/triage-watch.log"

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

if [ ! -f "$TARGETS_FILE" ]; then
  log "error: targets file not found: $TARGETS_FILE"
  exit 1
fi

# One-time migration: the pre-multi-target script wrote a single
# triage-last-seen.txt for rema-portal. Preserve its watermark by
# renaming to the new per-repo naming convention if the new file
# isn't already in place. Idempotent.
LEGACY_STATE="$STATE_DIR/triage-last-seen.txt"
LEGACY_TARGET="$STATE_DIR/triage-last-seen-Arc-and-Anchor-rema-portal.txt"
if [ -f "$LEGACY_STATE" ] && [ ! -f "$LEGACY_TARGET" ]; then
  mv "$LEGACY_STATE" "$LEGACY_TARGET"
  log "migrated $LEGACY_STATE → $LEGACY_TARGET"
fi

TOTAL_TRIAGED=0
TOTAL_SKIPPED=0
ROW_NUM=0

# Process each target row. A single repo's transient failure (e.g. rate
# limit, malformed issue body) shouldn't tank the whole tick — we log
# the failure, leave that repo's watermark unchanged, and move on. The
# watermark file is written progressively inside each repo's loop so a
# crash is safe.
while IFS=$'\t' read -r REPO PROJECT_ID PRIO_FIELD_ID PTS_FIELD_ID STACK_HINT; do
  ROW_NUM=$((ROW_NUM + 1))

  # Strip leading/trailing whitespace from REPO so a stray space in
  # the TSV doesn't break the comment-line check.
  REPO_TRIMMED=$(printf '%s' "${REPO:-}" | tr -d '[:space:]')
  case "$REPO_TRIMMED" in
    ''|'#'*) continue ;;
  esac

  if [ -z "${PROJECT_ID:-}" ] || [ -z "${PRIO_FIELD_ID:-}" ] || [ -z "${PTS_FIELD_ID:-}" ]; then
    log "row $ROW_NUM: missing required column for $REPO_TRIMMED — skip"
    continue
  fi

  REPO_SLUG=$(printf '%s' "$REPO_TRIMMED" | tr '/' '-')
  STATE_FILE="$STATE_DIR/triage-last-seen-$REPO_SLUG.txt"

  # First-run bootstrap per-repo: stamp now, skip this tick. Nothing
  # retroactive — only issues created from this moment onward.
  if [ ! -f "$STATE_FILE" ]; then
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '%s\n' "$NOW" > "$STATE_FILE"
    log "bootstrap: $REPO_TRIMMED initialized to $NOW (no triage this run)"
    continue
  fi

  LAST_SEEN=$(cat "$STATE_FILE")
  log "polling $REPO_TRIMMED for issues created > $LAST_SEEN"

  # gh search returns issues >= `created:$LAST_SEEN`. Post-filter strictly
  # > LAST_SEEN below to avoid re-triaging the boundary issue every tick.
  QUERY="repo:$REPO_TRIMMED state:open created:>=$LAST_SEEN sort:created-asc"
  ISSUES=$(gh api -X GET search/issues \
    -f q="$QUERY" \
    -f per_page=50 \
    --jq '.items[] | select(.pull_request == null) | "\(.number)\t\(.created_at)\t\(.user.login)"' \
    2>/dev/null || true)

  if [ -z "$ISSUES" ]; then
    log "  no new issues in $REPO_TRIMMED"
    continue
  fi

  HIGH_WATER="$LAST_SEEN"
  REPO_TRIAGED=0
  REPO_SKIPPED=0

  while IFS=$'\t' read -r NUM CREATED AUTHOR; do
    [ -z "$NUM" ] && continue

    # Strict >: boundary issue from prior run shouldn't re-fire.
    if [ "$CREATED" = "$LAST_SEEN" ] || [[ "$CREATED" < "$LAST_SEEN" ]]; then
      continue
    fi

    # Don't triage bot-authored issues — they tend to be CI pings /
    # release notes / security scanner reports, all with structured
    # bodies of their own.
    case "$AUTHOR" in
      *"[bot]"|dependabot|renovate|coderabbitai|github-actions)
        log "  skip $REPO_TRIMMED#$NUM (bot author: $AUTHOR)"
        REPO_SKIPPED=$((REPO_SKIPPED + 1))
        if [[ "$CREATED" > "$HIGH_WATER" ]]; then HIGH_WATER="$CREATED"; fi
        printf '%s\n' "$HIGH_WATER" > "$STATE_FILE"
        continue
        ;;
    esac

    log "  triaging $REPO_TRIMMED#$NUM (created $CREATED by $AUTHOR)"
    if OPENCLAW_REPO="$REPO_TRIMMED" \
       OPENCLAW_PROJECT_ID="$PROJECT_ID" \
       OPENCLAW_PRIO_FIELD_ID="$PRIO_FIELD_ID" \
       OPENCLAW_PTS_FIELD_ID="$PTS_FIELD_ID" \
       OPENCLAW_STACK_HINT="$STACK_HINT" \
       "$TRIAGE_SCRIPT" "$NUM" --yes >>"$LOG_FILE" 2>&1; then
      REPO_TRIAGED=$((REPO_TRIAGED + 1))
      log "  ✓ applied to $REPO_TRIMMED#$NUM"
    else
      log "  ✗ triage failed for $REPO_TRIMMED#$NUM (will retry next tick)"
      # Don't advance the watermark for this repo — retry next poll.
      # Break out of this repo's loop but continue to other repos so
      # one bad issue doesn't block the rest of the fan-out.
      break
    fi

    if [[ "$CREATED" > "$HIGH_WATER" ]]; then HIGH_WATER="$CREATED"; fi
    printf '%s\n' "$HIGH_WATER" > "$STATE_FILE"
  done <<< "$ISSUES"

  TOTAL_TRIAGED=$((TOTAL_TRIAGED + REPO_TRIAGED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + REPO_SKIPPED))
  log "  $REPO_TRIMMED done: triaged=$REPO_TRIAGED skipped=$REPO_SKIPPED watermark=$HIGH_WATER"
done < "$TARGETS_FILE"

log "tick done: total triaged=$TOTAL_TRIAGED skipped=$TOTAL_SKIPPED"
