#!/usr/bin/env bash
# Creates (or updates) the closed set of state labels used by the work queue (guide § 18.3).
# Usage: scripts/setup-labels.sh [owner/repo]   (defaults to the current repository)
set -euo pipefail

repo_args=()
if [ "${1:-}" != "" ]; then
  repo_args=(--repo "$1")
fi

create() {
  gh label create "$1" --color "$2" --description "$3" --force ${repo_args[@]+"${repo_args[@]}"}
}

create "state:inbox" "d4c5f9" "Raised, not shaped: a human must answer the question in the issue"
create "state:ready" "0e8a16" "Shaped: anyone can start without asking first (unassigned)"
create "state:doing" "1d76db" "Taken and being worked (has an assignee)"
create "state:blocked" "b60205" "Waiting on a person, decision or external answer (reason in issue)"
create "state:parked" "fbca04" "A run attempted it and stopped; a person decides next (reason in issue)"
