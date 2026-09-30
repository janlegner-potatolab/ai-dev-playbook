#!/bin/sh
# check-freshness.sh - SessionStart: warn when this checkout is behind its remote.
# GUARDRAILS_VERSION=7
# Must be fast and must never fail the session - every path exits 0. The fetch is
# bounded (no auth prompts, 5s connect/low-speed limits); if it fails we compare
# against the last-known remote refs, silently.

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=5"
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=5 fetch --quiet --no-tags 2>/dev/null

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)
[ -n "$upstream" ] || exit 0

counts=$(git rev-list --left-right --count "HEAD...$upstream" 2>/dev/null) || exit 0
ahead=$(echo "$counts" | awk '{print $1}')
behind=$(echo "$counts" | awk '{print $2}')

if [ "${behind:-0}" -gt 0 ]; then
    repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
    extra=""
    [ "${ahead:-0}" -gt 0 ] && extra=" (and $ahead ahead - diverged)"
    echo "guardrails: $repo is $behind commit(s) behind $upstream$extra - pull before building on this tree."
fi
exit 0
