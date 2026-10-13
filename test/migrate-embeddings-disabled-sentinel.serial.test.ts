/**
 * A brain initialized keyless persists `embedding_disabled: true`. Migrating
 * it onto a provider must clear that sentinel, or every embed callsite keeps
 * refusing and the re-embed silently does nothing.
 *
 * Named `.serial.test.ts`: it points GBRAIN_HOME at a temp dir for the
 * file-plane config write.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { persistEmbeddingFileConfig } from '../src/commands/migrate-embeddings.ts';
import { resetGateway } from '../src/core/ai/gateway.ts';

let tmpHome: string;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const k of ['GBRAIN_HOME', 'GBRAIN_EMBEDDING_MODEL', 'GBRAIN_EMBEDDING_DIMENSIONS', 'DATABASE_URL']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  tmpHome = mkdtempSync(join(tmpdir(), 'gbrain-migrate-sentinel-'));
  process.env.GBRAIN_HOME = tmpHome;
  mkdirSync(join(tmpHome, '.gbrain'), { recursive: true });
  writeFileSync(join(tmpHome, '.gbrain', 'config.json'), JSON.stringify({
    engine: 'pglite',
    embedding_disabled: true,
    voyage_api_key: 'pa-test-fake',
  }, null, 2));
});

afterAll(() => {
  resetGateway();
  rmSync(tmpHome, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('persistEmbeddingFileConfig clears the deferred-setup sentinel', async () => {
  await persistEmbeddingFileConfig('voyage:voyage-4', 1024);
  const cfg = JSON.parse(readFileSync(join(tmpHome, '.gbrain', 'config.json'), 'utf-8'));
  expect(cfg.embedding_model).toBe('voyage:voyage-4');
  expect(cfg.embedding_dimensions).toBe(1024);
  expect(cfg.embedding_disabled).toBeUndefined();
  expect(cfg.voyage_api_key).toBe('pa-test-fake');
});
