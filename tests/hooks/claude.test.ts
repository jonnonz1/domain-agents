import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import { runDiscover } from '../../src/cli/discover.js';
import { runInit } from '../../src/cli/init.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, readFile, access } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Claude Code Hook Integration', () => {
  describe('feature-organized', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-claude-'));
      await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
      await runInit(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('generates CLAUDE.md in each domain directory', async () => {
      await installClaudeHooks(tempDir);

      // Feature-organized: each domain has its own src/ directory
      await expect(access(join(tempDir, 'src', 'auth', 'CLAUDE.md'))).resolves.toBeUndefined();
      await expect(access(join(tempDir, 'src', 'billing', 'CLAUDE.md'))).resolves.toBeUndefined();
      await expect(access(join(tempDir, 'src', 'email', 'CLAUDE.md'))).resolves.toBeUndefined();
      await expect(access(join(tempDir, 'src', 'users', 'CLAUDE.md'))).resolves.toBeUndefined();
    });

    it('CLAUDE.md contains domain agent context', async () => {
      await installClaudeHooks(tempDir);

      const authClaude = await readFile(join(tempDir, 'src', 'auth', 'CLAUDE.md'), 'utf-8');
      expect(authClaude).toContain('Auth');
      expect(authClaude).toContain('Interfaces');
      expect(authClaude).toContain('Technical Debt');
      expect(authClaude).toContain('Observability');
    });

    it('CLAUDE.md includes cross-domain awareness', async () => {
      await installClaudeHooks(tempDir);

      const billingClaude = await readFile(join(tempDir, 'src', 'billing', 'CLAUDE.md'), 'utf-8');
      // Billing depends on email and users — should mention them
      expect(billingClaude).toContain('email');
      expect(billingClaude).toContain('users');
    });

    it('returns list of generated files', async () => {
      const result = await installClaudeHooks(tempDir);
      expect(result.claudeMdFiles.length).toBeGreaterThanOrEqual(4);
      expect(result.claudeMdFiles.every(f => f.endsWith('CLAUDE.md'))).toBe(true);
    });
  });

  describe('layer-organized', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-claude-'));
      await cp(resolve(FIXTURES, 'layer-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
      await runInit(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('generates a root-level CLAUDE.md with all domain context for layer-organized codebases', async () => {
      const result = await installClaudeHooks(tempDir);

      // Layer-organized: domains span directories, so we generate a single
      // CLAUDE.md at src/ root that covers all domains
      const srcClaude = join(tempDir, 'src', 'CLAUDE.md');
      await expect(access(srcClaude)).resolves.toBeUndefined();

      const content = await readFile(srcClaude, 'utf-8');
      expect(content).toContain('auth');
      expect(content).toContain('billing');
      expect(content).toContain('email');
    });

    it('src/CLAUDE.md includes file-to-domain mapping', async () => {
      await installClaudeHooks(tempDir);

      const content = await readFile(join(tempDir, 'src', 'CLAUDE.md'), 'utf-8');
      // Should help Claude Code understand which files belong to which domain
      expect(content).toContain('auth.controller');
      expect(content).toContain('auth.service');
    });
  });
});
