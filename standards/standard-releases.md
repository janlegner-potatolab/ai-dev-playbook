# Standard: versions and release notes

How to number versions, how to write `CHANGELOG.md` and how a release announcement is produced from it. Goal: anyone
without project context can tell what changed, in which version, and whether it affects them.

Builds on: ../project-structure-design.md (§ 1 structure, the `CHANGELOG.md` file; § 6 files in the repo; § 7 item 10 update in the same change; § 10.1 deployment and the way back)

## 1 · Three records, three questions

| Record | What it answers | For whom | Where it lives |
|---|---|---|---|
| `CHANGELOG.md` | the full history: what changed in which version | user, administrator, integrator | file in the repo root, in git |
| Release with a tag | what is new now, the announcement | whoever follows the repo or product | Releases tab (hosting metadata) |
| Internal records (ADR, specification, work status) | why and how it came about | team and AI | `docs/` |

- **The source of truth is `CHANGELOG.md`.** A release only copies the section for its version.
- **Internal records are not copied into the changelog;** the changelog links to them.
- **Why:** internal records are written for the team and agents, with context the reader does not have.
  A collaborator needs a summary that does not require knowing the history.
- **`FEATURES.md`** says what the application can do today; the changelog says what changed when. Do not mix them.

## 2 · Version numbering (Semantic Versioning 2.0.0)

Format `MAJOR.MINOR.PATCH`, git tag with the `v` prefix (`v1.4.2`).

| Part | Incremented when | Example |
|---|---|---|
| **MAJOR** | breaking change of the public contract (API, data format, behavior someone relies on) | removed field in the API, changed meaning of a state |
| **MINOR** | new feature, backward compatible | new endpoint, new screen, new optional field |
| **PATCH** | bug fix, backward compatible | calculation fix, display fix |

- **After an increment** the lower parts reset to zero: `1.4.2 → 1.5.0 → 2.0.0`.
- **`0.y.z` is initial development:** the contract is not yet stable, a breaking change may go
  into MINOR. Version `1.0.0` defines the stable public contract.
- **Pre-release versions** via a hyphen: `2.0.0-rc.1`, `2.0.0-beta.2`. They have lower precedence than
  `2.0.0`.
- **Build metadata** via a plus (`1.4.2+build.57`) does not determine the version and is ignored in comparison.
- **A released version does not change.** A bug in a release = a new version, never a rewritten tag.
- **The public contract must be named:** what is API, what is internal. Without that you cannot
  decide what is MAJOR.
- **Link to the API version:** the application MAJOR and the version in the API path (`/v1/`) are not the same thing; breaking
  the API leads to a new API version per the API standard and also to a MAJOR in the changelog, if
  the API is the product's public contract.

**A repo that is not released as a package** (internal tool, configuration, orchestration) may
date changelog sections instead of numbering them. Even so, every release gets a tag (`v0.3.0`) so that
the hosting can mark the latest release.

**The version visible in the running application** (footer, health endpoint) matches the tag or build,
so that after deployment you can verify the new code is running.

## 3 · `CHANGELOG.md` format (Keep a Changelog)

```markdown
# Changelog

All notable changes to this project are documented in this file.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- Export of orders to CSV from the order list.

## [1.5.0] - 2026-03-12

### Added
- Bulk approval of invoices for the accounting role.

### Changed
- Order list loads 50 items per page instead of all at once.

### Deprecated
- `GET /v1/orders?page=` offset pagination; use `cursor`. Removal planned in 2.0.0.

### Fixed
- VAT rounding on invoices with more than 20 items.

### Security
- Session cookie now uses `SameSite=Lax`.

[Unreleased]: https://example.com/repo/compare/v1.5.0...HEAD
[1.5.0]: https://example.com/repo/compare/v1.4.2...v1.5.0
```

- **Newest on top.** A new section is added at the beginning, never in the middle.
- **Date in ISO format** (`YYYY-MM-DD`).
- **Groups:** `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. An empty
  group is omitted.
- **The `[Unreleased]` section** collects changes for the next release; at release it is renamed to the version
  with a date and a new empty one is created above it.
- **One entry = one change from the reader's point of view,** one sentence, a verb in the past tense or
  a description of the state. Not a commit title.
- **A breaking change** is explicitly marked (`**Breaking:**`) and has an instruction on what to do.
- **Links to detail** (ADR, specification, PR) at the end of the entry, not the full content.
- **Language:** one for the whole file; a technical project in English (§ 2 of the guide), a product for
  end users in the users' language.

## 4 · When and how the changelog is updated

- **In the same change as the code** (§ 7 item 10 of the guide). A PR with a behavior change and no line in
  `[Unreleased]` is not done.
- **Why:** writing it up retroactively from commits weeks later loses the meaning of the changes and forgets those without
  a prominent commit.
- **Does not belong there:** refactoring without a behavior change, test changes, CI, formatting, internal cleanup.
  Rule: if neither a user nor an integrator notices the change, it is not in the changelog.
- **Always belongs there:** API contract change, migration with data impact, security fix,
  deprecation, permission change.
- **Collisions in parallel work:** several branches add to `[Unreleased]` at the same time; after syncing
  with `main`, check that no entry was lost or duplicated.
- **Guard (optional):** a CI check that a PR changing `server/` or `client/` also changes
  `CHANGELOG.md`, with a named exception (label) for changes with no behavior impact.

## 5 · User notes vs technical notes

| | For users | Technical |
|---|---|---|
| Reader | application user, customer | developer, administrator, API integrator |
| Language | what it can do now, what changed in their work | endpoints, schemas, migrations, configuration |
| Where | release, in-app message, e-mail | `CHANGELOG.md`, migration notes |
| Detail | the benefit and any new step | the exact contract change and what to adjust |

- **A user note** describes the outcome ("Invoices can be approved in bulk"), not the
  implementation ("Added endpoint `POST /v1/invoices/approvals`").
- **A technical note** says what the integrator must do, and by when.
- **No sensitive or operational detail:** no account names, customers, internal addresses or
  incident timelines. Neutral wording ("Fixed a bug where...").
- **A security fix** is described only after deployment, without exploitation instructions.
- **Both forms come from the same changelog section,** not from memory.

## 6 · Release process

1. **Close the section:** `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`, a new empty `[Unreleased]`,
   update the comparison links.
2. **Bump the version** in `package.json` (and everywhere the application reads it) per § 2.
3. **Commit and push** in one change (`chore(release): vX.Y.Z`).
4. **Create the tag and release only after the push,** from the commit that contains the changelog. The tag is created on
   the target branch; if the commit is not up there yet, the tag and the changelog diverge.
5. **Release text** = the copied changelog section + a link to `CHANGELOG.md`. Multi-line text
   from a file, not inlined into the command (shell quoting).

   ```bash
   gh release create vX.Y.Z --target main --title "vX.Y.Z: <headline>" --notes-file notes.md
   ```

6. **Verify the result, not the command output:** the release exists, the tag points to the right commit,
   it is marked as latest. The command can print the URL of a successful release and still end with an error
   in a later part of the line, and vice versa.
7. **Deployment** per § 10.1 of the guide (staging first, production on an explicit "yes", a known way
   back). After deployment verify that the running application reports the new version.
8. **Announce** to users per § 5 when the release has a benefit for them.

- **Rhythm:** a release after a milestone or after a finished feature, not after every commit. An announcement makes
  sense when someone follows it; a tag and "latest release" always make sense.

## Checklist

- [ ] the PR with a behavior change added an entry to `[Unreleased]` in the right group
- [ ] the entry is written for a reader without context, in one sentence, with no internal names
- [ ] a breaking change is marked and has an instruction on what to do; the version is MAJOR (or MINOR in `0.y.z`)
- [ ] a deprecation is in `Deprecated` with the planned removal version or date
- [ ] a security fix is in `Security`, without exploitation instructions
- [ ] at release: section closed with the version and ISO date, a new empty `[Unreleased]`
- [ ] the version number matches in the changelog, `package.json`, the tag and the running application
- [ ] the commit with the changelog was pushed before the tag was created
- [ ] the release text is a copy of the changelog section with a link to the whole file
- [ ] the release is verified by a query (tag, commit, "latest"), not by the command output
- [ ] after deployment the application reports the new version
- [ ] a user note exists when the release has a benefit for them

## Anti-patterns

- **Changelog as a commit dump:** the reader cannot find out what changed for them.
- **Writing up changes retroactively before a release:** lost changes and wrong groups.
- **Two sources of truth:** a release written separately from the changelog drifts apart.
- **A rewritten tag or an edited released section:** whoever downloaded the version has different content than the record.
- **A breaking change as PATCH or MINOR:** dependent systems crash after a "safe" update.
- **Internal detail in the notes:** account names, customers, incident timeline, links to
  non-public systems.
- **Describing the implementation instead of the impact** in user notes.
- **Tag before pushing the changelog:** the release points to a commit without its own notes.
- **Multi-line notes inlined directly into the command:** the shell breaks the quotes.
- **A version the running application does not show:** after deployment you cannot verify what is running.
- **Refactoring, tests and CI in the changelog:** noise that drowns out the real changes.
