import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLookup, type DomainLookup } from '../../src/hooks/lookup.js';
import { runDiscover } from '../../src/cli/discover.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Domain Lookup', () => {
  let tempDir: string;
  let lookup: DomainLookup;

  describe('feature-organized', () => {
    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-lookup-'));
      await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
      lookup = await createLookup(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('resolves a file path to its domain name', () => {
      expect(lookup.getDomain('src/auth/auth.service.ts')).toBe('auth');
      expect(lookup.getDomain('src/email/email.service.ts')).toBe('email');
      expect(lookup.getDomain('src/billing/billing.service.ts')).toBe('billing');
    });

    it('resolves absolute paths', () => {
      const absPath = join(tempDir, 'src', 'auth', 'auth.service.ts');
      expect(lookup.getDomain(absPath)).toBe('auth');
    });

    it('returns null for files not in any domain', () => {
      // A file that doesn't exist in any domain's file list
      expect(lookup.getDomain('src/unknown/something.ts')).toBeNull();
    });

    it('returns null for unknown files', () => {
      expect(lookup.getDomain('src/foo/bar.ts')).toBeNull();
    });

    it('returns the agent file content for a domain', () => {
      const context = lookup.getAgentContext('auth');
      expect(context).toBeDefined();
      expect(context).toContain('# Auth Agent');
      expect(context).toContain('## Interfaces');
    });

    it('returns null for unknown domain', () => {
      expect(lookup.getAgentContext('nonexistent')).toBeNull();
    });

    it('resolves file path to full agent context in one call', () => {
      const context = lookup.getContextForFile('src/auth/auth.service.ts');
      expect(context).toBeDefined();
      expect(context).toContain('# Auth Agent');
    });

    it('lists all known domains', () => {
      const domains = lookup.listDomains();
      expect(domains).toContain('auth');
      expect(domains).toContain('billing');
      expect(domains).toContain('email');
      expect(domains).toContain('users');
    });

    it('returns glob patterns for a domain', () => {
      const globs = lookup.getGlobPatterns('auth');
      expect(globs).toBeDefined();
      expect(globs!.length).toBeGreaterThan(0);
      // Should include the directory pattern
      expect(globs!.some(g => g.includes('auth'))).toBe(true);
    });
  });

  describe('layer-organized', () => {
    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-lookup-'));
      await cp(resolve(FIXTURES, 'layer-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
      lookup = await createLookup(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('resolves files across layers to the correct domain', () => {
      expect(lookup.getDomain('controllers/auth.controller.ts')).toBe('auth');
      expect(lookup.getDomain('services/auth.service.ts')).toBe('auth');
      expect(lookup.getDomain('services/billing.service.ts')).toBe('billing');
    });

    it('generates cross-layer glob patterns', () => {
      const globs = lookup.getGlobPatterns('auth');
      expect(globs).toBeDefined();
      // Auth spans controllers/, services/, routes/, middleware/
      expect(globs!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
