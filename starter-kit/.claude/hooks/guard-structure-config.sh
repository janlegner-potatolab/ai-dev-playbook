#!/usr/bin/env bash
# guard-structure-config.sh - PreToolUse(Edit|Write|MultiEdit): protect the guards (S18).
# Blocks edits to eslint.config.js, .dependency-cruiser.cjs, knip.json,
# structure-baseline/**, scripts/structure/** and .claude/**.
# Escape hatch: ALLOW_GUARD_EDIT=1 in the environment (set by the human for the session).
# Contract: FAIL-OPEN. Missing jq or unreadable input exits 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat 2>/dev/null || true)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)"
[ -z "${file:-}" ] && exit 0
[ "${ALLOW_GUARD_EDIT:-}" = "1" ] && exit 0

# Make the path relative to the project root when it is absolute.
root="${CLAUDE_PROJECT_DIR:-}"
rel="$file"
if [ -n "$root" ]; then
  rel="${file#"${root%/}"/}"
fi
rel="${rel#./}"

case "$rel" in
  eslint.config.js|.dependency-cruiser.cjs|knip.json|structure-baseline/*|scripts/structure/*|.claude/*) ;;
  *) exit 0 ;;
esac

printf 'BLOCKED: %s is a structure guard file and needs owner approval.\nWhen a guard fails, fix the code, not the guard. If the guard is wrong, stop and ask the human.\nHuman-approved change only: start the session with ALLOW_GUARD_EDIT=1.\n' "$rel" >&2
exit 2
