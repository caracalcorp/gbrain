# Caracal patches

**Three, as of `0.47.9.0+caracal.3`.** Everything else below is either a version
string or a file GENERATED from one — see *Patches* for the hand-written changes.

Source-identical to upstream v0.47.9.0 (commit
6bf8db908c8a7b60dcdde2f1c784d4b278f183e0, verified against `garrytan/gbrain`'s
published tag on 2026-09-01 — peeled through the tag object, not read off the ref)
through release `+caracal.1`.

Repinned from v0.46.32.0 the same day, once release #1 had proven the build and
attestation chain end to end. A repin takes upstream's TREE onto a commit whose
parent is our `master` (`git read-tree -u --reset <tag>`), never a rebase and
never a branch based on the tag: a rebase conflicts on every stamped file by
construction, and a tag-based branch is not a descendant of master, so GitHub
marks the PR CONFLICTING and runs no checks at all.

This repo is a **fork of `garrytan/gbrain` at full workflow parity**: all seven
upstream workflows are present and unmodified, and `master` is upstream's own
branch name so `release.yml` triggers without an edit. We pin `master` to a tag
rather than tracking upstream's HEAD.

## Version scheme

`<upstream>+caracal.<n>`, bumped in BOTH `VERSION` and `package.json` —
`gbrain --version` reads package.json while release.yml's smoke test compares
against VERSION, so bumping one alone fails the build job and publishes nothing.

## Patches

| # | what | why | upstream status | files |
|---|---|---|---|---|
| 1 | `probeProcessLiveness(version)` + `GET /livez` — a DB-free liveness route, additive, `/health` untouched | ACA's `tcpSocket` liveness probe cannot see a wedged event loop (W18); the DB-aware `/health` cannot be the liveness target without dying on every Postgres blip (W17). Splitting the two questions needs an endpoint upstream doesn't have | **not yet opened** — opening the PR against `garrytan/gbrain` is an operator call (`caracalcorp/it` TODOS.md W18 step 1), not automated by this release | `src/commands/serve-http.ts`, `test/serve-http-health.test.ts` |
| 2 | Widen the `+build` metadata rejection at THREE independent sites (TODOS.md W9 named two; the third was found by actually running CI on this release, not assumed): `semver.ts`'s `VERSION_RE`/`parseSemver`, `check-bootstrap-tag.sh`'s stamp-extraction class, and `thin-client-upgrade-prompt.ts`'s `isValidSemverLike` (feeds `doctor-remote.ts`'s `runUpgradeDriftCheck`) all now strip and validate a `+identifier[.identifier]*` suffix per the semver spec (build metadata never affects precedence) before parsing the numeric core | **The plausible-upstream case, unlike patch #1.** `+build` is valid semver and upstream's own regexes are simply too narrow — a spec-compliance fix with no ACA/Caracal-specific shape. Confirmed root cause by reading the call chain twice: `pendingUpgradeVersion(VERSION, now)` → `isNewerVersion` → `parseSemver(VERSION)` returned null for our own version, silently killing the self-upgrade marker; separately, `runUpgradeDriftCheck` → `safeCompare`/`driftLevel` → `isValidSemverLike(VERSION)` returned false for the same reason, via a THIRD independent implementation of the same digit-only check — not caught by patch #2's first cut because nothing in TODOS.md W9 named it; caught only because `serial-tests` stayed red on the real CI run and got investigated rather than assumed fixed | **not yet opened** — same operator-call reasoning as patch #1 | `src/core/semver.ts`, `scripts/check-bootstrap-tag.sh`, `src/core/thin-client-upgrade-prompt.ts` |
| 3 | `scripts/module-size-limits.tsv`: raise `src/commands/serve-http.ts`'s ratchet ceiling 3343 → 3379 | The guard is doing its job, not a bug: patch #1's `/livez` route added exactly 36 lines, and the ratchet freezes each oversized file at a committed ceiling specifically so growth needs a reviewer-visible TSV edit (`scripts/check-module-size.sh`'s own header). This was ALREADY the state at `+caracal.2` — `verify` was red there too, for this AND the `check:bootstrap-tag` cause, but the `+caracal.2` release only checked the E2E job's actual assertions and trusted `verify`'s job-name match without diffing its own failure list, so this cause went unrecorded for one release | N/A — a repo-dev-tooling ceiling, not application behavior; nothing to upstream | `scripts/module-size-limits.tsv` |

Patch 1 cherry-picked from `feat/livez` (`f497a50e5`, cut off the `v0.47.9.0` tag
per *Upstreaming* below) onto this release branch; `bun test
test/serve-http-health.test.ts` is 11/11 and `tsc --noEmit` clean on that patch
alone. Patches 2 and 3 written directly against this branch (no separate
upstream branch exists yet). All three leave `bun run verify` (54/54 checks),
`tsc --noEmit`, `test/self-upgrade.test.ts` (36/36), `test/check-update.test.ts`,
`test/self-upgrade-checkonly.serial.test.ts`,
`test/check-update-refresh.serial.test.ts`, `test/doctor-remote.serial.test.ts`,
`test/thin-client-upgrade-prompt.test.ts` and `test/e2e/self-upgrade-marker.test.ts`
(8/8, was 6/8 at `+caracal.1`/`.2` — see *Known-red checks*) green locally, plus
`bash scripts/check-bootstrap-tag.sh` (exit 0). Policy #1 (*each patch has an
upstream issue or PR*) is open for all three until the PRs/decision above land;
recorded here rather than silently satisfied.

## Delta from upstream, and why the rest of it is not a patch

| path | why |
|---|---|
| `VERSION`, `package.json` | our release version |
| `BOOTSTRAP_FOR_AGENTS.md` | one line: `<!-- gbrain-runbook-stamp: -->`, which upstream requires to equal VERSION |
| `templates/bootstrap/template-repo/**` | regenerated: `bun run scripts/generate-template-repo.ts --out templates/bootstrap/template-repo --version "$(cat VERSION)"` |
| `plugin/**`, `plugin-variants/**` | regenerated: `bun run scripts/generate-plugin-tree.ts --out plugin --variants-out plugin-variants` |
| `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `openclaw.plugin.json` | version stamp only. The generator does NOT touch these three ROOT manifests — it stamps `plugin-variants/**` and leaves them, and upstream's `version lockstep` test then fails. Stamp them by hand every bump |
| `CARACAL-PATCHES.md` | this file |

The last three are vendored generator OUTPUT that upstream's own checks byte-diff
against the generator. A version bump necessarily changes them; regenerating is
what upstream does too. Re-run both generators and the restamp on every release
and every rebase — never hand-edit them.

## Known-red checks, and why we accept them

Measured on the first release, 2026-09-01: 26 failing assertions, all reducing to
ONE cause. Upstream's tooling does not accept a `+` build-metadata suffix, which
is valid semver, and it rejects it in (at least) FIVE independent places —
FOUR were named after the first release; the fifth was found only by actually
reading `+caracal.3`'s CI failures rather than trusting a job-name match:

| # | site | effect | status as of `+caracal.3` |
|---|---|---|---|
| 1 | `src/core/semver.ts` `VERSION_RE`/`parseSemver` | `parseSemver` returned null; `pendingUpgradeVersion` silently swallowed it (never throws — the guard is `!!cur && !!lat`), so the self-upgrade marker never fired. A caller that skips the null guard (`parseSemver(VERSION)!` in three test files) DOES throw `TypeError: null is not an object` at runtime, since `!` is erased at compile time | **WIDENED — patch #2** |
| 1b | `src/core/thin-client-upgrade-prompt.ts` `isValidSemverLike` (feeds `doctor-remote.ts`'s `runUpgradeDriftCheck`, a THIRD independent digit-only-with-no-suffix validator) | `safeCompare`/`driftLevel` returned null/none for our own VERSION, so `test/doctor-remote.serial.test.ts`'s 4 drift-check tests expected `warn`/a real comparison and got `ok`/"inconclusive" instead — this is what kept `serial-tests` red at `+caracal.3`'s FIRST push, after (1) and (3) were already widened; not named by TODOS.md W9, found by reading the actual CI log rather than assuming the prediction held | **WIDENED — patch #2** (added after the first `+caracal.3` push failed; see *Patches* row 2) |
| 2 | `src/core/skillpack/manifest-v1.ts` `SEMVER_RE` | `gbrain_min_version must be semver shape; got "0.46.32.0+caracal.1"` — takes the whole skillpack manifest loader down | **still open** — a separate, independent regex, validating a SCHEMA-PACK/SKILLPACK manifest field, not our binary's own VERSION; not exercised by our `+caracal.N` string at all in normal operation. (2) affects the skillpack manifest loader, which the brain does use — **verify this at first boot** rather than assuming the tests over-state it |
| 3 | `scripts/check-bootstrap-tag.sh` stamp grep `[0-9A-Za-z.-]+` | the class excludes `+`, so a CORRECTLY stamped runbook reports as MISSING rather than mismatched. Regenerating cannot fix it | **WIDENED — patch #2.** `bash scripts/check-bootstrap-tag.sh` exits 0 locally |
| 4 | the update/self-upgrade CLI paths built on (1) | `runCheckUpdate`, `runUpgradeDriftCheck`, `self-upgrade --check-only`, `checkSelfUpgradeHealth` | **fixed as a consequence of (1)/(1b)** — all null-safe already; they return a `null`/`unparseable` verdict rather than throwing, so they only needed (1)/(1b) to stop returning null/false |
| 5 | `test/e2e/self-upgrade-marker.test.ts` (via (1)) | 2 of 8 failures, which fail the whole `E2E Tests` workflow through its `Selected E2E (diff-relevant)` job | **fixed, measured on the real run: 8/8 pass**, `Selected E2E (diff-relevant)` GREEN (was 6/8 at `+caracal.1`/`.2`, both failures reading `Config key not found: self_upgrade.mode` on stderr because the marker line that should have preceded it never printed) |

**A SIXTH, unrelated cause was also hiding behind `verify`'s job-name match at
`+caracal.1` and `+caracal.2`: `check:module-size` failing on
`src/commands/serve-http.ts` (patch #1's `/livez` route pushed it 36 lines
over its ratchet ceiling).** Not a `+`-suffix issue at all — the module-size
guard was doing exactly what it's for. Fixed as *Patches* row 3
(`scripts/module-size-limits.tsv`). This is the clean example of the trap this
whole section exists to prevent: `verify` matched the expected job NAME across
two releases while carrying an UNDOCUMENTED second failure the whole time,
because nobody diffed its actual assertion list against this file's claim
until this release's `verify` stayed red after (3) was already widened.

Failing jobs, measured at the `0.47.9.0+caracal.1` and `+caracal.2` releases:
`verify`, `serial-tests`, `test (4,7,8,9)`, `test-status`, and the whole
`E2E Tests` workflow. Shard NUMBERS drift between versions (0.46.32.0 showed
4,5,6,7,9) — match on the job NAMES and the assertion list, never on the shard
indices.

**`+caracal.3`, MEASURED across two pushes to this PR — the first cut
(patches #2 partial + #3) did NOT fully clear `serial-tests`; the second
(patch #2 extended to site 1b) did.** First push: `verify` GREEN,
`Selected E2E (diff-relevant)` GREEN, `test (7)`/`test (8)` GREEN,
`serial-tests` STILL RED — traced to site 1b above, not predicted by the
pre-push claim in this file, which is exactly why this file says "measured"
rather than "expected" once a real run exists. Second push, full results:
`osv-scan` red (unrelated, pre-existing, deferred — TODOS.md W10); everything
else in the failing-jobs list above is expected GREEN based on the fixes in
*Patches* — record the actual numbers here once the second run completes,
before merging. `test (4,7,8,9)` / `test-status`: `test (7)`/`test (8)` were
confirmed GREEN on the first push already (their earlier redness was site (1),
not site 1b); `test (4)`/`test (9)` were still red on the first push —
UNVERIFIED whether site 1b was the cause; check the second run rather than
assuming.

**`E2E Tests` was missing from the first version of this list.** It was written
from the `Test` workflow alone, without checking E2E. That omission is the exact
way a list-matching gate goes blind: the check below is "does the failure list
MATCH", so a short list silently accepts a real regression in the workflow it
forgot to name. The module-size miss above is the same trap catching this file
a second time — job-NAME matching is not the same as assertion-list matching,
and this file's own methodology got this wrong twice before being corrected.

Sites (1)/(1b) and the CLI paths in (4) are self-update code, and
`GBRAIN_SELF_UPGRADE_MODE=off` is set on all six brain workloads and asserted by
`config.sh`, so none of it running for us was ever the reason to fix it — a
permanently red CI badge on a release we cut regularly is the reason, per the
trap noted above. Widening sites (1), (1b) and (3) is fork patch #2 (TODOS.md
W9 named the first and third; the second was discovered, not planned), with a
clean upstream story — `+build` is valid semver, and this is a spec-compliance
fix with no Caracal-specific shape.

**Beware the trap this list exists to prevent:** a permanently red badge is how a
real failure gets ignored. The per-release check is "does the failure list MATCH",
never "is it green" — and matching means diffing the actual assertions a job ran,
not its name. This release's own history is the cautionary tale: `verify` and
`serial-tests` both matched by NAME across three releases while each carried an
undocumented second failure.

## The rule

Anything outside the *Patches* and *Delta from upstream* tables is a real patch and
needs a row here with an upstream issue or PR. Check before every release, do not
assert it:

    git diff --stat <upstream-tag>..master

Checked for `+caracal.3` — the ten release paths, `CARACAL-PATCHES.md`, and exactly
the six files across the three rows in the *Patches* table above; nothing else moved.

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
