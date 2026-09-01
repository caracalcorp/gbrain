# Caracal patches

**None.** No hand-written change to upstream source. Everything below is either a
version string or a file GENERATED from one.

Source-identical to upstream v0.47.9.0 (commit
6bf8db908c8a7b60dcdde2f1c784d4b278f183e0, verified against `garrytan/gbrain`'s
published tag on 2026-09-01 — peeled through the tag object, not read off the ref).

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

## Delta from upstream, and why none of it is a patch

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

| # | site | effect |
|---|---|---|
| 1 | `src/core/semver.ts` `VERSION_RE` = `/^\d+\.\d+(?:\.\d+){0,2}$/` | `parseSemver` returns null; `refreshUpdateCache` throws `TypeError: null is not an object`. It does NOT fail open |
| 2 | `src/core/skillpack/manifest-v1.ts` `SEMVER_RE` | `gbrain_min_version must be semver shape; got "0.46.32.0+caracal.1"` — takes the whole skillpack manifest loader down |
| 3 | `scripts/check-bootstrap-tag.sh` stamp grep `[0-9A-Za-z.-]+` | the class excludes `+`, so a CORRECTLY stamped runbook reports as MISSING rather than mismatched. Regenerating cannot fix it |
| 4 | the update/self-upgrade CLI paths built on (1) | `runCheckUpdate`, `runUpgradeDriftCheck`, `self-upgrade --check-only`, `checkSelfUpgradeHealth` |

| 5 | `test/e2e/self-upgrade-marker.test.ts` (via (1)) | 2 failures, which fail the whole `E2E Tests` workflow through its `Selected E2E (diff-relevant)` job |

Failing jobs, measured at the `0.47.9.0+caracal.1` release: `verify`,
`serial-tests`, `test (4,7,8,9)`, `test-status`, and the whole `E2E Tests`
workflow. Shard NUMBERS drift between versions (0.46.32.0 showed 4,5,6,7,9) —
match on the job NAMES and the assertion list, never on the shard indices.

**`E2E Tests` was missing from the first version of this list.** It was written
from the `Test` workflow alone, without checking E2E. That omission is the exact
way a list-matching gate goes blind: the check below is "does the failure list
MATCH", so a short list silently accepts a real regression in the workflow it
forgot to name.

Everything in (1) and (4) is self-update code, and `GBRAIN_SELF_UPGRADE_MODE=off`
is set on all six brain workloads and asserted by `config.sh`, so none of it runs
for us. (2) affects the skillpack manifest loader, which the brain does use —
**verify this at first boot** rather than assuming the tests over-state it.

Accepted deliberately so release #1 carries zero CODE delta: a first-boot failure
then has to be infrastructure and cannot be our patch. Widening all four sites is
fork patch #1, with a clean upstream story — `+build` is valid semver.

**Beware the trap this list exists to prevent:** a permanently red badge is how a
real failure gets ignored. The per-release check is "does the failure list MATCH",
never "is it green".

`osv-scan` is also red, unrelated and pre-existing: two High (CVSS 7.5) advisories
in `browserslist@4.28.2` under `admin/bun.lock`, fixed in 4.28.7. Build-time
dependency of the admin UI, inherited from the pinned upstream tag.

## The rule

Anything outside the table above is a real patch and needs a row here with an
upstream issue or PR. Check before every release, do not assert it:

    git diff --stat <upstream-tag>..master

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
