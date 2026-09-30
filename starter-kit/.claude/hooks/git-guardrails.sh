#!/usr/bin/env bash
# git-guardrails.sh - repo-committed PreToolUse(Bash) guardrails.
# GUARDRAILS_VERSION=7
#
# This file travels with the repo: every Claude Code session opened here gets these
# rules automatically - no plugin, no install, nothing to remember. Enforced:
#
#   1. No force-push (--force / -f / +refspec); --force-with-lease passes.
#   2. No direct commit on main/master - work on a branch.   [ALLOW_PROTECTED_BRANCH=1]
#   3. No direct push to main/master - push a branch + PR.   [ALLOW_PROTECTED_BRANCH=1]
#   4. (retired) - merge is decided by review and branch protection, not here.
#   5. No real secret formats in command text; no .env in git.
#   6. No commit/push on a branch that is BEHIND its own upstream. [ALLOW_STALE_BRANCH=1]
#   7. A specification opened as a PR carries its seven sections and, per milestone, an
#      acceptance-criteria checklist. Only documents that opt in.   [ALLOW_SPEC_FORMAT=1]
#
# Contract: FAIL-OPEN - ambiguity, parse failure, or a missing tool allows the
# command (exit 0); only a confident violation blocks (exit 2 + reason). Every
# block names its escape hatch, so an emergency never wedges a session.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0          # no jq → fail open
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || true)"
[ -z "${cmd:-}" ] && exit 0

block() { printf 'BLOCKED by repo guardrails - %s\n  %s\n' "$1" "$cmd" >&2; exit 2; }

# A quote/heredoc-blind VIEW for command-shape checks, so prose that merely
# mentions "git push --force" in a string or heredoc does not false-trigger.
view="${cmd%%<<*}"
view="$(printf '%s' "$view" | sed -E "s/\"[^\"]*\"/\"\"/g; s/'[^']*'/''/g")"
# `git`, then flags (each optionally with a value arg, e.g. -C <dir>), then the subcommand.
gitsub='(^|[[:space:]]|[;(&|])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+'

# Directory git will run in: `git -C <dir>`, else a leading `cd <dir>`, else session cwd.
dir="$cwd"
if grep -Eq 'git[[:space:]]+-C[[:space:]]' <<<"$cmd"; then
  dir="$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+("([^"]+)"|([^[:space:]]+)).*/\2\3/p' | head -1)"
elif grep -Eq '^[[:space:]]*cd[[:space:]]' <<<"$cmd"; then
  dir="$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+("([^"]+)"|([^[:space:]&]+)).*/\2\3/p' | head -1)"
fi
branch="$(git -C "${dir:-.}" branch --show-current 2>/dev/null || true)"

is_push=0;   grep -Eq "${gitsub}push([[:space:]]|\$)" <<<"$view"   && is_push=1
is_commit=0; grep -Eq "${gitsub}commit([[:space:]]|\$)" <<<"$view" && is_commit=1

# ── 5a. Secret token in the command text (checked first - RAW text, secrets hide in quotes)
if grep -Eq 'sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' <<<"$cmd" \
   || grep -q -e '-----BEGIN.*PRIVATE KEY-----' <<<"$cmd"; then
  block "a real secret format appears in the command text. Use an env var or the platform's interactive prompt; docs use an obvious placeholder (XXXX)."
fi

# ── 5b. .env files never enter git (example/template/sample variants pass)
if [ "$is_commit" = 1 ] || grep -Eq "${gitsub}add([[:space:]]|\$)" <<<"$view"; then
  if grep -Eq '(^|[[:space:]/])\.env(\.[A-Za-z0-9_.-]+)?([[:space:]]|$)' <<<"$view" \
     && ! grep -Eq '\.env\.(example|template|sample)' <<<"$view"; then
    block ".env files never enter git - add to .gitignore; ship an .env.example instead."
  fi
fi

# ── 1. Force-push
if [ "$is_push" = 1 ]; then
  if grep -Eq -- '(--force([[:space:]=]|$)|(^|[[:space:]])-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$))' <<<"$view" \
     && ! grep -q -- '--force-with-lease' <<<"$view"; then
    block "force-push rewrites shared history. Use --force-with-lease, and only after explicit human approval."
  fi
  if grep -Eq '(^|[[:space:]])\+[^[:space:]]' \
     <<<"$(grep -oE 'push[[:space:]][^;&|]*' <<<"$cmd" | tr -d '\042\047')"; then
    block "'+refspec' is a force-push in disguise - push without '+'."
  fi
fi

# ── 2+3. Protected branch: no direct commit or push to main/master
if [ "${ALLOW_PROTECTED_BRANCH:-}" != "1" ] && ! grep -q 'ALLOW_PROTECTED_BRANCH=1' <<<"$cmd"; then
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    [ "$is_commit" = 1 ] && block "direct commit on '$branch'. Work on a branch: git switch -c <name>, then push + PR. (escape: ALLOW_PROTECTED_BRANCH=1)"
  fi
  if [ "$is_push" = 1 ]; then
    seg="$(printf '%s' "$view" | grep -oE 'push[[:space:]][^;&|]*' | head -1)"
    # names main/master as a refspec (push origin main / HEAD:main / refs/heads/main)
    if grep -Eq '([[:space:]]|:)(refs/heads/)?(main|master)([[:space:]]|$)' <<<"$seg"; then
      block "direct push to main/master. Push a branch and open a PR - a human merges. (escape: ALLOW_PROTECTED_BRANCH=1)"
    fi
    # bare `git push` (no branch named) while ON main/master pushes the protected branch
    if { [ "$branch" = "main" ] || [ "$branch" = "master" ]; } \
       && ! grep -Eq 'push([[:space:]]+-[^[:space:]]+)*[[:space:]]+[^[:space:]-]+[[:space:]]+[^[:space:]-]' <<<"$seg"; then
      block "bare 'git push' on '$branch' pushes the protected branch. Push a branch and open a PR. (escape: ALLOW_PROTECTED_BRANCH=1)"
    fi
  fi
fi

# ── 7. A specification opened as a PR carries its sections and its acceptance criteria.
# Only fires on `gh pr create`, only on documents that opt in by carrying the numbered
# headings, and fail-open if the checker or python is missing - a missing tool must never
# wedge a session.
if grep -Eq '(^|[[:space:]])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' <<<"$view" \
   && [ "${ALLOW_SPEC_FORMAT:-}" != "1" ] && ! grep -q 'ALLOW_SPEC_FORMAT=1' <<<"$cmd"; then
  checker="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/check-spec-format.py"
  if [ -f "$checker" ] && command -v python3 >/dev/null 2>&1; then
    # NOT `timeout`: it is absent from stock macOS, and `command -v timeout || run
    # unbounded` is the idiom that has already made two bounds in this repo read as
    # present in the source while being void on the operator's own box. Bound it with
    # what every POSIX shell has. Output goes to a FILE, never a pipe: a command
    # substitution waits for EOF, so one surviving grandchild outlives the bound.
    spec_out="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/spec-format.$$")"
    # `exec`, or the kill below reaps the SUBSHELL and leaves the python3 it forked
    # running until it finishes on its own - one orphan per hung `gh pr create`.
    set -m 2>/dev/null || true   # own process group, so the kill below reaches grandchildren
( cd "${CLAUDE_PROJECT_DIR:-.}" && exec python3 "$checker" >"$spec_out" 2>&1 ) &
    spec_pid=$!
    spec_waited=0
    while kill -0 "$spec_pid" 2>/dev/null && [ "$spec_waited" -lt 10 ]; do
      sleep 1; spec_waited=$((spec_waited + 1))
    done
    if kill -0 "$spec_pid" 2>/dev/null; then
      # KILL THE GROUP, not the pid. `exec` stopped the subshell being orphaned, and the
      # comment above claimed that closed the leak - it did not. The checker itself forks
      # `git` (changed_files), and a grandchild is outside the reach of a kill aimed at one
      # pid: measured one `sleep 300` reparented to init after a 10 s bound expired. `set
      # -m` above puts the job in its own group; the negative pid signals all of it. The
      # bare pid stays as the fallback for a shell with no job control.
      kill -9 -"$spec_pid" 2>/dev/null || kill -9 "$spec_pid" 2>/dev/null
      wait "$spec_pid" 2>/dev/null; rc=124
    else
      wait "$spec_pid"; rc=$?
    fi
    out=$(cat "$spec_out" 2>/dev/null); rm -f "$spec_out"
    # 3 = the document is incomplete. Any other non-zero means the checker itself broke -
    # fail open, per this file's contract. A verdict with no reason is not a verdict.
    if [ "$rc" = 3 ] && [ -n "$out" ]; then
      block "a specification in this PR is incomplete:
$out
  (escape: ALLOW_SPEC_FORMAT=1)"
    fi
  fi
fi

# ── 6. Stale branch: commit/push while BEHIND your own upstream (someone pushed under you)
if { [ "$is_commit" = 1 ] || [ "$is_push" = 1 ]; } && [ -n "$branch" ] \
   && [ "${ALLOW_STALE_BRANCH:-}" != "1" ] && ! grep -q 'ALLOW_STALE_BRANCH=1' <<<"$cmd"; then
  behind="$(git -C "${dir:-.}" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo 0)"
  case "$behind" in *[!0-9]*) behind=0;; esac
  if [ "${behind:-0}" -gt 0 ]; then
    block "this branch is $behind commit(s) behind its own upstream - someone pushed to it since your last sync. git pull --rebase first. (escape: ALLOW_STALE_BRANCH=1)"
  fi
fi

exit 0
