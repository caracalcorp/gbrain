/**
 * A brain initialized keyless persists `embedding_disabled: true`. Migrating
 * it onto a provider must clear that sentinel, or every embed callsite keeps
 * refusing and the re-embed silently does nothing.
 *
 * Named `.serial.test.ts`: it points GBRAIN_HOME at a temp dir for the
 * file-plane config write.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { loadConfig } from '../src/core/config.ts';
import { assertEmbeddingEnabled } from '../src/core/embedding-dim-check.ts';
import {
  persistEmbeddingFileConfig,
  planMigrationFlow,
  runMigrateEmbeddings,
} from '../src/commands/migrate-embeddings.ts';
import {
  configureGateway,
  resetGateway,
  __setEmbedTransportForTests,
} from '../src/core/ai/gateway.ts';

const TARGET = 'openai:text-embedding-3-small';
const TARGET_DIMS = 1536;

let tmpHome: string;
const savedEnv: Record<string, string | undefined> = {};

function cfgPath(): string {
  return join(tmpHome, '.gbrain', 'config.json');
}
function readCfg(): Record<string, unknown> {
  return JSON.parse(readFileSync(cfgPath(), 'utf-8')) as Record<string, unknown>;
}

beforeAll(() => {
  for (const k of ['GBRAIN_HOME', 'GBRAIN_EMBEDDING_MODEL', 'GBRAIN_EMBEDDING_DIMENSIONS', 'DATABASE_URL', 'OPENAI_API_KEY', 'VOYAGE_API_KEY', 'ZEROENTROPY_API_KEY']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  tmpHome = mkdtempSync(join(tmpdir(), 'gbrain-migrate-sentinel-'));
  process.env.GBRAIN_HOME = tmpHome;
  mkdirSync(join(tmpHome, '.gbrain'), { recursive: true });
  writeFileSync(cfgPath(), JSON.stringify({
    engine: 'pglite',
    embedding_disabled: true,
    voyage_api_key: 'pa-test-fake',
  }, null, 2));
});

afterAll(() => {
  __setEmbedTransportForTests(null);
  resetGateway();
  rmSync(tmpHome, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('persistEmbeddingFileConfig clears the deferred-setup sentinel', async () => {
  await persistEmbeddingFileConfig('voyage:voyage-4', 1024);
  const cfg = readCfg();
  expect(cfg.embedding_model).toBe('voyage:voyage-4');
  expect(cfg.embedding_dimensions).toBe(1024);
  expect(cfg.embedding_disabled).toBeUndefined();
  expect(cfg.voyage_api_key).toBe('pa-test-fake');
});

/**
 * Value: protects=a brain stuck with embedding_model==target AND the
 *   embedding_disabled sentinel still on is reported as NOT converged by plan
 *   verify, shown as stuck (not unconfigured) by `--status`, and a re-run of
 *   `migrate embeddings --to X --yes` clears the sentinel instead of
 *   verified-skipping, with or without an embedding backlog;
 * fails_when=the verify file-plane read ignores embedding_disabled (verify says
 *   complete, a backlog-free run exits skipped_no_work, the sentinel stays on
 *   forever), --status hides the sentinel behind a (none) model, or the
 *   sentinel marker leaks onto a clean config;
 * why_new=existing flow/hardening tests never seed embedding_disabled, and the
 *   persist test above only covers the write path, not the self-heal verdict;
 * seam=none (reached via planMigrationFlow + runMigrateEmbeddings CLI entry).
 */
describe('stuck sentinel (model already at target)', () => {
  class ExitError extends Error {
    constructor(public code: number) { super(`exit ${code}`); }
  }
  const exitSeam = (code: number): never => { throw new ExitError(code); };

  async function runMigrate(engine: PGLiteEngine, args: string[]): Promise<{ code: number; out: string }> {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
    try {
      await runMigrateEmbeddings(engine, args, { exit: exitSeam });
      throw new Error('runMigrateEmbeddings returned without exiting');
    } catch (e) {
      if (e instanceof ExitError) return { code: e.code, out: lines.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  }

  // Each group gets its own empty brain at the target width, so a group that
  // runs the migration can't leave state behind for another.
  function useFreshEngine(): () => PGLiteEngine {
    let engine: PGLiteEngine;
    beforeAll(async () => {
      engine = new PGLiteEngine();
      await engine.connect({ embedding_dimensions: TARGET_DIMS } as never);
      await engine.initSchema();
    }, 60000);
    afterAll(async () => {
      await engine?.disconnect();
    });
    return () => engine;
  }

  async function expectSelfHeal(engine: PGLiteEngine, expectedEmbedded: number): Promise<void> {
    const first = await runMigrate(engine, ['--to', TARGET, '--dim', String(TARGET_DIMS), '--yes', '--json']);
    expect(first.code).toBe(0);
    const firstReport = JSON.parse(first.out) as { status: string; embedded: number };
    expect(firstReport.status).toBe('completed');
    expect(firstReport.embedded).toBe(expectedEmbedded);
    expect(await engine.countStaleChunks()).toBe(0);

    const cfg = readCfg();
    expect(cfg.embedding_disabled).toBeUndefined();
    expect(cfg.embedding_model).toBe(TARGET);
    expect(cfg.embedding_dimensions).toBe(TARGET_DIMS);
    // The embed callsites' own guard now lets work through.
    expect(() => assertEmbeddingEnabled(loadConfig())).not.toThrow();

    const second = await runMigrate(engine, ['--to', TARGET, '--dim', String(TARGET_DIMS), '--yes', '--json']);
    expect(second.code).toBe(0);
    expect((JSON.parse(second.out) as { status: string }).status).toBe('skipped_no_work');

    // With the sentinel gone, --status carries no sentinel marker either way.
    const statusJson = await runMigrate(engine, ['--status', '--json']);
    expect((JSON.parse(statusJson.out) as { file_plane: unknown }).file_plane).toEqual({ model: TARGET, dims: TARGET_DIMS });
    const statusHuman = await runMigrate(engine, ['--status']);
    expect(statusHuman.out).toContain(`File plane: ${TARGET} @ ${TARGET_DIMS}d\n`);
    expect(statusHuman.out).not.toContain('embedding_disabled');
  }

  // The file plane already names the target model, but the keyless sentinel
  // never got cleared (the pre-fix persist left it behind). Re-seeded per test.
  beforeEach(() => {
    writeFileSync(cfgPath(), JSON.stringify({
      engine: 'pglite',
      embedding_model: TARGET,
      embedding_dimensions: TARGET_DIMS,
      embedding_disabled: true,
      openai_api_key: 'sk-test-fake',
    }, null, 2));
  });

  beforeAll(() => {
    resetGateway();
    configureGateway({
      embedding_model: TARGET,
      embedding_dimensions: TARGET_DIMS,
      env: { OPENAI_API_KEY: 'sk-test-fake' },
    });
    __setEmbedTransportForTests(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => new Array(TARGET_DIMS).fill(0).map((_, i) => Math.sin(i) * 0.01 + 0.001)),
      usage: { tokens: values.length * 4 },
    }) as never);
  });

  describe('read-only surfaces', () => {
    const engine = useFreshEngine();

    test('plan verify keeps the config step outstanding', async () => {
      const ctx = await planMigrationFlow(engine(), { to: TARGET, dim: TARGET_DIMS });
      expect(ctx.verify.details.file_plane_ok).toBe(false);
      expect(ctx.verify.complete).toBe(false);
      // The blocker names the sentinel, matching what --status shows.
      expect(ctx.verify.blockers).toContain(
        'runtime config (file plane) has embedding_disabled set (deferred setup) — the run clears it',
      );
    }, 30000);

    test('--status --json shows the model and flags the sentinel', async () => {
      const { code, out } = await runMigrate(engine(), ['--status', '--json']);
      expect(code).toBe(0);
      const report = JSON.parse(out) as { file_plane: Record<string, unknown> | null };
      expect(report.file_plane).toEqual({ model: TARGET, dims: TARGET_DIMS, embedding_disabled: true });
    }, 30000);

    test('--status names the sentinel in the human file-plane line', async () => {
      const { code, out } = await runMigrate(engine(), ['--status']);
      expect(code).toBe(0);
      expect(out).toContain(`File plane: ${TARGET} @ ${TARGET_DIMS}d (embedding_disabled set: migrate clears it)`);
    }, 30000);
  });

  describe('re-run with no backlog', () => {
    const engine = useFreshEngine();

    test('does the config step instead of verified-skipping, then converges', async () => {
      expect(await engine().countStaleChunks()).toBe(0);
      await expectSelfHeal(engine(), 0);
    }, 120000);
  });

  describe('re-run with a backlog', () => {
    const engine = useFreshEngine();

    test('embeds the backlog, clears the sentinel, then converges', async () => {
      await engine().putPage('notes/sentinel', { type: 'note', title: 'sentinel', compiled_truth: '# sentinel\n\nbody' });
      await engine().upsertChunks('notes/sentinel', [
        { chunk_index: 0, chunk_text: 'chunk text for sentinel', chunk_source: 'compiled_truth', token_count: 5 },
      ]);
      expect(await engine().countStaleChunks()).toBe(1);
      await expectSelfHeal(engine(), 1);
    }, 120000);
  });
});
