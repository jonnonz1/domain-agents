import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installCursorRules } from '../../src/hooks/cursor.js';
import { runDiscover } from '../../src/cli/discover.js';
import { runInit } from '../../src/cli/init.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Cursor Rules Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-cursor-'));
    await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
    await runDiscover(tempDir);
    await runInit(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates .cursor/rules/ directory', async () => {
    await installCursorRules(tempDir);
    const entries = await readdir(join(tempDir, '.cursor', 'rules'));
    expect(entries.length).toBeGreaterThanOrEqual(4);
  });

  it('generates a .mdc rule file per domain', async () => {
    await installCursorRules(tempDir);
    const entries = await readdir(join(tempDir, '.cursor', 'rules'));

    expect(entries).toContain('auth.mdc');
    expect(entries).toContain('billing.mdc');
    expect(entries).toContain('email.mdc');
    expect(entries).toContain('users.mdc');
  });

  it('rule files have frontmatter with glob patterns', async () => {
    await installCursorRules(tempDir);

    const authRule = await readFile(join(tempDir, '.cursor', 'rules', 'auth.mdc'), 'utf-8');
    // Cursor rules use YAML-like frontmatter with globs
    expect(authRule).toContain('---');
    expect(authRule).toMatch(/globs/i);
    expect(authRule).toContain('auth');
  });

  it('rule files contain domain agent context', async () => {
    await installCursorRules(tempDir);

    const billingRule = await readFile(join(tempDir, '.cursor', 'rules', 'billing.mdc'), 'utf-8');
    expect(billingRule).toContain('Billing');
    expect(billingRule).toContain('Interfaces');
    expect(billingRule).toContain('Technical Debt');
    expect(billingRule).toContain('Observability');
  });

  it('returns list of generated files', async () => {
    const result = await installCursorRules(tempDir);
    expect(result.ruleFiles.length).toBeGreaterThanOrEqual(4);
    expect(result.ruleFiles.every(f => f.endsWith('.mdc'))).toBe(true);
  });

  it('glob patterns match domain files', async () => {
    await installCursorRules(tempDir);

    const emailRule = await readFile(join(tempDir, '.cursor', 'rules', 'email.mdc'), 'utf-8');
    // Should have globs that match email domain files
    expect(emailRule).toMatch(/email/);
  });
});
