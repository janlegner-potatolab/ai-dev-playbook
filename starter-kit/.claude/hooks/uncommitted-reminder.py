#!/usr/bin/env python3
"""uncommitted-reminder.py - Stop hook: debounced warning when substantial
uncommitted work OR unpushed commits pile up, so a session is never ended with
work silently stranded.

GUARDRAILS_VERSION=7  [not-a-threshold]

Reads the hook payload (session_id, cwd) from stdin. Fires at most once per
cooldown window per session+repo; silent otherwise. Never blocks anything;
every path exits 0. ("Session end" is not an observable event a hook can gate -
this reminder plus the PR flow is the honest approximation.)
Tuning via env: GUARDRAILS_MIN_FILES (default 3), GUARDRAILS_MIN_LINES
(default 150), GUARDRAILS_COOLDOWN_S (default 1800). EVERY knob has a ceiling; the
cooldown ALONE also has a floor (see the BOUNDS block - only the cooldown can cause a
nag). A knob tunes this hook; it cannot switch it off.

"Never blocks; every path exits 0" was FALSE in this file for its whole life, and
saying it did not make it true. Executed rather than read, v1 exited 1 on: an empty
GUARDRAILS_MIN_FILES or GUARDRAILS_COOLDOWN_S (a ValueError, in main(), so nothing
downstream could rescue it); an empty GUARDRAILS_MIN_LINES, but only when the
file-count check is False - the two are joined by `or`, which short-circuits, so that
crash is DATA-DEPENDENT (rc=0 in a 4-file repo, rc=1 in a 1-file repo); a session_id
containing "/" (the stamp path became a directory that does not exist); an unwritable
stamp; any valid JSON that is not an object (`[1,2,3]` has no .get()); a non-string
session_id (`42[:36]`); a cwd carrying an embedded NUL (a ValueError, which the
OSError-only guard did not catch); and any UTF-8 in the message under a non-UTF-8
locale. A Stop hook that exits 1 prints a traceback at EVERY Stop and does its job at
none.

The property is TWO-SIDED, and the second side is the one that keeps getting lost: this
hook must not crash, AND it must not be TUNABLE INTO SILENCE OR NOISE. Silence and noise
are both quiet failures, and a value can be perfectly well-typed and still cause either.
So a knob may TUNE this hook; it may not switch it off and may not turn it into noise.
_num enforces it against the BOUNDS block below: EVERY knob has a ceiling, and the
cooldown - the only knob that can cause a nag - also has a floor. That asymmetry is
measured, not an oversight; the reasoning is at the block.

WHAT "not silenceable" MEANS HERE - precise, because the loose version has now been
falsified three times running. Of the three knobs above, NO value can:
  - hide >= CEILING["GUARDRAILS_MIN_FILES"] uncommitted files or
    >= CEILING["GUARDRAILS_MIN_LINES"] changed lines for longer than
    CEILING["GUARDRAILS_COOLDOWN_S"];
  - hide ANY unpushed commit for longer than that - that arm reads no threshold at all;
  - suppress anything for longer than CEILING["GUARDRAILS_COOLDOWN_S"]; or
  - fire more often than once per FLOOR["GUARDRAILS_COOLDOWN_S"].
The bullets COMPOSE - a threshold bound and a time bound together. Read alone, bullet one
would let a knob hide 50 files forever; it is the cooldown ceiling that stops that. Below
the thresholds a knob genuinely can quiet the uncommitted arm, and that is tuning.

Scope, stated because the previous version of this block said "no ENV VALUE" and that is
flatly false: PATH is an env value, and PATH=/nonexistent (or a decoy `git` earlier on it)
makes sh() swallow every git call into "" and the hook go permanently silent at rc=0.
That is deliberately out of scope - anyone who controls PATH can simply delete this file -
but "no env value" was an absolute claim with a one-line counterexample, which is exactly
the overclaim this block exists to avoid making.

Three rounds of this docstring overclaimed here, each time in the same direction, each
time in the text written to correct the previous one. It said there was NO off switch
while MIN_FILES=999999999 silenced the hook. The fix for THAT clamped the cooldown at a
comfortable-sounding 4h and repeated the claim, while COOLDOWN_S=999999999 still gagged a
70-minute-old stamp. The fix for THAT said "both directions are enforced" while
COOLDOWN_S=1 nagged at 5 of 5 Stops. Every one was written from reasoning; every one took
under a minute to falsify by running. A correct-looking file under a FALSE justification
is worse than a plain bug: the next author extends the code along the reason. If you are
about to state a property of this file, run it first.

The two directions are not independent, which is the trap: the net at __main__ turns any
site nobody guarded into SILENCE rather than a traceback, and silence is this hook failing
at its only job while looking healthy. Not hypothetical - it happened during this rewrite.
Sanitizing the stamp name with str.isalnum() (which is unicode-aware) left a repo's accent
in the filename, open() raised UnicodeEncodeError under an ascii filesystem encoding, the
net swallowed it, and the hook went quiet on a real repo at exit 0. No exit-code check
could see it; a positive-marker assertion caught it. So: assert what the hook SAYS, never
that it survived. That property is TESTED by a dedicated battery upstream - treat it as
tested, never as obvious. The obvious reading is what missed every one of the above.

This file is DISTRIBUTED: it is copied into a repo's .claude/hooks/ and maintained
upstream, so it can import nothing but the standard library. The hardening below is
therefore duplicated textually into the one other hook that shares it, rather than
extracted - there is no module both copies could import. Edit it upstream, not here,
or the next sync overwrites you.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time


# THE BOUNDS A KNOB MAY NOT LEAVE. Every number here is a judgement call; the existence of
# the bound is not. Each was put here by MEASUREMENT after a docstring claimed the property
# was already held. Recorded once, in full, because the reason is what the next author will
# extend - _num just applies them.
#
#   CEILING stops a knob switching the hook OFF. `> 0` closes only the non-positive corner,
#   and the HIGH end is the natural silencer. On the unhardened file, both at rc=0, healthy:
#     MIN_FILES=999999999 MIN_LINES=999999999 -> SILENT on 3 stranded files. Gags the
#       uncommitted-work arm ONLY; the unpushed-commits arm reads no threshold and still fires.
#     COOLDOWN_S=999999999 -> SILENT on a 70-minute-old stamp, where the default speaks.
#       Gags EVERYTHING, both arms, for as long as the value says. An earlier note called this
#       a subtler route that "merely degrades to once-per-session" - a minimisation, not a
#       measurement: the stamp outlives the Stop. (A payload with no session_id shares a
#       "nosession" stamp, spreading the same gag across sessions - an aggravation, not the
#       mechanism.) The cooldown ceiling is 2x the default and deliberately tight: a first
#       pass used a comfortable-sounding 4h, which still left the hook mute at 70 minutes.
#       A reminder whose job is to catch you as you stop must recur inside a session.
#
#   FLOOR stops a knob turning the hook into a NOISE machine, which this file argues is
#   equally fatal - nagging trains people to ignore hooks, destroying the ones that work.
#   ONLY the cooldown is in FLOOR, and that asymmetry is measured, not an oversight: only the
#   cooldown drives the debounce, so only the cooldown can nag. Measured over 5 Stops a minute
#   apart (the realistic spacing - 5 rapid Stops finish inside one second and debounce
#   themselves, which measures the harness, not the hook):
#     COOLDOWN_S=1  -> SPOKE x5, a perfect nag. 1 is positive, so `> 0` waved it through.
#     MIN_FILES=0   -> SPOKE SILENT SILENT - a threshold CANNOT nag; the debounce still holds.
#   900 is half the default, the mirror of the 2x ceiling: a knob may move the cooldown by a
#   factor of two either way.
#
# Clamping rather than rejecting an out-of-band value is deliberate: someone who writes
# 999999999 wants "high", and the highest honest value serves that intent without granting
# concealment.
CEILING = {"GUARDRAILS_MIN_FILES": 50, "GUARDRAILS_MIN_LINES": 2000,
           "GUARDRAILS_COOLDOWN_S": 3600}
FLOOR = {"GUARDRAILS_COOLDOWN_S": 900}


def _num(name, default, cast):
    """Env override or default - never raises, never returns a value that disables us.

    Clamps into the band above. A NON-POSITIVE value falls back to the default rather than
    clamping, because it carries no usable intent - and it is rejected for a reason that is
    NOT the nag: measured, a non-positive threshold does not nag (the debounce holds), it
    makes a CLEAN repo "substantial" so the hook cries wolf on an empty tree, announcing
    "0 uncommitted file(s)". An earlier docstring asserted a non-positive threshold nagged
    "same result" as a non-positive cooldown; that was reasoned, not run, and false.
    (`> 0` also rejects float nan for free - nan > 0 is False.)
    """
    fallback = cast(default)
    try:
        val = cast(os.environ.get(name, default))
    except (TypeError, ValueError):
        return fallback
    if not val > 0:
        return fallback
    floor = FLOOR.get(name)
    if floor is not None and val < floor:
        return cast(floor)
    ceiling = CEILING.get(name)
    return cast(ceiling) if ceiling is not None and val > ceiling else val


def _safe(part, fallback):
    """One path segment for the stamp filename - ASCII, never a separator, never empty,
    and DISTINCT for distinct arguments.

    A session_id of "a/b" made the stamp "<tmp>/guardrails-a/b-<repo>", whose parent
    does not exist: FileNotFoundError at every Stop. The repo name is sanitized on the
    same grounds, not because a basename can contain "/" (it cannot) but because it is
    likewise untrusted text pasted into a path.

    isascii() is NOT belt-and-braces, and this is the subtle one: str.isalnum() is
    UNICODE-aware, so "č".isalnum() is True and a repo named Café kept its accent
    in the stamp filename. Under a non-UTF-8 locale the filesystem encoding is ascii, so
    open() then raised UnicodeEncodeError - a ValueError, which the stamp's OSError-only
    guard did not catch. The stamp name is an internal debounce key that nobody reads;
    it has no business carrying anything but ASCII.

    THE DIGEST is what stops that filter costing distinctness, and the cost was real, not
    theoretical. The filter alone is MANY-TO-ONE: measured by importing this function,
    "app-č" and "app-ř" both became "app-", and any wholly non-ASCII name ("проект",
    "プロジェクト") hit the fallback. The stamp is keyed session+repo, so two such repos in ONE
    session shared ONE stamp and the second repo's reminder was suppressed for the whole
    cooldown - this hook failing at its only job, silently, at exit 0. Taking the digest
    over the RAW argument carries the distinction the visible part filtered away.

    What that buys and costs, stated exactly, because "distinct" is the kind of word that
    quietly becomes an overclaim. BUYS: distinct arguments give distinct keys, except on a
    digest collision - where the old scheme collided DETERMINISTICALLY on a whole CLASS of
    names (any two differing only outside ASCII), this one collides only by accident.
    COSTS: distinctness is now probabilistic, not guaranteed (24 bits, sized for the
    filename budget, not for collision resistance - a debounce key needs no cryptography
    and one collision costs one suppressed reminder), and the segment grows from at most
    36 characters to at most 43. It also orphans every stamp the old scheme wrote, so the
    first Stop per session+repo after this lands is un-debounced and speaks once.

    encode(errors=) is load-bearing TWICE and the obvious handler is wrong on the second
    count. A lone surrogate really reaches here: json.load yields one happily, os.getcwd()
    makes one via surrogateescape from an undecodable byte in a real path. A bare
    .encode("utf-8") RAISES on it, and the net at __main__ turns that into silence - the
    same failure this digest fixes, through a different door. "replace" does not raise but
    maps EVERY unencodable character to the SAME byte, rebuilding the collision it was
    called to remove (measured: "app-\\udcff" and "app-\\udcfe" both digest to f63b05).
    "surrogatepass" neither raises nor merges: utf-8 encodes every codepoint except
    surrogates, so passing those through makes the encoding total and injective over str.

    blake2b rather than sha1 because hashlib.blake2b is CPython's built-in _blake2 while
    hashlib.sha1 is _hashlib, the OpenSSL binding (verified via .__module__): in a function
    where every raise becomes silence, fewer moving parts under it is the cheaper bet, and
    digest_size=3 gives exactly 6 hex with no slice. HONEST LIMIT - the scenario motivating
    that preference, an OpenSSL policy build refusing sha1, was NOT tested here; sha1[:6]
    would fix the collision equally well.
    """
    raw = str(part)
    out = "".join(c for c in raw
                  if c.isascii() and (c.isalnum() or c in "-_"))[:36]
    digest = hashlib.blake2b(raw.encode("utf-8", "surrogatepass"),
                             digest_size=3).hexdigest()
    return (out or fallback) + "-" + digest


def sh(*args):
    """A git command's stdout, or "" if anything at all goes wrong.

    encoding is PINNED to utf-8: text=True decodes with the LOCALE codec, so under a
    non-UTF-8 locale any non-ASCII git output (a repo path with an accent - verified
    with `git rev-parse --show-toplevel`) raised UnicodeDecodeError, which the except
    below then swallowed into "". Git speaks UTF-8 regardless of locale, so decode it
    as UTF-8 regardless of locale. errors="replace" so an undecodable byte degrades one
    character instead of the whole reading.
    """
    try:
        return subprocess.run(args, capture_output=True, text=True,
                              encoding="utf-8", errors="replace",
                              timeout=10).stdout
    except Exception:
        return ""


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    # `[1,2,3]`, `null`, `42`, `"hi"` are all valid JSON and none of them has .get(),
    # so guarding only json.load() kept the exit-0 promise for malformed input and
    # broke it for well-formed input of the wrong shape.
    if not isinstance(payload, dict):
        payload = {}
    cwd = payload.get("cwd")
    # A non-string cwd is not merely a TypeError risk: os.chdir accepts an integer as a
    # FILE DESCRIPTOR, so a JSON number could silently move us to an unrelated directory
    # that happens to be open. Only a non-empty string is a path.
    cwd = cwd if isinstance(cwd, str) and cwd else os.getcwd()
    session = _safe(payload.get("session_id") or "nosession", "nosession")

    try:
        os.chdir(cwd)
    except (OSError, ValueError):
        # ValueError: a cwd carrying an embedded NUL - verified exit 1 before this guard.
        return
    if sh("git", "rev-parse", "--is-inside-work-tree").strip() != "true":
        return

    files = len([l for l in sh("git", "status", "--porcelain").splitlines()
                 if l.strip()])
    lines = 0
    for out in (sh("git", "diff", "--numstat"),
                sh("git", "diff", "--cached", "--numstat")):
        for row in out.splitlines():
            parts = row.split("\t")
            if len(parts) >= 2:
                lines += int(parts[0]) if parts[0].isdigit() else 0
                lines += int(parts[1]) if parts[1].isdigit() else 0

    unpushed = sh("git", "rev-list", "--count", "@{u}..HEAD").strip()
    unpushed = int(unpushed) if unpushed.isdigit() else 0

    substantial = (files >= _num("GUARDRAILS_MIN_FILES", "3", int)
                   or lines >= _num("GUARDRAILS_MIN_LINES", "150", int))
    if not substantial and unpushed == 0:
        return

    # Two forms on purpose: the message shows the repo's REAL name (stdout is UTF-8 below,
    # so an accent is fine and mangling it would make the reminder harder to act on), while
    # the stamp key is ASCII-only - a filename must survive an ascii filesystem encoding.
    repo = os.path.basename(sh("git", "rev-parse", "--show-toplevel").strip()
                            or cwd) or "repo"
    cooldown = _num("GUARDRAILS_COOLDOWN_S", "1800", int)
    stamp = os.path.join(tempfile.gettempdir(),
                         f"guardrails-{session}-{_safe(repo, 'repo')}")
    try:
        if time.time() - os.path.getmtime(stamp) < cooldown:
            return
    except (OSError, ValueError):
        pass
    try:
        with open(stamp, "w") as f:
            f.write(str(int(time.time())))
    except (OSError, ValueError):
        # Fail CLOSED. If the debounce cannot record that we fired, we cannot rate-limit
        # ourselves, and a reminder at every single Stop is worse than a missed one -
        # it is what teaches people to tune these messages out.
        return

    bits = []
    if substantial:
        bits.append(f"{files} uncommitted file(s), ~{lines} changed line(s)")
    if unpushed:
        bits.append(f"{unpushed} unpushed commit(s)")
    # The message hardcodes a non-ASCII character, so this is NOT a theoretical locale
    # worry and does not depend on a non-ASCII repo name: under an ASCII stdout the
    # print raised UnicodeEncodeError on the ⚑ itself and exited 1. (Bare LC_ALL=C does
    # not show it - PEP-538 coerces C to C.UTF-8; it needs PYTHONCOERCECLOCALE=0
    # PYTHONUTF8=0 to reproduce, which is why reading the code found nothing.) The hook
    # protocol is JSON, and JSON is UTF-8 by definition, so write UTF-8 whatever the
    # locale claims, and never let one unencodable byte take the session down.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError, ValueError):
        pass
    print(json.dumps({"systemMessage":
        f"⚑ guardrails: {' + '.join(bits)} in {repo} - don't end the session "
        f"without committing + pushing (or explicitly parking) this work."},
        ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # A net, not a substitute for the guards above - each of those sits at a site found
        # by EXECUTING this file, and four successive review rounds on a hook built the same
        # way each turned up a NEW one at a spot the previous round had read and approved.
        # The honest reading is that another site exists here too. This turns that unknown
        # into silence instead of a traceback at every Stop; the guards are what keep it
        # from being silent for a reason somebody already knows about.
        pass
    sys.exit(0)
