import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDiscover } from '../../src/cli/discover.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, readFile, cp } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('discover command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('feature-organized codebase', () => {
    beforeEach(async () => {
      await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
    });

    it('returns discovery result with domains', async () => {
      const result = await runDiscover(tempDir);
      expect(result.domains.length).toBeGreaterThanOrEqual(4);
      const names = result.domains.map(d => d.name);
      expect(names).toContain('auth');
      expect(names).toContain('billing');
      expect(names).toContain('email');
      expect(names).toContain('users');
    });

    it('saves proposal.json to .domain-agents directory', async () => {
      await runDiscover(tempDir);
      const proposalPath = join(tempDir, '.domain-agents', 'proposal.json');
      const content = await readFile(proposalPath, 'utf-8');
      const proposal = JSON.parse(content);
      expect(proposal.domains).toBeDefined();
      expect(proposal.domains.length).toBeGreaterThanOrEqual(4);
    });

    it('proposal.json has valid structure', async () => {
      await runDiscover(tempDir);
      const proposalPath = join(tempDir, '.domain-agents', 'proposal.json');
      const proposal = JSON.parse(await readFile(proposalPath, 'utf-8'));

      for (const domain of proposal.domains) {
        expect(domain.name).toBeDefined();
        expect(domain.files).toBeDefined();
        expect(Array.isArray(domain.files)).toBe(true);
        expect(domain.confidence).toBeDefined();
        expect(typeof domain.confidence).toBe('number');
        expect(domain.signals).toBeDefined();
        expect(domain.coupling).toBeDefined();
      }
    });

    it('includes unassigned files in proposal', async () => {
      await runDiscover(tempDir);
      const proposalPath = join(tempDir, '.domain-agents', 'proposal.json');
      const proposal = JSON.parse(await readFile(proposalPath, 'utf-8'));
      expect(proposal.unassigned).toBeDefined();
      expect(Array.isArray(proposal.unassigned)).toBe(true);
    });
  });

  describe('layer-organized codebase', () => {
    beforeEach(async () => {
      await cp(resolve(FIXTURES, 'layer-organized'), tempDir, { recursive: true });
    });

    it('discovers business domains across layers', async () => {
      const result = await runDiscover(tempDir);
      const names = result.domains.map(d => d.name);
      expect(names).toContain('auth');
      expect(names).toContain('billing');
      expect(names).toContain('email');
    });
  });

  describe('mixed codebase', () => {
    beforeEach(async () => {
      await cp(resolve(FIXTURES, 'mixed'), tempDir, { recursive: true });
    });

    it('discovers domains in messy codebase', async () => {
      const result = await runDiscover(tempDir);
      expect(result.domains.length).toBeGreaterThanOrEqual(2);
    });

    it('has unassigned files for ambiguous code', async () => {
      const result = await runDiscover(tempDir);
      expect(result.unassigned.length).toBeGreaterThan(0);
    });
  });
});
