# Caracal patches

**None.** No hand-written change to upstream source. Everything below is either a
version string or a file GENERATED from one.

Source-identical to upstream v0.46.32.0 (commit
77bb9d8c2165a8eb3f15e117462fcf1164fc4c0a, verified against `garrytan/gbrain` at
fork setup on 2026-09-01).

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
| `CARACAL-PATCHES.md` | this file |

The last three are vendored generator OUTPUT that upstream's own checks byte-diff
against the generator. A version bump necessarily changes them; regenerating is
what upstream does too. Re-run both generators and the restamp on every release
and every rebase — never hand-edit them.

## Known-red checks, and why we accept them

Measured on the first release, 2026-09-01. All trace to ONE cause: upstream's
tooling does not accept a `+` build-metadata suffix, which is valid semver.

| check | cause |
|---|---|
| `check:bootstrap-tag` | `check-bootstrap-tag.sh` extracts the stamp with `grep -oE '… [0-9A-Za-z.-]+ …'`. That class excludes `+`, so the match fails and it reports the stamp as MISSING rather than mismatched. Regeneration cannot fix it |
| `serial-tests` (`check-update-refresh.serial.test.ts`), `checkSelfUpgradeHealth` | `src/core/semver.ts`'s `VERSION_RE` is `/^\d+\.\d+(?:\.\d+){0,2}$/`, so `parseSemver` returns null on our version and `refreshUpdateCache` throws `TypeError: null is not an object`. It does NOT fail open |

Both are self-update code. `GBRAIN_SELF_UPGRADE_MODE=off` is set on all six brain
workloads and asserted by `config.sh`, so neither path executes in our deployment.

Accepted deliberately so release #1 carries zero CODE delta — a first-boot failure
then has to be infrastructure and cannot be our patch. Widening `VERSION_RE` to
accept `+build` metadata, and the stamp regex with it, is patch #1 after first
boot and has a clean upstream story: `+build` is valid semver and upstream rejects
it.

`osv-scan` is also red, for an unrelated and pre-existing reason: two High
(CVSS 7.5) advisories in `browserslist@4.28.2` under `admin/bun.lock`, fixed in
4.28.7. Build-time dependency, inherited from the pinned upstream tag, tracked in
`caracalcorp/it` TODOS.md.

## The rule

Anything outside the table above is a real patch and needs a row here with an
upstream issue or PR. Check before every release, do not assert it:

    git diff --stat <upstream-tag>..master

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
