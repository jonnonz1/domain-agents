import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDiscover } from '../../src/cli/discover.js';
import { runInit } from '../../src/cli/init.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, readFile, cp, access } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('init command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-test-'));
    // Copy fixture and run discover first
    await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
    await runDiscover(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates AGENTS.md at project root', async () => {
    await runInit(tempDir);
    const agentsMdPath = join(tempDir, 'AGENTS.md');
    const content = await readFile(agentsMdPath, 'utf-8');
    expect(content).toContain('# System Agents Map');
  });

  it('generates agent files for each domain', async () => {
    const result = await runInit(tempDir);
    expect(result.agentFiles.length).toBeGreaterThanOrEqual(4);

    // Check files exist
    for (const filePath of result.agentFiles) {
      await expect(access(filePath)).resolves.toBeUndefined();
    }
  });

  it('agent files are in agents/ directory', async () => {
    const result = await runInit(tempDir);
    for (const filePath of result.agentFiles) {
      expect(filePath).toContain('/agents/');
      expect(filePath).toMatch(/\.md$/);
    }
  });

  it('agent files contain domain-specific content', async () => {
    await runInit(tempDir);
    const authAgent = await readFile(join(tempDir, 'agents', 'auth.md'), 'utf-8');
    expect(authAgent).toContain('# Auth Agent');
    expect(authAgent).toContain('## Purpose');
    expect(authAgent).toContain('## Interfaces');
    expect(authAgent).toContain('## Technical Debt');
    expect(authAgent).toContain('## Observability');

    const emailAgent = await readFile(join(tempDir, 'agents', 'email.md'), 'utf-8');
    expect(emailAgent).toContain('# Email Agent');
  });

  it('AGENTS.md references all generated agent files', async () => {
    await runInit(tempDir);
    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('agents/auth.md');
    expect(agentsMd).toContain('agents/billing.md');
    expect(agentsMd).toContain('agents/email.md');
    expect(agentsMd).toContain('agents/users.md');
  });

  it('AGENTS.md includes domain dependency graph', async () => {
    await runInit(tempDir);
    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('## Domain Dependency Graph');
  });

  it('AGENTS.md includes cross-domain contracts', async () => {
    await runInit(tempDir);
    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('## Cross-Domain Contracts');
  });

  it('AGENTS.md includes architecture rules about observability', async () => {
    await runInit(tempDir);
    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toMatch(/observ|instrument|metric/i);
  });

  it('returns paths of all generated files', async () => {
    const result = await runInit(tempDir);
    expect(result.agentsMdPath).toBe(join(tempDir, 'AGENTS.md'));
    expect(result.agentFiles.length).toBeGreaterThanOrEqual(4);
  });

  it('throws if proposal.json does not exist', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'domain-agents-empty-'));
    await expect(runInit(emptyDir)).rejects.toThrow();
    await rm(emptyDir, { recursive: true, force: true });
  });
});

describe('discover → init end-to-end', () => {
  let tempDir: string;

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('works end-to-end for layer-organized codebase', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-e2e-'));
    await cp(resolve(FIXTURES, 'layer-organized'), tempDir, { recursive: true });

    await runDiscover(tempDir);
    const result = await runInit(tempDir);

    expect(result.agentFiles.length).toBeGreaterThanOrEqual(4);

    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('auth');
    expect(agentsMd).toContain('billing');
    expect(agentsMd).toContain('email');
  });

  it('works end-to-end for mixed codebase', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-e2e-'));
    await cp(resolve(FIXTURES, 'mixed'), tempDir, { recursive: true });

    await runDiscover(tempDir);
    const result = await runInit(tempDir);

    expect(result.agentFiles.length).toBeGreaterThanOrEqual(2);

    const agentsMd = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('# System Agents Map');
    expect(agentsMd).toContain('auth');
  });
});
