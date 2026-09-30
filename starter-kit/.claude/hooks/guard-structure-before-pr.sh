#!/usr/bin/env bash
# guard-structure-before-pr.sh - PreToolUse(Bash): run the structure checks before a PR.
# Acts only when a command segment starts with `gh pr create` (command position, not a
# substring in quoted text). Runs `npm run check:structure`; on failure exit 2 and the
# PR is not created.
# Escape hatch: ALLOW_STRUCTURE_SKIP=1 in the environment or inline in the command.
# Contract: FAIL-OPEN. Missing jq or npm, or unreadable input, exits 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat 2>/dev/null || true)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
[ -z "${cmd:-}" ] && exit 0

[ "${ALLOW_STRUCTURE_SKIP:-}" = "1" ] && exit 0
grep -Eq '(^|[[:space:];&|(])ALLOW_STRUCTURE_SKIP=1([[:space:]]|$)' <<<"$cmd" && exit 0

# Drop heredoc bodies and quoted strings, then split into segments on ; & | ( and newlines.
view="${cmd%%<<*}"
view="$(printf '%s' "$view" | sed -E "s/\"[^\"]*\"/\"\"/g; s/'[^']*'/''/g")"
is_pr_create=0
while IFS= read -r segment; do
  # Strip leading whitespace and leading VAR=value assignments.
  segment="$(printf '%s' "$segment" | sed -E 's/^[[:space:]]+//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//')"
  if grep -Eq '^gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' <<<"$segment"; then
    is_pr_create=1
  fi
done < <(printf '%s\n' "$view" | tr ';&|(' '\n\n\n\n')
[ "$is_pr_create" = 1 ] || exit 0

command -v npm >/dev/null 2>&1 || exit 0
root="${CLAUDE_PROJECT_DIR:-.}"
[ -f "$root/package.json" ] || exit 0

output="$(cd "$root" && npm run --silent check:structure 2>&1)"
status=$?
[ "$status" -eq 0 ] && exit 0

printf 'BLOCKED: npm run check:structure failed, the PR was not created.\nFix the code and retry. Emergency only: ALLOW_STRUCTURE_SKIP=1 gh pr create ...\n%s\n' "$(printf '%s' "$output" | tail -n 40)" >&2
exit 2
