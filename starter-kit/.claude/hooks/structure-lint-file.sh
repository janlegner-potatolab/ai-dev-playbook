#!/usr/bin/env bash
# structure-lint-file.sh - PostToolUse(Edit|Write|MultiEdit): lint the file just edited.
# Runs ESLint on the edited .ts/.tsx/.js file only. On lint errors: exit 2 with the
# ESLint output on stderr, so the agent fixes the file right away.
# Contract: FAIL-OPEN. Missing jq, npx or eslint, unreadable input, or a missing file
# all exit 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
command -v npx >/dev/null 2>&1 || exit 0
input="$(cat 2>/dev/null || true)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)"
[ -z "${file:-}" ] && exit 0

case "$file" in
  *.ts|*.tsx|*.js) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-.}"
[ -x "$root/node_modules/.bin/eslint" ] || exit 0

output="$(cd "$root" && npx --no-install eslint --no-warn-ignored "$file" 2>&1)"
status=$?
[ "$status" -eq 1 ] || exit 0

printf 'Structure lint failed for %s. Fix the code, do not weaken the rule:\n%s\n' "$file" "$output" >&2
exit 2
