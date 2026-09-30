#!/usr/bin/env bash
# S15: existing migrations are immutable. Modifying, deleting or renaming a file under
# server/migrations compared with the base ref fails; adding a new one passes.
# Also checks that every added migration sorts after the newest one on the base ref.
set -uo pipefail

base="${STRUCTURE_BASE_REF:-origin/main}"
dir="server/migrations"

if ! git rev-parse --verify --quiet "$base" >/dev/null; then
  echo "check-migrations: base ref $base not found, skipped." >&2
  exit 0
fi

changed="$(git diff --name-status "$base...HEAD" -- "$dir" | grep -E '^(M|D|R)' || true)"
if [ -n "$changed" ]; then
  echo "An existing migration cannot be changed or deleted. Add a new migration instead:" >&2
  echo "$changed" >&2
  exit 1
fi

newest_base="$(git ls-tree -r --name-only "$base" -- "$dir" | sort | tail -n 1)"
added="$(git diff --name-only --diff-filter=A "$base...HEAD" -- "$dir" | sort)"
if [ -n "$newest_base" ] && [ -n "$added" ]; then
  while IFS= read -r file; do
    if [[ "$file" < "$newest_base" ]]; then
      echo "Migration $file sorts before $newest_base on $base. Give it a newer timestamp." >&2
      exit 1
    fi
  done <<<"$added"
fi
exit 0
