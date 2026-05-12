#!/usr/bin/env bash
# Stop hook — warn (non-blocking) when this session touched domain files
# without updating the matching index README. See AGENTS.md "Definition
# of done" for the rules this enforces.
#
# Looks at uncommitted changes only. Committed-but-undocumented drift is
# caught by the PR template checkbox at review time.

set -u

CHANGED="$(git diff --name-only HEAD 2>/dev/null || true)
$(git diff --name-only --cached 2>/dev/null || true)
$(git ls-files --others --exclude-standard 2>/dev/null || true)"

if [ -z "$(printf '%s' "$CHANGED" | tr -d '[:space:]')" ]; then
  exit 0
fi

# Normalize separators — git on Windows emits forward slashes, but be
# safe in case the local user has set core.quotepath weirdness.
CHANGED="$(printf '%s' "$CHANGED" | tr '\\' '/' | sort -u)"

WARN_COUNT=0
warn() {
  if [ "$WARN_COUNT" -eq 0 ]; then
    {
      echo ""
      echo "⚠️  index-drift: domain file(s) changed without a matching README update."
      echo "   See AGENTS.md \"Definition of done\" for the rule. This is a warning,"
      echo "   not a block — update the README in this commit if your work is done."
      echo ""
    } >&2
  fi
  echo "   • $1" >&2
  WARN_COUNT=$((WARN_COUNT + 1))
}

# pattern, readme path, label
check() {
  pattern="$1"
  readme="$2"
  label="$3"
  if printf '%s\n' "$CHANGED" | grep -qE "$pattern" \
     && ! printf '%s\n' "$CHANGED" | grep -qxF "$readme"; then
    warn "$label changed but $readme was not updated"
  fi
}

check '^src/entities/[^/]+\.ts$'                          'src/entities/README.md'                  'Entities'
check '^src/entities/value-objects/[^/]+\.ts$'            'src/entities/value-objects/README.md'    'Value objects'
check '^src/application/services/[^/]+\.interface\.ts$'   'src/application/services/README.md'      'Service interfaces'
check '^src/application/use-cases/.+\.use-case\.ts$'      'src/application/use-cases/README.md'     'Use cases'
check '^app/actions/[^/]+\.ts$'                           'app/actions/README.md'                   'Server actions'
check '^di/(tokens|di-registration)\.ts$'                 'di/README.md'                            'DI tokens / registrations'

# Always exit 0 — this is informational, never blocking.
exit 0
