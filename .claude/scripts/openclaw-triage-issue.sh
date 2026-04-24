#!/usr/bin/env bash
# .claude/scripts/openclaw-triage-issue.sh
#
# Triage one GitHub issue via OpenClaw + Qwen2.5-Coder:
# - Refine the description (Context / Acceptance criteria / Done when)
# - Recommend labels from the existing REMA taxonomy
# - Estimate Fibonacci story points (1/2/3/5/8/13)
# - Assign priority tier (P0/P1/P2/P3)
#
# Usage:
#   .claude/scripts/openclaw-triage-issue.sh <issue-number>          # preview only (default)
#   .claude/scripts/openclaw-triage-issue.sh <issue-number> --apply  # apply after confirmation
#   .claude/scripts/openclaw-triage-issue.sh <issue-number> --yes    # apply without confirmation

set -euo pipefail

ISSUE_NUM="${1:-}"
MODE="${2:---preview}"

if [ -z "$ISSUE_NUM" ]; then
  echo "usage: $0 <issue-number> [--preview|--apply|--yes]" >&2
  exit 2
fi

for cmd in openclaw gh jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' not on PATH" >&2
    exit 1
  fi
done

# The canonical label taxonomy for REMA. Excludes pts-* and prio-* so
# OpenClaw can't hallucinate points as a regular label.
LABELS_ALLOWED=$(gh label list --limit 100 --json name --jq '[.[].name] | map(select(startswith("pts-") | not) | select(startswith("prio-") | not)) | join(", ")')
PTS_ALLOWED="pts-1, pts-2, pts-3, pts-5, pts-8, pts-13"
PRIO_ALLOWED="prio-p0, prio-p1, prio-p2, prio-p3"

# Pull the issue.
ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json number,title,body,labels)
ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r .title)
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r .body)
ISSUE_LABELS=$(echo "$ISSUE_JSON" | jq -r '[.labels[].name] | join(", ")')

if [ -z "$ISSUE_TITLE" ]; then
  echo "error: could not load issue #$ISSUE_NUM" >&2
  exit 1
fi

# Build the triage prompt in a tempfile (heredoc inside command-substitution
# breaks under certain paren content — tempfile is robust).
PROMPT_FILE=$(mktemp -t openclaw-triage.XXXXXX)
trap 'rm -f "$PROMPT_FILE"' EXIT

{
  printf '%s\n' "You are triaging a GitHub issue for the REMA Portal monorepo"
  printf '%s\n' "(Rust nesting engine + Next.js + Supabase cut-planner app)."
  printf '\n'
  printf '%s\n' "Primary job: REFINE THE DESCRIPTION. Make it clearer, more actionable,"
  printf '%s\n' "with explicit acceptance criteria. Keep the author's intent; do not"
  printf '%s\n' "invent requirements they did not imply. Be terse, not verbose."
  printf '\n'
  printf '%s\n' "Secondary jobs: labels + story points + priority."
  printf '\n'
  printf '## Issue #%s\n' "$ISSUE_NUM"
  printf 'Title: %s\n' "$ISSUE_TITLE"
  printf 'Current labels: %s\n' "$ISSUE_LABELS"
  printf '\n'
  printf 'Body:\n%s\n' "$ISSUE_BODY"
  printf '\n'
  printf '## Allowed labels\n'
  printf 'Use ONLY these, pick 1-5 that fit:\n'
  printf '%s\n' "$LABELS_ALLOWED"
  printf '\n'
  printf '## Story point scale (Fibonacci, pick exactly one)\n'
  printf '%s\n' "$PTS_ALLOWED"
  printf -- '- pts-1: trivial, < 1 hour\n'
  printf -- '- pts-2: simple, half-day\n'
  printf -- '- pts-3: straightforward, 1 day\n'
  printf -- '- pts-5: complex, 2-3 days\n'
  printf -- '- pts-8: significant, 1 week, multi-component\n'
  printf -- '- pts-13: large, > 1 week, split recommended\n'
  printf '\n'
  printf '## Priority tier, pick exactly one\n'
  printf '%s\n' "$PRIO_ALLOWED"
  printf -- '- prio-p0: ship-blocking / live incident\n'
  printf -- '- prio-p1: high, next sprint, customer-facing\n'
  printf -- '- prio-p2: normal, planned\n'
  printf -- '- prio-p3: low, eventual polish\n'
  printf '\n'
  printf '## Output format\n'
  printf 'Respond with VALID JSON only. No markdown fences, no prose wrapper.\n'
  printf '\n'
  printf '{\n'
  printf '  "improved_description": "Markdown with three sections: ## Context, ## Acceptance criteria (bullet list), ## Done when (bullet list). Focused, engineer-readable.",\n'
  printf '  "recommended_labels": ["label1", "label2"],\n'
  printf '  "story_points": "pts-5",\n'
  printf '  "priority": "prio-p2",\n'
  printf '  "rationale": "One line explaining your points and priority call.",\n'
  printf '  "technical_notes": "Markdown analysis posted as a triage comment. Include: **Area of the codebase** (pick from: Rust engine / Next.js app UI / Supabase schema / docs / CI+tooling — do NOT name specific files or crate names, you have not seen them), **Suggested approach** (2-4 bullets at conceptual level, not line-level), **Risks / dependencies** (what must ship first, what could break). Be terse. NEVER invent file paths, function names, module names, or class names — if unsure say `needs engineer walkthrough`."\n'
  printf '}\n'
} > "$PROMPT_FILE"

echo "=== Triaging issue #$ISSUE_NUM: $ISSUE_TITLE ==="
echo "Asking OpenClaw (Kimi K2.6 via the 'triage' agent — typically 15-40s)..."

RESPONSE=$(openclaw agent --agent triage --message "$(cat "$PROMPT_FILE")" --json 2>/dev/null || echo '{"status":"error"}')

STATUS=$(echo "$RESPONSE" | jq -r '.status // "error"')
if [ "$STATUS" != "ok" ]; then
  echo "error: openclaw agent failed" >&2
  echo "$RESPONSE" | jq '.result.payloads[0].text // .result // .' >&2
  exit 1
fi

RAW_REPLY=$(echo "$RESPONSE" | jq -r '.result.payloads[0].text // empty')
if [ -z "$RAW_REPLY" ]; then
  echo "error: empty model reply" >&2
  exit 1
fi

# Qwen sometimes wraps JSON in markdown fences and sometimes emits invalid
# escape sequences (e.g. `\-` for bullet list items, `\/` in URLs). Strip
# fences + normalize common invalid escapes back to their plain form.
CLEAN_JSON=$(printf '%s\n' "$RAW_REPLY" \
  | sed -E 's/^[[:space:]]*```[a-zA-Z]*[[:space:]]*$//; s/^[[:space:]]*```[[:space:]]*$//' \
  | sed '/^$/d' \
  | python3 -c '
import json, re, sys
raw = sys.stdin.read()
# Qwen emits `\-` (invalid) where it means literal "-". Also scrub other
# non-JSON escapes that arent \n \r \t \" \\ \/ \b \f \u.
# This regex removes the leading backslash from any escape that is not a
# valid JSON escape.
fixed = re.sub(r"\\(?![\"\\/bfnrtu])", "", raw)
try:
    obj = json.loads(fixed)
    print(json.dumps(obj))
except Exception as e:
    # Fall through with the best-effort cleaned text; upstream jq will
    # surface the final error.
    print(fixed)
')

if ! printf '%s' "$CLEAN_JSON" | jq . >/dev/null 2>&1; then
  echo "error: model returned malformed JSON. Raw reply:" >&2
  echo "$RAW_REPLY" >&2
  exit 1
fi

IMPROVED=$(printf '%s' "$CLEAN_JSON" | jq -r '.improved_description // empty')
LABELS_NEW=$(printf '%s' "$CLEAN_JSON" | jq -r '.recommended_labels | join(",")')
PTS_LABEL=$(printf '%s' "$CLEAN_JSON" | jq -r '.story_points // empty')
PRIO_LABEL=$(printf '%s' "$CLEAN_JSON" | jq -r '.priority // empty')
RATIONALE=$(printf '%s' "$CLEAN_JSON" | jq -r '.rationale // empty')
TECH_NOTES=$(printf '%s' "$CLEAN_JSON" | jq -r '.technical_notes // empty')

# Validate against allowed taxonomies.
if ! printf '%s' "$PTS_ALLOWED" | grep -qw "$PTS_LABEL"; then
  echo "warning: points label '$PTS_LABEL' not in allowed set; skipping points" >&2
  PTS_LABEL=""
fi
if ! printf '%s' "$PRIO_ALLOWED" | grep -qw "$PRIO_LABEL"; then
  echo "warning: priority label '$PRIO_LABEL' not in allowed set; skipping priority" >&2
  PRIO_LABEL=""
fi

printf '\n────────────────────────────────────────────────────────────────\n'
printf '### ORIGINAL (#%s)\n\n%s\n' "$ISSUE_NUM" "$ISSUE_BODY"
printf '\n────────────────────────────────────────────────────────────────\n'
printf '### PROPOSED DESCRIPTION\n\n%s\n' "$IMPROVED"
printf '\n────────────────────────────────────────────────────────────────\n'
printf '### LABELS\n\n'
printf ' existing : %s\n' "$ISSUE_LABELS"
printf ' proposed : %s\n' "$LABELS_NEW"
printf ' points   : %s\n' "$PTS_LABEL"
printf ' priority : %s\n' "$PRIO_LABEL"
printf '\n### RATIONALE\n\n %s\n' "$RATIONALE"
if [ -n "$TECH_NOTES" ]; then
  printf '\n### TECHNICAL NOTES\n\n%s\n' "$TECH_NOTES"
fi
printf '────────────────────────────────────────────────────────────────\n\n'

case "$MODE" in
  --yes)
    CONFIRM=y
    ;;
  --apply)
    read -r -p "Apply these changes to issue #$ISSUE_NUM? [y/N] " CONFIRM
    ;;
  --preview|*)
    echo "(preview mode — nothing applied. Re-run with --apply to commit.)"
    exit 0
    ;;
esac

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "(skipped)"
  exit 0
fi

ALL_LABELS_CSV="$LABELS_NEW"
[ -n "$PTS_LABEL" ] && ALL_LABELS_CSV="$ALL_LABELS_CSV,$PTS_LABEL"
[ -n "$PRIO_LABEL" ] && ALL_LABELS_CSV="$ALL_LABELS_CSV,$PRIO_LABEL"

gh issue edit "$ISSUE_NUM" --body "$IMPROVED" >/dev/null
gh issue edit "$ISSUE_NUM" --add-label "$ALL_LABELS_CSV" >/dev/null

# Post a substantive triage comment: headline + rationale + technical notes.
# Kept inside one comment so the issue timeline shows a single audit entry
# per triage rather than three separate bot-noise comments.
COMMENT_FILE=$(mktemp -t openclaw-comment.XXXXXX)
{
  printf '🦞 **Triaged via OpenClaw** — `%s`, `%s`\n\n' "$PTS_LABEL" "$PRIO_LABEL"
  printf '%s\n' "$RATIONALE"
  if [ -n "$TECH_NOTES" ]; then
    printf '\n---\n\n### Triage notes\n\n%s\n' "$TECH_NOTES"
  fi
  printf '\n---\n_Model: `kimi-k2.6:cloud` via OpenClaw. Re-run: `.claude/scripts/openclaw-triage-issue.sh %s --apply`_\n' "$ISSUE_NUM"
} > "$COMMENT_FILE"
gh issue comment "$ISSUE_NUM" --body-file "$COMMENT_FILE" >/dev/null
rm -f "$COMMENT_FILE"

echo "✓ applied to #$ISSUE_NUM"
