# Caracal patches

None. Source-identical to upstream v0.46.32.0 (commit
77bb9d8c2165a8eb3f15e117462fcf1164fc4c0a, verified against `garrytan/gbrain`
at setup on 2026-09-01).

This repo is a **fork of `garrytan/gbrain` at full workflow parity**: all seven
upstream workflows are present and unmodified, and `master` is upstream's own
branch name so `release.yml` triggers without an edit. We pin `master` to a tag
rather than tracking upstream's HEAD; that pin is the only intentional
divergence in git history, not in file content.

Version scheme in use: `<upstream>+caracal.<n>`, bumped in BOTH `VERSION` and
`package.json` — `gbrain --version` reads package.json while release.yml's smoke
test compares against VERSION, so bumping one alone fails the build job and no
release is published.

Delta from upstream file content:

| path | why |
|---|---|
| `VERSION`, `package.json` | our release version; bumped together, on a release commit only |
| `CARACAL-PATCHES.md` | this file |

Anything outside those three paths is a real patch and needs a row here with an
upstream issue or PR. Check before every release, do not assert it:

    git diff --stat <upstream-tag>..master

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
