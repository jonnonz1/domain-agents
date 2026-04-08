import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDiscover } from '../../src/cli/discover.js';
import { runInit } from '../../src/cli/init.js';
import { runHealth } from '../../src/cli/health.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('health command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-health-'));
    await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
    await runDiscover(tempDir);
    await runInit(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns health report with domain statuses', async () => {
    const report = await runHealth(tempDir);
    expect(report.domains.length).toBeGreaterThan(0);
  });

  it('each domain has a health status', async () => {
    const report = await runHealth(tempDir);
    for (const domain of report.domains) {
      expect(domain.name).toBeDefined();
      expect(['healthy', 'warning', 'stale']).toContain(domain.status);
    }
  });

  it('reports coupling levels between domains', async () => {
    const report = await runHealth(tempDir);
    expect(report.couplingIssues).toBeDefined();
    expect(Array.isArray(report.couplingIssues)).toBe(true);
  });

  it('reports boundary violations (cross-domain imports bypassing interfaces)', async () => {
    const report = await runHealth(tempDir);
    expect(report.boundaryViolations).toBeDefined();
    expect(Array.isArray(report.boundaryViolations)).toBe(true);
  });

  it('detects stale agent files when new files are added', async () => {
    // Add a new file to the auth domain that's not in the proposal
    await writeFile(
      join(tempDir, 'src', 'auth', 'password-reset.ts'),
      'export class PasswordReset { async reset(email: string) { return true; } }',
      'utf-8',
    );

    const report = await runHealth(tempDir);
    const authDomain = report.domains.find(d => d.name === 'auth');
    expect(authDomain).toBeDefined();
    // Auth should have a warning about new uncovered files
    expect(authDomain!.newFiles.length).toBeGreaterThan(0);
    expect(authDomain!.newFiles[0]).toContain('password-reset');
  });

  it('includes recommendations for issues found', async () => {
    const report = await runHealth(tempDir);
    expect(report.recommendations).toBeDefined();
    expect(Array.isArray(report.recommendations)).toBe(true);
  });

  it('throws if no proposal exists', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'domain-agents-empty-'));
    await expect(runHealth(emptyDir)).rejects.toThrow();
    await rm(emptyDir, { recursive: true, force: true });
  });
});
