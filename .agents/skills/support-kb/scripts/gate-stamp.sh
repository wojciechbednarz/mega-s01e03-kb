#!/bin/bash
# Builds the sanitized kb; on success stamps HEAD + UTC time, on failure removes the stamp.
K="$(cd "$(dirname "$0")/../../../.." && pwd)"
STAMP="$K/.agents/skills/support-kb/gate-stamp"
cd "$K" || exit 1
if bun .agents/skills/support-kb/scripts/sanitize.ts --build; then
  echo "$(git rev-parse HEAD) $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAMP"
else
  rm -f "$STAMP"; echo "gate-stamp: sanitize --build failed, stamp removed" >&2; exit 1
fi
