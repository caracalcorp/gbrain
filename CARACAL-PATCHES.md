# Caracal patches

**Two, as of `0.47.9.0+caracal.3`.** Everything else below is either a version
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
| 2 | Widen the `+build` metadata rejection at two of the four sites named below (TODOS.md W9): `semver.ts`'s `VERSION_RE`/`parseSemver` now strip and validate a `+identifier[.identifier]*` suffix per the semver spec (build metadata never affects precedence) before parsing the numeric core; `check-bootstrap-tag.sh`'s stamp-extraction class widens from `[0-9A-Za-z.-]+` to `[0-9A-Za-z.+-]+` | **The plausible-upstream case, unlike patch #1.** `+build` is valid semver and upstream's own regexes are simply too narrow — this is a spec-compliance fix with no ACA/Caracal-specific shape, the kind of patch *Patch policy* wants: minimal and mergeable as-is. Confirmed root cause by reading the call chain: `pendingUpgradeVersion(VERSION, now)` → `isNewerVersion` → `parseSemver(VERSION)` returned null for our own `0.47.9.0+caracal.2`, so the self-upgrade marker silently never fired — reproduced locally, fixed, re-verified | **not yet opened** — same operator-call reasoning as patch #1 | `src/core/semver.ts`, `scripts/check-bootstrap-tag.sh` |

Patch 1 cherry-picked from `feat/livez` (`f497a50e5`, cut off the `v0.47.9.0` tag
per *Upstreaming* below) onto this release branch; `bun test
test/serve-http-health.test.ts` is 11/11 and `tsc --noEmit` clean on that patch
alone. Patch 2 written directly against this branch (no separate upstream
branch exists yet). Both patches leave `test/self-upgrade.test.ts` (36/36),
`test/check-update.test.ts`, `test/self-upgrade-checkonly.serial.test.ts`,
`test/check-update-refresh.serial.test.ts` and
`test/e2e/self-upgrade-marker.test.ts` (8/8, was 6/8 at `+caracal.1` — see
*Known-red checks*) green locally, plus `bash scripts/check-bootstrap-tag.sh`
(exit 0). Policy #1 (*each patch has an upstream issue or PR*) is open for
both until the PRs above exist; recorded here rather than silently satisfied.

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
is valid semver, and it rejects it in FOUR independent places:

| # | site | effect | status as of `+caracal.3` |
|---|---|---|---|
| 1 | `src/core/semver.ts` `VERSION_RE`/`parseSemver` | `parseSemver` returned null; `pendingUpgradeVersion` silently swallowed it (never throws — the guard is `!!cur && !!lat`), so the self-upgrade marker never fired. A caller that skips the null guard (`parseSemver(VERSION)!` in three test files) DOES throw `TypeError: null is not an object` at runtime, since `!` is erased at compile time | **WIDENED — patch #2.** Build metadata is now stripped and validated before parsing |
| 2 | `src/core/skillpack/manifest-v1.ts` `SEMVER_RE` | `gbrain_min_version must be semver shape; got "0.46.32.0+caracal.1"` — takes the whole skillpack manifest loader down | **still open** — a separate, independent regex; NOT touched by patch #2, which is scoped to exactly the two sites TODOS.md W9 named. (2) affects the skillpack manifest loader, which the brain does use — **verify this at first boot** rather than assuming the tests over-state it |
| 3 | `scripts/check-bootstrap-tag.sh` stamp grep `[0-9A-Za-z.-]+` | the class excludes `+`, so a CORRECTLY stamped runbook reports as MISSING rather than mismatched. Regenerating cannot fix it | **WIDENED — patch #2.** `bash scripts/check-bootstrap-tag.sh` exits 0 locally against this release's stamp |
| 4 | the update/self-upgrade CLI paths built on (1) | `runCheckUpdate`, `runUpgradeDriftCheck`, `self-upgrade --check-only`, `checkSelfUpgradeHealth` | **fixed as a consequence of (1)** — all null-safe already; they return a `null`/`unparseable` verdict rather than throwing, so they only needed (1) to stop returning null |
| 5 | `test/e2e/self-upgrade-marker.test.ts` (via (1)) | 2 of 8 failures, which fail the whole `E2E Tests` workflow through its `Selected E2E (diff-relevant)` job | **fixed — reproduced locally: 8/8 pass** against this branch (was 6/8 at `+caracal.1`/`.2`, both failures reading `Config key not found: self_upgrade.mode` on stderr because the marker line that should have preceded it never printed) |

Failing jobs, measured at the `0.47.9.0+caracal.1` and `+caracal.2` releases:
`verify`, `serial-tests`, `test (4,7,8,9)`, `test-status`, and the whole
`E2E Tests` workflow. Shard NUMBERS drift between versions (0.46.32.0 showed
4,5,6,7,9) — match on the job NAMES and the assertion list, never on the shard
indices.

**Expected for `+caracal.3`, NOT YET MEASURED against the real run — confirm
before merging, per *The rule* below.** `verify` runs `check:bootstrap-tag`
as one of ~47 fanned-out checks (`scripts/run-verify-parallel.sh`); with site
(3) widened, that check no longer fails, and CARACAL-PATCHES.md's own account
named it as `verify`'s only `+`-suffix cause — so `verify` is expected GREEN.
`serial-tests` and `Selected E2E (diff-relevant)` are expected GREEN for the
same reason: `test/self-upgrade-checkonly.serial.test.ts`,
`test/check-update-refresh.serial.test.ts`,
`test/e2e/self-upgrade-marker.test.ts` all reproduce clean locally against
this branch (see *Patches* above). `test (4,7,8,9)` and `test-status` are
UNVERIFIED locally (the full 221-file `test:serial`/matrix suite was not run
to completion in this environment — `test/self-upgrade.test.ts`,
`test/check-update.test.ts` and the two serial files above WERE run and are
green); treat any of those shards staying red as a real finding to
investigate, not an expected holdover. `osv-scan` stays red — unrelated,
pre-existing, deferred (TODOS.md W10).

**`E2E Tests` was missing from the first version of this list.** It was written
from the `Test` workflow alone, without checking E2E. That omission is the exact
way a list-matching gate goes blind: the check below is "does the failure list
MATCH", so a short list silently accepts a real regression in the workflow it
forgot to name.

Site (1) and the CLI paths in (4) are self-update code, and
`GBRAIN_SELF_UPGRADE_MODE=off` is set on all six brain workloads and asserted by
`config.sh`, so none of it running for us was ever the reason to fix it — a
permanently red CI badge on a release we cut regularly is the reason, per the
trap noted below. Widening sites (1) and (3) is fork patch #2 (TODOS.md W9),
with a clean upstream story — `+build` is valid semver, and this is a
spec-compliance fix with no Caracal-specific shape.

**Beware the trap this list exists to prevent:** a permanently red badge is how a
real failure gets ignored. The per-release check is "does the failure list MATCH",
never "is it green" — and now that some rows genuinely turn green, "MATCH" means
matching the NARROWED list above, not nostalgically re-expecting the old one.

## The rule

Anything outside the *Patches* and *Delta from upstream* tables is a real patch and
needs a row here with an upstream issue or PR. Check before every release, do not
assert it:

    git diff --stat <upstream-tag>..master

Checked for `+caracal.3` — the ten release paths, `CARACAL-PATCHES.md`, and exactly
the four files across the two rows in the *Patches* table above; nothing else moved.

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
