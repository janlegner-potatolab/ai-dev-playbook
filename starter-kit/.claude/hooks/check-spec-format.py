#!/usr/bin/env python3
"""check-spec-format.py: a specification document carries its sections, and every
milestone carries an acceptance-criteria checklist.

Called with file paths, or with no arguments to check every changed document on this
branch against its merge-base.

A document opts IN one of two ways, both read from its numbered headings:

- its FIRST numbered heading is exactly `## 1. Problem Statement`, AND at least four of the
  seven section titles are present; or
- it has NO heading numbered 1 at all, AND at least five of the seven titles are present,
  each written exactly (a dash subtitle or a parenthetical aside).

The second closes a hole in the first: a document that dropped exactly its Problem
Statement no longer opened on section 1, so it was never judged. With one signal instead
of two it must be stronger: five, not four; not six, or a document missing Problem
Statement and one more section goes unjudged. And exact, because a prefix would read a
runbook's `Goals of this runbook` and `Scope of support` as two of the seven.

A document whose section 1 is anything else stays out, whatever it counts.
`## 1. Problem statement & goal` opens a great many perfectly good product documents that
were never written to this format, and judging them against seven sections they never
promised is how a check gets switched off within a week. A decision record, a README, an
older numbered document and a differently-shaped PRD are all left alone.

HTML comments and fenced code blocks are removed before anything is matched, so a page
that quotes the format in an example is not mistaken for the format. A fence that is
never closed makes the document unparseable rather than empty, so it is left alone too.

Exit codes: 0 = fine, **3 = the document is incomplete**, anything else = this checker
broke. Callers treat only 3 as a violation, so a half-copied or crashing checker fails
OPEN: it runs in front of `gh pr create`, and a checker that blocks on its own bug is
worse than no checker.

# GUARDRAILS_VERSION=8
Stdlib only, no network. Neutral wording: this file travels into other repositories.
"""
import os
import re
import subprocess
import sys

SECTIONS = ["Problem Statement", "Goal", "How to Build", "Scope", "Out of scope",
            "Milestones", "Definition of Done"]
# A PRD is the same format one moment earlier (the `analyst` skill): section 6 holds
# requirements rather than milestones, and an extra section sits before the definition of
# done. Without these aliases the check would reject the shape our own skill prescribes.
ALIASES = {"Milestones": ("Milestones", "Requirements")}
OPTIONAL_BEFORE_LAST = "What must be decided and drawn"
# How many of the seven must be present before a document is judged as one of these.
MIN_CORROBORATING = 4
# The same, for a document with no section 1 at all: one signal instead of two, so more of it.
MIN_WITHOUT_SECTION_ONE = 5

HEADING = re.compile(r"(?m)^#{1,2}[ \t]*(\d+)\.[ \t]*(.+?)[ \t]*$")
MILESTONE = re.compile(
    r"(?i)^(#{3,6})[ \t]+\**[ \t]*((?:M\d+(?!\.\d)|(?:Milestone|Phase|Stage)[ \t]*\d+(?!\.\d))\b.*?)[ \t]*$")
ANY_HEADING = re.compile(r"^(#{1,6})[ \t]")
BOX = re.compile(r"^\s*(?:[-*+]|\d+[.)])[ \t]*\[[ xX]\]")
FENCE_OPEN = re.compile(r"(`{3,}|~{3,})")
# The heading that opens the checklist. Written as a bold line, a sub-heading or a list
# item: all three are idiomatic markdown and all three mean the same thing.
CRITERIA_TEXT = ("acceptance criteria", "akceptacni kriteria", "akceptační kritéria")


def normalise(title):
    """Strip emphasis and backticks, the way the repo's sibling inventory tool does:
    '## 5. **Out of scope**' is section 5, not a missing one."""
    return re.sub(r"[*_`]", "", title).strip().rstrip("#").strip().lower()


def is_criteria_line(line):
    """'**Acceptance criteria:**', '### Acceptance criteria', '- **Acceptance criteria:**'
   : the marker is the words on a line of their own, however they are decorated. 'We have
    not written acceptance criteria yet' is prose and must not pass for one."""
    text = line.strip()
    text = re.sub(r"^#{1,6}[ \t]*", "", text)        # sub-heading form
    text = re.sub(r"^[-*+][ \t]+", "", text)         # list-item form
    text = re.sub(r"[*_`]", "", text)                # bold, italic, code
    text = re.sub(r"\([^)]*\)", "", text)            # a parenthetical such as (M1)
    return text.strip().rstrip(":").strip().lower() in CRITERIA_TEXT


def strip_comments(text):
    """HTML comments are not the document. Newlines are kept so line structure survives."""
    return re.sub(r"(?s)<!--.*?-->",
                  lambda m: "\n" * m.group(0).count("\n"), text)


def strip_fences(text):
    """Blank out fenced code blocks, keeping line count. Returns (body, unterminated).

    A closing fence may be LONGER than the one that opened it (CommonMark), which a
    back-reference misses: and missing it swallowed the rest of the document and then
    reported sections that were plainly there."""
    out, fence = [], None
    for line in text.split("\n"):
        match = FENCE_OPEN.match(line.lstrip(" \t"))
        if fence is None:
            if match:
                fence = (match.group(1)[0], len(match.group(1)))
                out.append("")
            else:
                out.append(line)
        else:
            char, length = fence
            if match and match.group(1)[0] == char and len(match.group(1)) >= length:
                fence = None
            out.append("")
    return "\n".join(out), fence is not None


def changed_files():
    """Documents this branch touches, against the merge-base with the default branch.
    Runs in the repository root so a session started in a subdirectory sees the same set."""
    try:
        root = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        return []
    bases = []
    try:                                # whatever this repo actually calls its default
        head = subprocess.run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=root,
                              capture_output=True, text=True).stdout.strip()
        if head:
            bases.append(head.split("refs/remotes/")[-1])
    except Exception:
        pass
    # NOT `@{u}`: on a branch that has been pushed: which is exactly the state at
    # `gh pr create`: merge-base(HEAD, @{u}) is HEAD, the diff is empty, and every
    # document goes unchecked while the check reports success.
    for base in bases + ["origin/main", "origin/master", "origin/develop",
                         "main", "master", "develop"]:
        try:
            mb = subprocess.run(["git", "merge-base", "HEAD", base], cwd=root,
                                capture_output=True, text=True, check=True).stdout.strip()
        except Exception:
            continue
        # `-c core.quotePath=false` AND `-z`. Git's default quotes any path with a
        # non-ASCII byte: a spec under an accented directory arrives as
        # `"docs/rozhodnut\303\255/spec.md"`: ending in a quote, not `.md`, so it was
        # dropped and the checker returned nothing. git-guardrails always invokes this with
        # no arguments, so that was the ONLY path the `gh pr create` rule had: in a repo
        # whose documents live under `docs/architektura/rozhodnutí/`, the entire rule was
        # off and said so to nobody. `-z` also removes the quoting question for paths with
        # spaces or newlines rather than trading one escaping bug for another.
        # THE UNESCAPED SPELLING OF THAT PATH IS DELIBERATELY NOT WRITTEN HERE, and putting
        # it back is the natural next edit. This file is installed into other repositories,
        # and the cited-paths check refuses a pull request that adds a line naming a path the
        # target does not track: which is every target, since that path is tracked nowhere.
        # The escaped form above carries the same bytes and is skipped as an escaped literal.
        out = subprocess.run(["git", "-c", "core.quotePath=false", "diff", "--name-only",
                              "-z", "--diff-filter=d", mb, "HEAD"],
                             cwd=root, capture_output=True, text=True).stdout
        return [os.path.join(root, f) for f in out.split("\0") if f.endswith(".md")]
    return []


# A subtitle hung off heading 1 with a dash or a parenthetical is decoration; the section
# is still "Problem Statement". `## 1. Problem statement & goal` is NOT decoration: that
# is the PRD format, which merges two of our sections into one and is a different document
# we deliberately do not judge. So strip the one and never the other.
SUBTITLE = re.compile(r"[ \t]*(?:[\u2014\u2013]|-[ \t])[^)]*$|[ \t]*\([^)]*\)[ \t]*$")


def undecorate(text):
    prev = None
    while prev != text:
        prev = text
        text = SUBTITLE.sub("", text).rstrip()
    return text


def corroborating(found):
    """How many of the seven section titles the headings carry. An alias counts as its
    section, and a section counts once however many of its names appear."""
    hits = 0
    for want in SECTIONS:
        names = ALIASES.get(want, (want,))
        if any(any(normalise(t).startswith(a.lower()) for a in names) for _, t in found):
            hits += 1
    return hits


def exact_titles(found):
    """How many of the seven section titles are written EXACTLY, decoration aside. With no
    section 1 to anchor it, a prefix is too loose: see the module docstring."""
    titles = {normalise(undecorate(t)) for _, t in found}
    return sum(1 for want in SECTIONS
               if any(a.lower() in titles for a in ALIASES.get(want, (want,))))


def opts_in(found):
    """No heading numbered 1 at all: five of the seven, or dropping exactly Problem
    Statement skips the whole check. A heading numbered 1 ANYWHERE means the document has
    a section 1, so it is read by where it opens, as before: a `## 1.` written last is
    somebody's own numbering, not the missing section this rule is for. Otherwise both
    signals, or this document is somebody else's."""
    if not found:
        return False
    # int(), the way check() reads a section number: `## 01. Background` is a section 1.
    if all(int(number) != 1 for number, _ in found):
        return exact_titles(found) >= MIN_WITHOUT_SECTION_ONE
    first_n, first_t = found[0]
    # Exactness on section 1 is the first of the two signals, but it was exact against the
    # RAW heading: `## 1. Problem Statement: the price list is empty` failed it and the
    # whole document went unjudged, silently, while `## 6. Milestones (M1)` keeps its
    # section (S14). An author who titles their problem statement turns the gate off and is
    # never told. Compare the undecorated form; the corroboration signal is unchanged.
    if first_n != "1" or normalise(undecorate(first_t)) != SECTIONS[0].lower():
        return False
    return corroborating(found) >= MIN_CORROBORATING


def milestone_region(body, seen):
    """Milestones are looked for INSIDE the milestones section only. Document-wide, a
    '### Stage 1: parse the export' describing How to Build reads as a milestone with no
    acceptance criteria, and the check rejects a document that is perfectly fine."""
    if "Milestones" not in seen:
        return body
    for name in ALIASES.get("Milestones", ("Milestones",)):
        for match in HEADING.finditer(body):
            if normalise(match.group(2)).startswith(name.lower()):
                nxt = HEADING.search(body, match.end())
                return body[match.end():nxt.start() if nxt else len(body)]
    return body


def milestone_problems(region):
    """Each milestone, from its heading to the next heading at its own level or above."""
    problems = []
    lines = region.split("\n")
    for index, line in enumerate(lines):
        match = MILESTONE.match(line)
        if not match:
            continue
        depth = len(match.group(1))
        end = len(lines)
        for offset in range(index + 1, len(lines)):
            head = ANY_HEADING.match(lines[offset])
            # A criteria sub-heading belongs to the milestone, never ends it.
            if head and len(head.group(1)) <= depth and not is_criteria_line(lines[offset]):
                end = offset
                break
        chunk = lines[index + 1:end]
        label = match.group(2).split(", ")[0].strip()
        marker = next((i for i, l in enumerate(chunk) if is_criteria_line(l)), None)
        if marker is None:
            problems.append(f"{label} has no 'Acceptance criteria:' block")
        elif not any(BOX.match(l) for l in chunk[marker + 1:]):
            problems.append(f"{label}'s acceptance criteria carry no checkable items")
    return problems


def check(path):
    """Problems with one document. Empty list = fine, or not a specification."""
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            text = fh.read()
    except (OSError, UnicodeError, ValueError):
        return []                       # unreadable: fail open, never block on our bug

    body, unterminated = strip_fences(strip_comments(text))
    if unterminated:
        return []                       # unparseable, not empty: leave it alone
    found = HEADING.findall(body)
    if not opts_in(found):
        return []

    problems = []
    seen = {}
    optional = False
    for number, title in found:
        key = normalise(title)
        if key.startswith(OPTIONAL_BEFORE_LAST.lower()):
            optional = True             # a PRD's extra section shifts the last one down
            continue
        for index, want in enumerate(SECTIONS, start=1):
            if any(key.startswith(a.lower()) for a in ALIASES.get(want, (want,))):
                if want in seen:
                    problems.append(f"section {want} appears twice")
                else:
                    seen[want] = (int(number), len(seen))
                    expect = index + (1 if optional and index == len(SECTIONS) else 0)
                    if int(number) != expect:
                        problems.append(
                            f"{want} is numbered {number}, it is section {expect}")
                break

    for index, want in enumerate(SECTIONS, start=1):
        if want not in seen:
            problems.append(f"missing section {index}. {want}")

    order = [want for want in SECTIONS if want in seen]
    if sorted(order, key=lambda w: seen[w][1]) != order:
        problems.append("sections are out of order: they run "
                        + ", ".join(sorted(order, key=lambda w: seen[w][1])))

    return problems + milestone_problems(milestone_region(body, seen))


def main():
    args = [a for a in sys.argv[1:] if a != "--porcelain"]
    porcelain = "--porcelain" in sys.argv     # one 'path: problem' per line, nothing else
    try:
        paths = args or changed_files()
    except Exception:                         # never block because our own lookup broke
        return 0
    failed = False
    for path in paths:
        try:
            problems = check(path)
        except Exception:                     # fail open: see the module docstring
            continue
        if not problems:
            continue
        failed = True
        if porcelain:
            for problem in problems:
                print(f"{path}: {problem}", file=sys.stderr)
        else:
            print(f"{path}", file=sys.stderr)
            for problem in problems:
                print(f"    {problem}", file=sys.stderr)
    if failed and not porcelain:
        print("\nA specification carries its seven sections, numbered and in order, and\n"
              "every milestone an acceptance-criteria checklist. Fix the document, or\n"
              "rename its headings if it was never meant to be one.", file=sys.stderr)
    return 3 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
