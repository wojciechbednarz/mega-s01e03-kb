#!/bin/bash
D="$(cd "$(dirname "$0")" && pwd)"; G="$(git -C "$D" rev-parse --git-dir)"; G="$(cd "$D" && cd "$G" && pwd)"
for h in pre-push post-commit; do ln -sf "$D/$h" "$G/hooks/$h"; chmod +x "$D/$h"; done
echo "installed: pre-push post-commit -> $G/hooks"
