# Caracal patches

**Six, as of `0.47.9.0+caracal.4`.** Everything else below is either a version
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
| 2 | Widen the `+build` metadata rejection at FOUR independent sites (TODOS.md W9 named two; the other two were found by actually running CI on this release and reading the failures, not by assuming a fix worked): `semver.ts`'s `VERSION_RE`/`parseSemver`, `check-bootstrap-tag.sh`'s stamp-extraction class, `thin-client-upgrade-prompt.ts`'s `isValidSemverLike` (feeds `doctor-remote.ts`'s `runUpgradeDriftCheck`), and `skillpack/manifest-v1.ts`'s `SEMVER_RE` (gates `gbrain_min_version` in every skillpack/brain-resident-pack manifest) all now strip-and-validate or otherwise accept a `+identifier[.identifier]*` suffix per the semver spec (build metadata never affects precedence) before parsing/matching the numeric core | **The plausible-upstream case, unlike patch #1.** `+build` is valid semver and upstream's own regexes/validators are simply too narrow — a spec-compliance fix with no ACA/Caracal-specific shape. Confirmed each site by reading its own call chain rather than trusting a job-name match: `pendingUpgradeVersion(VERSION, now)` → `isNewerVersion` → `parseSemver(VERSION)` returned null, silently killing the self-upgrade marker; `runUpgradeDriftCheck` → `safeCompare`/`driftLevel` → `isValidSemverLike(VERSION)` returned false via a SECOND independent digit-only validator, failing 4 tests in `test/doctor-remote.serial.test.ts` and keeping `serial-tests` red after the first two sites were already widened; `loadSkillpackManifest`/`lintBrainPackTools`/`getResidentSkillDetail` all throw `SkillpackManifestError: gbrain_min_version must be semver shape... got "0.47.9.0+caracal.3"` via a THIRD independent validator, failing `test/skillpack-init-brain-pack.test.ts` and `test/skillpack-brain-resident-locate.test.ts` (shards `test (4)`/`test (9)`) — this one was documented as "still open, verify at first boot" through two prior releases before CI proved it live-breaking, not hypothetical | **not yet opened** — same operator-call reasoning as patch #1 | `src/core/semver.ts`, `scripts/check-bootstrap-tag.sh`, `src/core/thin-client-upgrade-prompt.ts`, `src/core/skillpack/manifest-v1.ts` |
| 3 | `scripts/module-size-limits.tsv`: raise `src/commands/serve-http.ts`'s ratchet ceiling 3343 → 3379 | The guard is doing its job, not a bug: patch #1's `/livez` route added exactly 36 lines, and the ratchet freezes each oversized file at a committed ceiling specifically so growth needs a reviewer-visible TSV edit (`scripts/check-module-size.sh`'s own header). This was ALREADY the state at `+caracal.2` — `verify` was red there too, for this AND the `check:bootstrap-tag` cause, but the `+caracal.2` release only checked the E2E job's actual assertions and trusted `verify`'s job-name match without diffing its own failure list, so this cause went unrecorded for one release | N/A — a repo-dev-tooling ceiling, not application behavior; nothing to upstream | `scripts/module-size-limits.tsv` |
| 4 | `gbrain migrate embeddings` leaves keyless (deferred-setup) mode: a successful migrate clears the `embedding_disabled` sentinel a keyless `gbrain init` wrote to `~/.gbrain/config.json`, `verify` treats a still-set sentinel as not done, `--status` names it and reports each provider key's source (`env`, `dotenv`, `file`, `db`, by runtime precedence), and leaving keyless mode warns (and returns `env_only_keys`) when a required key came only from this shell. `~/.gbrain/.env`, `config.json` and the DB plane count as durable; aliases such as `GEMINI_API_KEY` are named as exported. Every keyless surface (`embed`, `import`, both `init --no-embedding` banners, advisor) now gives one shared hint, `ENABLE_EMBEDDINGS_HINT`, instead of the refused `config set embedding_model`. `readGbrainEnvFile` is split out of the `.env` loader (first assignment still wins) | Found configuring this deployment: a keyless-init brain migrated to `voyage:voyage-4` embedded nothing, because every embed callsite refuses while the sentinel is set and nothing ever cleared it; the refusal message pointed at a command that is itself refused. The env-only warning exists because clearing the sentinel is durable while a shell-only key is not, so cron and hooks would start failing where keyless mode exited quietly | **not yet opened** — a plain upstream bug with no Caracal-specific shape; same operator-call reasoning as patch #1 | `src/commands/migrate-embeddings.ts`, `src/core/embedding-migration.ts`, `src/core/embedding-dim-check.ts`, `src/core/ai/defaults.ts`, `src/core/ai/provider-env.ts`, `src/core/gbrain-env-file.ts`, `src/commands/embed.ts`, `src/commands/init.ts`, `src/core/advisor/collect-setup-smells.ts`, `src/core/config.ts` (comment), `test/migrate-embeddings-disabled-sentinel.serial.test.ts`, `test/config-gbrain-env-file.test.ts`, `test/advisor-core.test.ts`, `test/e2e/init-fresh-pglite.test.ts`, `README.md`, `docs/guides/embedding-migration.md`, `docs/integrations/embedding-providers.md`, `docs/operations/headless-install.md`, `docs/architecture/KEY_FILES.md` (current-state entries for this row's files and row 5's), `llms-full.txt` (regenerated), `src/core/cli-flag-registry.generated.ts` (regenerated: `bun run build:flag-registry`; the new `model-resolver.ts` import also brings that file's doc-comment mention of `--judge-model` into `migrate`/`retrieval-upgrade`'s accepted flags, where it is a no-op) |
| 5 | `processStartMs` in `src/core/minions/worker-registry.ts` runs `ps -o lstart=` with `TZ=UTC LC_ALL=C` and parses the output as UTC | `ps` prints the start time in local time with no zone; any process whose TZ differs from the system's (bun test forces UTC) skewed it by the offset, so the PID-reuse guard dropped live workers. A localized `ps` made it unparseable | **not yet opened** — upstream bug; same operator-call reasoning as patch #1 | `src/core/minions/worker-registry.ts` |
| 6 | `test/ai/sunset-warn.test.ts` pins the existing sunset clock seam to a date before the ZeroEntropy sunset | Upstream test rot (see *Known-red checks*): the fixture's hard-coded 2026-09-04 sunset has passed in wall-clock time. Test-only | **not yet opened** — trivially upstreamable | `test/ai/sunset-warn.test.ts` |

Patch 1 cherry-picked from `feat/livez` (`f497a50e5`, cut off the `v0.47.9.0` tag
per *Upstreaming* below) onto this release branch; `bun test
test/serve-http-health.test.ts` is 11/11 and `tsc --noEmit` clean on that patch
alone. Patches 2 and 3 written directly against this branch (no separate
upstream branch exists yet), across THREE pushes to this PR as CI kept finding
what local spot-checks missed — see *Known-red checks* for the full account.
Final state leaves `bun run verify` (54/54 checks), `tsc --noEmit`,
`test/self-upgrade.test.ts` (36/36), `test/check-update.test.ts`,
`test/self-upgrade-checkonly.serial.test.ts`,
`test/check-update-refresh.serial.test.ts`, `test/doctor-remote.serial.test.ts`
(17/17), `test/thin-client-upgrade-prompt.test.ts` (49/49),
`test/skillpack-init-brain-pack.test.ts`, `test/skillpack-brain-resident-locate.test.ts`
(23/23 combined) and `test/e2e/self-upgrade-marker.test.ts` (8/8, was 6/8 at
`+caracal.1`/`.2`) green locally, plus `bash scripts/check-bootstrap-tag.sh`
(exit 0). Patches 4-6 (`+caracal.4`): `bun run verify` 54/54, and the full
unit lane on the release content shows only the two known-red watchdog
assertions below (22,726 pass). Policy #1 (*each patch has an upstream issue or
PR*) is open for patches 1, 2, 4, 5 and 6 (3 is N/A) until the PRs/decision
above land; recorded here rather than silently satisfied.

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

## Known-red checks, and why we accept them (and why this section changed shape)

Measured on the first release, 2026-09-01: 26 failing assertions, all reducing to
ONE cause. Upstream's tooling does not accept a `+` build-metadata suffix, which
is valid semver, and — as finally measured across `+caracal.3`'s three pushes,
not assumed — it rejects it in FOUR independent places, not the two originally
named by TODOS.md W9:

| # | site | effect | status as of `+caracal.3` |
|---|---|---|---|
| 1 | `src/core/semver.ts` `VERSION_RE`/`parseSemver` | `parseSemver` returned null; `pendingUpgradeVersion` silently swallowed it (never throws — the guard is `!!cur && !!lat`), so the self-upgrade marker never fired. A caller that skips the null guard (`parseSemver(VERSION)!` in three test files) DOES throw `TypeError: null is not an object` at runtime, since `!` is erased at compile time | **WIDENED — patch #2**, first push. `test/e2e/self-upgrade-marker.test.ts` 8/8 (was 6/8) |
| 2 | `src/core/thin-client-upgrade-prompt.ts` `isValidSemverLike` (feeds `doctor-remote.ts`'s `runUpgradeDriftCheck`) — a SECOND independent digit-only-with-no-suffix validator | `safeCompare`/`driftLevel` returned null/none for our own VERSION; 4 of `test/doctor-remote.serial.test.ts`'s drift-check tests expected `warn`/a real comparison and got `ok`/"inconclusive". Not named by TODOS.md W9 — kept `serial-tests` red after site (1) was already widened, found by reading the actual CI log instead of trusting the job-name match | **WIDENED — patch #2**, second push. `test/doctor-remote.serial.test.ts` 17/17, `serial-tests` GREEN |
| 3 | `src/core/skillpack/manifest-v1.ts` `SEMVER_RE` — a THIRD independent validator, gating `gbrain_min_version` in every skillpack/brain-resident-pack manifest | `SkillpackManifestError: gbrain_min_version must be semver shape... got "0.47.9.0+caracal.N"`, thrown from `loadSkillpackManifest`/`lintBrainPackTools`/`getResidentSkillDetail`; failed `test/skillpack-init-brain-pack.test.ts` and `test/skillpack-brain-resident-locate.test.ts` (CI shards `test (4)`/`test (9)`). Documented through TWO prior releases as "still open, verify at first boot", as if hypothetical — it was live-breaking the whole time and nobody ran the check that would have shown it | **WIDENED — patch #2**, third push. Both test files green locally (23/23 combined) |
| 4 | `scripts/check-bootstrap-tag.sh` stamp grep `[0-9A-Za-z.-]+` | the class excludes `+`, so a CORRECTLY stamped runbook reports as MISSING rather than mismatched. Regenerating cannot fix it | **WIDENED — patch #2**, first push. `bash scripts/check-bootstrap-tag.sh` exits 0, `verify` GREEN |
| 5 | the update/self-upgrade CLI paths built on (1)/(2) | `runCheckUpdate`, `runUpgradeDriftCheck`, `self-upgrade --check-only`, `checkSelfUpgradeHealth` | **fixed as a consequence** — all null-safe already; they return a `null`/`unparseable` verdict rather than throwing, so they only needed (1)/(2) to stop returning null/false |

**A separate, UNRELATED cause was also hiding behind `verify`'s job-name match
at `+caracal.1` and `+caracal.2`: `check:module-size` failing on
`src/commands/serve-http.ts`** (patch #1's `/livez` route pushed it 36 lines
over its ratchet ceiling). Not a `+`-suffix issue — the module-size guard was
doing exactly what it's for. Fixed as *Patches* row 3
(`scripts/module-size-limits.tsv`), first push.

**A THIRD unrelated cause hid behind `test (9)`'s job-name match from before
`+caracal.1` through `+caracal.3`; FIXED in `+caracal.4` by patch #6:**
`test/ai/sunset-warn.test.ts`, 3 of 5 tests, on a hardcoded 2026-09-04
ZeroEntropy reranker sunset date that has since passed in wall-clock time —
the production code correctly short-circuits past the sunset instead of
warning, which is exactly what it should do; the TEST fixture is dated.
Reproduces identically at the pristine `v0.47.9.0` tag with none of this
fork's patches applied — pure upstream test rot, no upstream story of ours to
carry, and not this release's to fix. Recorded here so `test (9)` staying red
on a future release doesn't get re-diagnosed from scratch or silently accepted
as "the same old known-red" without checking it is still only this.

**Known-red as of `+caracal.4`: two Bun 1.4 watchdog log-line assertions,
present on upstream `v0.47.9.0` and unchanged here.** `test/process-watchdog.serial.test.ts`
("starved loop with a SIGTERM listener is SIGTERMed then SIGKILLed") and
`test/pglite-disconnect-watchdog.serial.test.ts` ("wedge-watchdog ... SIGKILLs a
loop-starved close") assert the watchdog's stderr lines, which Bun 1.4 relays
through the starved main thread, so they never appear. The kill itself works
(both tests' signal assertions pass). A fix was attempted on the `+caracal.4`
branch and dropped: every way of logging from the worker thread let a stalled
stderr reader (full pipe, paused terminal, socket) delay or block the kill
backstop, which matters more than the log line. `src/core/process-watchdog.ts`
stays identical to upstream.

**The methodology, not just the count, is what changed.** Two releases running,
`verify` and (once `+caracal.3` started) `serial-tests` matched their expected
job NAME while each carried an undocumented second (`verify`: module-size) or
third (`serial-tests`/matrix shards: sites 2 and 3 above) failure. Job-name
matching is not assertion-list matching, and this file said so in the abstract
for a release before actually living it. `+caracal.3` was pushed three times
because each "should be green now" prediction got checked against a real run
rather than assumed — the corrections above are the record of that, kept
rather than silently overwritten, because the wrongness is the lesson.

**Measured final state, `+caracal.3`, third push (`e40ba347e`):** `verify`
GREEN (54/54 `check:*` fans), `serial-tests` GREEN, `Selected E2E
(diff-relevant)` GREEN (8/8, was 6/8), `test (1)`-`test (8)` and `test (10)`
GREEN. `test (9)` and `test-status` still show RED, and that RED is real but
OUT OF SCOPE: `test (9)`'s only failures are `test/ai/sunset-warn.test.ts`'s 3
of 5 tests, on a hardcoded 2026-09-04 ZeroEntropy sunset date that has since
passed in wall-clock time (`sunset_short_circuit` fires instead of the
once-per-process warning the tests expect) — confirmed by checking out that
one test file plus `src/core/ai/gateway.ts` at the pristine `v0.47.9.0` tag
with every other file left at this branch's HEAD: same 3/5 failure, so it is
pure upstream test rot unrelated to the `+build` class, present before any
patch here and not this release's to fix. `osv-scan` RED — unrelated,
pre-existing `browserslist@4.28.2` advisory, deferred (TODOS.md W10).

Sites (1)-(3) and the CLI paths in (5) are self-update/skillpack code, and
`GBRAIN_SELF_UPGRADE_MODE=off` is set on all six brain workloads and asserted by
`config.sh` — but "we don't run this code path" was never the reason to widen
these regexes. A permanently red CI badge on a release we cut regularly is the
reason, because that badge is exactly how a REAL regression gets ignored later
(see the module-size finding above for a live example: two releases of
"verify matches the known-red list" while it carried an undocumented second
cause). Widening sites (1)-(4) is fork patch #2 (TODOS.md W9 named sites 1 and
4; sites 2 and 3 were discovered by running CI, not planned), with a clean
upstream story throughout — `+build` is valid semver, and every site here is a
spec-compliance fix with no Caracal-specific shape.

**Beware the trap this list exists to prevent:** a permanently red badge is how a
real failure gets ignored. The per-release check is "does the failure list MATCH",
never "is it green" — and matching means diffing the actual assertions a job ran,
not its name.

## The rule

Anything outside the *Patches* and *Delta from upstream* tables is a real patch and
needs a row here with an upstream issue or PR. Check before every release, do not
assert it:

    git diff --stat <upstream-tag>..master

Checked for `+caracal.4` — the ten release paths, `CARACAL-PATCHES.md`, and exactly
the 30 files across the six rows in the *Patches* table above; nothing else moved.

Runbook: `infra/brain/FORK.md` in `caracalcorp/it`.
