#!/usr/bin/env bash
# db-guardrails.sh - repo-committed PreToolUse(Bash) guard: a destructive database
# statement is refused until somebody confirms it.
# GUARDRAILS_VERSION=7
#
# This file travels with the repo: every Claude Code session opened here gets the rule
# automatically - no plugin, no install. It is the first rule in this bundle that is not
# about version control or secrets, and it exists because the cost is already paid: a
# schema was dropped once, and a migration's cascade removed more than intended on
# another occasion.
#
# WHAT IT REFUSES - four statement shapes, in SQL this command is about to run:
#   1. dropping a table          DROP TABLE …   (also DROP SCHEMA / DROP DATABASE, below)
#   2. dropping a column         ALTER TABLE … DROP [COLUMN] …
#   3. emptying a table          TRUNCATE …
#   4. deleting rows unfiltered  DELETE FROM … with no WHERE in the same statement
#
# DROP SCHEMA and DROP DATABASE are folded into shape 1 deliberately. The four shapes as
# written do not name them, but the incident that motivates this whole guard was a dropped
# SCHEMA - a guard that refuses `DROP TABLE users` and waves through `DROP SCHEMA public
# CASCADE` would miss the very event it was built for. Shape 2 counts a column drop only:
# `DROP CONSTRAINT`, `DROP DEFAULT`, `DROP NOT NULL` and friends pass, and each DROP in a
# multi-action ALTER is judged on its own, so `… DROP CONSTRAINT c, DROP col` still fires.
#
# WHERE IT LOOKS. Only when a database tool is in COMMAND POSITION (the guide § 6.3, command
# rules): `git commit -m "drop table users"`, `grep -rn "TRUNCATE" docs/` and
# `echo "DELETE FROM t"` are arguments, never commands, and stay inert. Given such a
# command it reads
#   • quoted strings anywhere in the command  (psql -c "…", sqlite3 db "…", echo "…" | psql)
#   • heredoc bodies                          (psql <<'SQL' … SQL)
#   • .sql files named on the command line    (psql -f 0032.sql, psql < 0032.sql)
#   • for a migration RUNNER with no SQL on its command line (supabase db push,
#     drizzle-kit migrate, alembic upgrade, …): the .sql files this branch is adding -
#     uncommitted, untracked, or committed on this branch but not on the default one.
#     Migrations already on the default branch have run; re-reading them would refuse
#     every deploy and teach everyone to reach for the override.
#
# Comments are stripped FIRST - `-- DROP TABLE …` and `/* … */` cannot trip it, which is
# what lets a migration carry a worked example of the thing it is not doing.
#
# HONEST LIMITS, so nobody oversells it. It matches text. It cannot see a statement
# assembled at run time (`drizzle-kit push` diffs a schema and emits SQL that never touches
# a file - invisible here), it cannot judge whether a particular drop is fine, and the set
# of tools it recognises is an ALLOWLIST: a database tool not named below, or one reached
# through a package script (`npm run migrate`), is not seen at all. A CLIENT inside a container
# IS found (`docker exec db psql -c "…"`); a migration RUNNER inside one is not. It reads no .sql
# file larger than 2 MB - a single migration that big is unread, in silence - and it does not
# follow a psql `\i` / `\ir` include, so a file that only sources another is read as empty.
# There is deliberately NO cap on the NUMBER of files (see migration_candidates).
#
# It over-blocks in one known shape, which is the price of not going blind: when the reader
# cannot finish lexing a file - a Postgres standard string ending in a backslash is the way in,
# now that MySQL escapes are handled - it re-reads the text with NOTHING stripped, so a
# commented-out example in THAT file is refused. It converts a silent action into a deliberate
# one. That is the whole value and it is enough.
#
# Contract: FAIL-OPEN - ambiguity, parse failure, or a missing tool allows the command
# (exit 0); only a confident match blocks (exit 2 + reason naming which shape matched).
# Override, named in every block message: ALLOW_DESTRUCTIVE_DB=1 (exported, or inline).
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0          # no jq → fail open
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // .command // ""' 2>/dev/null || true)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || true)"
[ -z "${cmd:-}" ] && exit 0

# Escape hatch fires whether exported into the hook's env or inline-assigned (`FOO=1 cmd`).
# The inline form is matched as an ASSIGNMENT AT THE HEAD OF A SEGMENT, never as a substring
# anywhere in the command. A bare substring test disarmed the guard with ordinary data:
# `psql -c "INSERT INTO audit(msg) VALUES ('set ALLOW_DESTRUCTIVE_DB=1 to override'); TRUNCATE
# audit;"` ran unguarded, and so did any command in a session writing documentation about this
# very guard. Leading `env`/`sudo` are tolerated because that is how people actually spell it.
if [ "${ALLOW_DESTRUCTIVE_DB:-}" = "1" ] || grep -qE '^[[:space:]]*((env|sudo)[[:space:]]+)*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*ALLOW_DESTRUCTIVE_DB=1([[:space:]]|$)' \
  <<<"$(tr ';\n()&|' '\n\n\n\n\n\n' <<<"$cmd")"; then
  exit 0
fi

# Cheap pre-filter: this guard runs before EVERY Bash call, so the overwhelming majority of
# commands must leave AT THIS GREP. A name appearing ANYWHERE is only a reason to keep
# reading - command position is decided below, and decides.
grep -qE -- '(psql|mysql|mariadb|sqlite3|duckdb|usql|pgcli|mycli|cockroach|clickhouse-client|sqlcmd|supabase|wrangler|turso|pscale|drizzle-kit|prisma|alembic|dbmate|knex|flyway|atlas|goose|sqlx|db:migrate|db:rollback|db:reset|db:drop|manage\.py)' <<<"$cmd" \
  || exit 0

# Directory the command will run in, resolved the way the shell resolves it (§8): a leading
# `cd`, else the session cwd.
dir="$cwd"
if grep -Eq '^[[:space:]]*cd[[:space:]]' <<<"$cmd"; then
  dir="$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+("([^"]+)"|([^[:space:]&;]+)).*/\2\3/p' | head -1)"
fi
[ -d "${dir:-}" ] || dir="."

# ── Is a database tool in COMMAND POSITION? ───────────────────────────────────────────────
# Returns via $MODE: "sql" (the command carries SQL - read the command text and any .sql it
# names) or "runner" (a migration runner with no SQL on its line - read the branch's new
# migrations). "sql" wins if both appear: a command that carries SQL is judged on that SQL.
MODE=""
classify() { # classify <command-string> [depth]
  local seg depth="${2:-0}"
  [ "$depth" -gt 5 ] && return 0        # bounded launcher nesting (env nohup npx …)
  local IFS=$'\n'
  # Every shell separator is a single character, so `tr` does the whole job: `;` `&` `|`
  # `(` `)` and a newline each end a segment, and a doubled `&&` or `||` simply yields two.
  # It used to be a `tr` plus four `sed` substitutions with a `\n` on the right-hand side -
  # a GNU extension the BSD/macOS sed man page documents only for `y`, so the splitter's
  # correctness rested on undocumented behaviour of whichever sed a project repo happens to
  # ship. `tr` has no such question, and `&` on its own now separates too: it did not
  # before, so `sleep 1 & psql -c "DROP TABLE users"` was never classified at all.
  for seg in $(printf '%s' "$1" | tr ';\n()&|' '\n\n\n\n\n\n'); do
    local -a t; IFS=$' \t\n' read -r -a t <<< "$(printf '%s' "$seg" | tr -d "\"'")"
    IFS=$' \t\n'                        # bash 3.2 re-joins array slices on IFS - restore it
    local i=0
    while [ "${t[$i]:-}" ] && [[ "${t[$i]}" == *=* && "${t[$i]}" != -* && "${t[$i]%%=*}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; do
      i=$(( i + 1 ))                    # skip leading `FOO=bar` assignments
    done
    local head="${t[$i]:-}" next="${t[$((i+1))]:-}" third="${t[$((i+2))]:-}" dj=0
    head="${head##*/}"                  # /usr/local/bin/psql and psql are the same tool
    case "$head" in
      psql|mysql|mariadb|sqlite3|duckdb|usql|pgcli|mycli|clickhouse-client|sqlcmd)
        MODE="sql"; return 0 ;;
      cockroach)   [ "$next" = "sql" ] && { MODE="sql"; return 0; } ;;
      wrangler)    [ "$next" = "d1" ] && { MODE="sql"; return 0; } ;;
      turso|pscale) MODE="sql"; return 0 ;;
      supabase)
        # `supabase db execute/query` carries SQL; `db push`/`db reset` apply files.
        if [ "$next" = "db" ]; then
          case "$third" in
            execute|query)     MODE="sql"; return 0 ;;
            push|reset)        [ -z "$MODE" ] && MODE="runner" ;;
          esac
        fi ;;
      drizzle-kit) case "$next" in push|migrate|up) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      prisma)
        case "$next $third" in
          "migrate deploy"|"migrate dev"|"migrate reset"|"db push") [ -z "$MODE" ] && MODE="runner" ;;
        esac ;;
      alembic) case "$next" in upgrade|downgrade) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      dbmate)  case "$next" in up|down|migrate|rollback) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      knex)    case "$next" in migrate:*) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      flyway)  case "$next" in migrate|clean) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      atlas)   case "$next $third" in "migrate apply"|"schema apply") [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      goose)   case "$next" in up|up-to|down|down-to|reset) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
      sqlx)    [ "$next" = "migrate" ] && [ -z "$MODE" ] && MODE="runner" ;;
      rails|rake|bundle)
        grep -qE -- 'db:(migrate|rollback|reset|drop|schema:load)' <<<"$seg" \
          && [ -z "$MODE" ] && MODE="runner" ;;
      # Launchers: peel one layer and re-examine what they actually launch.
      docker)
        # `docker exec -it pg psql -c "…"`, `docker compose exec db psql …`, `docker run --rm
        # postgres psql …`. The generic peel cannot walk this: peeling `docker` lands on `exec`,
        # itself a launcher, which peels again onto `-it` or the container name - so none of
        # the three was classified at all. Scan forward for the first token that IS a client.
        # A migration RUNNER inside a container is still not seen; that is the allowlist limit,
        # stated in the docblock rather than hidden here.
        dj=$(( i + 1 ))
        while [ "${t[$dj]:-}" ]; do
          case "${t[$dj]##*/}" in
            psql|mysql|mariadb|sqlite3|duckdb|usql|pgcli|mycli|clickhouse-client|sqlcmd)
              MODE="sql"; return 0 ;;
          esac
          dj=$(( dj + 1 ))
        done ;;
      npx|pnpm|yarn|bun|node|env|time|nohup|setsid|sudo|exec|command|poetry|uv|pipenv|dotenv|python|python3|run|--)
        # `run` and `--` are peeled too, and they are not decoration: `poetry`, `uv` and
        # `pipenv` reach a client only through `run`, and `dotenv` only past `--`. Peeling
        # the wrapper and stopping there landed on `run`, which no arm matched, so
        # `poetry run psql -c "DROP TABLE users"` was allowed - MEASURED, not theorised.
        # A package SCRIPT (`pnpm run db`) is still not seen; that is the allowlist limit
        # in the docblock, not this.
        classify "$(printf '%s ' "${t[@]:$((i+1))}")" $(( depth + 1 )) ;;
      bash|sh|zsh)
        [ "$next" = "-c" ] && classify "$(printf '%s ' "${t[@]:$((i+2))}")" $(( depth + 1 )) ;;
      # Django's runner. Both `python3 manage.py migrate` and the script invoked by relative
      # path arrive here - the python arm above peels one layer, and `${head##*/}` strips any
      # leading directory, so either spelling reaches this arm as the bare name. This
      # used to be a glob over the whole SEGMENT (`case "$seg" in *manage.py*migrate*`), which
      # ignored command position entirely: in a Django repo with a new destructive migration
      # it blocked `git commit -m "docs: manage.py migrate notes"` and `grep -rn "manage.py
      # migrate" docs/`, falsifying this file's own command-position promise on the most
      # ordinary command there is.
      manage.py) case "$next" in migrate) [ -z "$MODE" ] && MODE="runner" ;; esac ;;
    esac
  done
  return 0
}
classify "$cmd"
[ -z "$MODE" ] && exit 0

# ── SQL text extraction ───────────────────────────────────────────────────────────────────
# Every quoted run in the command. Newlines survive, so a multi-line -c "…" stays one blob.
quoted_strings() {
  awk '{ buf = buf $0 "\n" }
       END {
         n = length(buf); i = 1; cur = ""; q = ""
         while (i <= n) {
           c = substr(buf, i, 1)
           if (q == "") { if (c == "\"" || c == "\047") { q = c; cur = "" } }
           else if (c == "\\" && q == "\"") { cur = cur substr(buf, i+1, 1); i += 2; continue }
           else if (c == q) { print cur; q = ""; cur = "" }
           else cur = cur c
           i++
         }
         if (q != "") print cur          # unterminated run - still worth reading
       }'
}

# Heredoc bodies: `<<EOF`, `<<-EOF`, `<<"EOF"`, `<<'"'"'EOF'"'"'`.
heredoc_bodies() {
  awk 'inhd { l = $0; sub(/^[ \t]+/, "", l)
              if (l == delim) { inhd = 0; next }
              print; next }
       { if (match($0, /<<-?[ \t]*("[^"]+"|\047[^\047]+\047|[A-Za-z_][A-Za-z0-9_]*)/)) {
           d = substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*/, "", d)
           gsub(/["\047]/, "", d); delim = d; inhd = 1 } }'
}

# ── Comment stripping, statement splitting and shape matching - ONE pass ──────────────────
# ALL OF IT IN ONE awk, deliberately. The first version stripped comments in awk, split in
# `tr`, then ran FIVE greps per statement from a shell loop - about 0.04 s of forking each.
# On a perfectly ordinary migration that is not a rounding error: 20 KB of INSERTs took 12 s,
# 100 KB took 64 s, and a 1.9 MB file (inside this guard's own byte cap) never finished. The
# guard runs BEFORE the command, so every one of those seconds is the session sitting still,
# and it happened on files carrying nothing destructive at all. A byte cap bounds the input;
# it does not bound the work. One process per source does.
#
# Comments go first, always: a commented-out example must not trip the guard. `/* … */` spans
# lines, so that is a state machine and not a per-line substitution.
#
# Prints one line per finding: "  • <shape> - <statement> [<source>]". Silent when clean.
analyse() { # analyse <source-label>   SQL text on stdin
  awk -v LBL="$1" '
    function emit(shape, stmt,   key) {
      key = shape "\001" substr(stmt, 1, 110)
      if (key in seen) return           # the second pass below re-reads the same text
      seen[key] = 1
      finds[++nf] = sprintf("  \xe2\x80\xa2 %s \xe2\x80\x94 %s [%s]", shape, substr(stmt, 1, 110), LBL)
    }
    function check(s,   u, rest, tok, found) {
      gsub(/[ \t\r\n]+/, " ", s); sub(/^ /, "", s); sub(/ $/, "", s)
      if (s == "") return
      u = toupper(s)
      if (u ~ /(^|[^A-Z_])DROP +TABLE( |$)/)              emit("drops a table", s)
      if (u ~ /(^|[^A-Z_])DROP +(SCHEMA|DATABASE)( |$)/)  emit("drops a schema or database", s)
      if (u ~ /(^|[^A-Z_])ALTER +TABLE( |$)/) {
        # Judge each DROP in the statement on its own: a multi-action ALTER may drop a
        # constraint AND a column, and only the column half is this shape.
        rest = u; found = 0
        while (match(rest, /DROP +(COLUMN +)?(IF +EXISTS +)?[A-Z_"][A-Z0-9_"]*/)) {
          tok  = substr(rest, RSTART, RLENGTH)
          rest = substr(rest, RSTART + RLENGTH)
          if (tok ~ /DROP +(CONSTRAINT|DEFAULT|NOT|INDEX|PRIMARY|FOREIGN|CHECK|UNIQUE|PARTITION|IDENTITY|EXPRESSION|CLUSTER|OIDS|GENERATED)( |$)/) continue
          found = 1; break
        }
        if (found) emit("drops a column", s)
      }
      if (u ~ /(^|[^A-Z_])TRUNCATE( +TABLE)?( |$)/)       emit("empties a table", s)
      check_delete(u, s)
    }
    # One DELETE at a time, and only the text belonging to IT. Testing the whole statement for
    # a WHERE meant that a WHERE belonging to a NEIGHBOUR silenced an unfiltered DELETE - which
    # statement (see the escape handling below) hid one completely, and it was already wrong for
    # `DELETE FROM a WHERE id=1; DELETE FROM b;` had anything ever merged those two. DELRE also
    # accepts the MySQL spellings `DELETE LOW_PRIORITY FROM t` and `DELETE t FROM t JOIN u`,
    # which the bare `DELETE FROM` never matched while the prose promised "a DELETE with no
    # WHERE".
    function check_delete(u, s,   n, starts, i, rest, base, region) {
      n = 0; rest = u; base = 0
      while (match(rest, DELRE)) {
        n++; starts[n] = base + RSTART
        base = base + RSTART + RLENGTH - 1
        rest = substr(rest, RSTART + RLENGTH)
      }
      for (i = 1; i <= n; i++) {
        region = (i < n) ? substr(u, starts[i], starts[i + 1] - starts[i]) : substr(u, starts[i])
        if (region !~ /(^|[^A-Z_])WHERE( |$)/) { emit("deletes every row (no WHERE)", s); return }
      }
    }
    # INCREMENTAL, never one buffer for the whole file. Appending every line to a single
    # string and splitting at the end is O(n^2) in awk: a 1.9 MB migration took 18 s that
    # way, and the statement cap that kept it finite silently dropped everything past the
    # 5000th statement - a DROP TABLE on the last line of a large file went UNSEEN. Carrying
    # only the statement being assembled is linear, and nothing is skipped.
    function split_check(s,   q) {
      cur = cur s " "
      while ((q = index(cur, ";")) > 0) { check(substr(cur, 1, q - 1)); cur = substr(cur, q + 1) }
      # A single statement with no terminator in sight (a huge INSERT, or a file with no
      # semicolons at all) must not grow without bound either - judge it and start fresh.
      if (length(cur) > 100000) { check(cur); cur = "" }
    }
    BEGIN {
      inblk = 0; instr = ""; cur = ""
      DELRE = "(^|[^A-Z_])DELETE( +(LOW_PRIORITY|QUICK|IGNORE))*( +[A-Z_0-9.\"]+(, *[A-Z_0-9.\"]+)*)? +FROM( |$)"
    }
    {
      raw[NR] = $0
      line = $0; out = ""
      # A backslash escape is neutralised BEFORE lexing, in one linear pass. MySQL and
      # MariaDB escape a quote with a backslash by default, and Postgres E-strings do too, and
      # the lexer read that
      # closing quote as the END of the literal: two of them in a file re-balanced the state,
      # so nothing looked wrong at the end and the second pass never fired, while everything
      # between them had been swallowed as string - MEASURED, with `DELETE FROM sessions;`
      # running unguarded in a three-line file. Replacing the PAIR keeps every offset and
      # cannot invent a quote. The rarer shape it now reads wrongly is a Postgres standard
      # string ending in a backslash, and that leaves the lexer unbalanced, which is exactly
      # what the second pass below is for.
      gsub(/\\./, "  ", line)
      while (length(line) > 0) {
        if (inblk) {
          p = index(line, "*/")
          if (p == 0) { line = ""; break }
          line = substr(line, p + 2); inblk = 0; out = out " "; continue
        }
        if (instr != "") {
          # INSIDE a string literal or a quoted identifier nothing opens a comment, a
          # doubled quote is an escaped quote rather than the end, and a `;` terminates
          # nothing. Without this the guard went permanently blind on an ordinary row of
          # data: a row whose value is the two characters that open a block comment used
          # to open block-comment state that never closed, and it swallowed every statement
          # after it, a DROP included, in silence.
          # A doubled quote needs no special case: closing and immediately re-opening
          # covers exactly the same characters as staying inside, so the branch that used
          # to handle it changed no verdict anywhere and is gone rather than left as code
          # no mutant could kill.
          p = index(line, instr)
          if (p == 0) { seg = line; line = "" }
          else        { seg = substr(line, 1, p); line = substr(line, p + 1); instr = "" }
          gsub(/;/, " ", seg); out = out seg
          continue
        }
        # Whichever of the four opens FIRST decides what the rest of the line is.
        b = index(line, "/*"); d = index(line, "--")
        s1 = index(line, "\047"); s2 = index(line, "\"")
        best = 0; kind = ""
        if (b  > 0 && (best == 0 || b  < best)) { best = b;  kind = "blk"    }
        if (d  > 0 && (best == 0 || d  < best)) { best = d;  kind = "line"   }
        if (s1 > 0 && (best == 0 || s1 < best)) { best = s1; kind = "\047"   }
        if (s2 > 0 && (best == 0 || s2 < best)) { best = s2; kind = "\""     }
        if (best == 0) { out = out line; line = ""; break }
        if (kind == "blk")  { out = out substr(line, 1, best - 1) " "; line = substr(line, best + 2); inblk = 1; continue }
        if (kind == "line") { out = out substr(line, 1, best - 1); line = ""; break }
        out = out substr(line, 1, best); line = substr(line, best + 1); instr = kind
      }
      split_check(out)
    }
    END {
      if (cur != "") check(cur)
      # The lexer ran off the end still inside a string or a block comment, so everything
      # past that point was invisible. The shapes that do it are real - a MySQL
      # backslash-escaped quote, an apostrophe inside a dollar-quoted function body, a
      # genuinely unterminated /*. Read the raw lines again with no stripping at all rather
      # than go quietly blind: in input that malformed, one over-block on a commented-out
      # example is much the cheaper mistake. Findings are de-duplicated, so a statement both
      # passes see is reported once.
      if (inblk || instr != "") {
        cur = ""
        for (i = 1; i <= NR; i++) split_check(raw[i])
        if (cur != "") check(cur)
      }
      for (i = 1; i <= nf; i++) print finds[i]
    }'
}

# `analyse` PRINTS its findings; nothing here assigns to a variable. Everything below feeds it
# through a pipe, and the right-hand side of a pipe is a SUBSHELL - a `FINDINGS=…` there is
# discarded the moment the pipeline ends, so the guard would have collected nothing and
# allowed every command while reading correctly.
scan() { analyse "$1"; }

# ── Gather what this command would run ────────────────────────────────────────────────────
sql_file() { # readable, a real file, and bounded - a guard must not read a gigabyte
  [ -f "$1" ] && [ -r "$1" ] && [ "$(wc -c < "$1" 2>/dev/null || echo 999999999)" -lt 2000000 ]
}

migration_candidates() {
  # The migrations this branch is ADDING: uncommitted, untracked, or committed here but not
  # on the default branch. Anything already on the default branch has run - re-reading it
  # would refuse every deploy and teach everyone to reach for the override.
  local base="" b
  for b in origin/main origin/master main master; do
    git -C "$dir" rev-parse --verify -q "$b" >/dev/null 2>&1 && { base="$b"; break; }
  done
  {
    git -C "$dir" status --porcelain -- '*.sql' 2>/dev/null | sed -e 's/^...//' -e 's/.* -> //'
    [ -n "$base" ] && git -C "$dir" diff --name-only --diff-filter=AMR "$base"...HEAD -- '*.sql' 2>/dev/null
  } | sed -e 's/^"//' -e 's/"$//' | sort -u
  # NO count cap here, deliberately. `head -40` bounded this for cost and silently dropped
  # everything past the fortieth - and because migrations sort by their numeric prefix, the
  # forty it kept were the OLDEST, so a branch adding forty-one left its NEWEST migration
  # unread. That is the same silent-false-negative shape as the statement cap this guard
  # already had to remove. The set is bounded by what the branch adds, and each file by the
  # byte cap in sql_file; both are real bounds. Cost is one awk per file.
}

FINDINGS="$(
  if [ "$MODE" = "sql" ]; then
    printf '%s' "$cmd" | quoted_strings | scan "inline"
    printf '%s' "$cmd" | heredoc_bodies | scan "heredoc"
    # .sql paths named on the command line (-f x.sql, < x.sql, or positional).
    # Deduplicated, NOT truncated: a `head -N` here is the same silent drop as the one
    # removed from migration_candidates, and the count is already bounded by the length of
    # the command line.
    printf '%s' "$cmd" | tr -d "\"'" | tr ' \t\n;&|<>()' '\n' | grep -E '\.sql$' | awk '!seen[$0]++' \
    | while IFS= read -r f; do
        [ -z "$f" ] && continue
        # NOT a `case` here. The closing paren of a case pattern inside a command
        # substitution is mis-parsed by bash 3.2, which macOS ships, and a command
        # substitution body is parsed LAZILY - so `bash -n` reports the file clean and the
        # guard dies at RUN time, fail-open, on every command it was built to judge.
        p="$dir/$f"; [ "${f#/}" != "$f" ] && p="$f"
        sql_file "$p" && scan "$f" < "$p"
      done
  else
    migration_candidates | while IFS= read -r f; do
      [ -z "$f" ] && continue
      sql_file "$dir/$f" && scan "$f" < "$dir/$f"
    done
  fi
)"

[ -z "${FINDINGS//[[:space:]]/}" ] && exit 0

printf 'BLOCKED by repo guardrails - this would run a destructive database statement:\n%s\n' "$FINDINGS" >&2
printf 'Confirm the loss is intended (a backup exists, or the data is disposable), then re-run with ALLOW_DESTRUCTIVE_DB=1.\n  %s\n' "$cmd" >&2
exit 2
