import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import { runDiscover } from '../../src/cli/discover.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, readFile, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Claude Code Hook Integration', () => {
  describe('feature-organized', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-claude-'));
      await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('configures MCP server in settings.json', async () => {
      const result = await installClaudeHooks(tempDir);

      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));
      expect(settings.mcpServers['domain-agents']).toBeDefined();
      expect(settings.mcpServers['domain-agents'].command).toBe('domain-agents-mcp');
      expect(settings.mcpServers['domain-agents'].args[0]).toBe(resolve(tempDir));
    });

    it('adds SessionStart hook for domain summary', async () => {
      const result = await installClaudeHooks(tempDir);

      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));
      expect(settings.hooks.SessionStart).toBeDefined();
      const domainHook = settings.hooks.SessionStart.find(
        (h: any) => h.hooks?.some((hh: any) => hh.command?.includes('domain-agents-mcp'))
      );
      expect(domainHook).toBeDefined();
      expect(domainHook.hooks[0].command).toContain('--list-domains');
    });

    it('creates .claude/rules/domain-agents.md', async () => {
      const result = await installClaudeHooks(tempDir);

      const rules = await readFile(result.rulesPath, 'utf-8');
      expect(rules).toContain('Domain Architecture');
      expect(rules).toContain('domain_lookup');
      expect(rules).toContain('domain_context');
      expect(rules).toContain('Implementation Workflow');
    });

    it('rules file lists key domains', async () => {
      const result = await installClaudeHooks(tempDir);

      const rules = await readFile(result.rulesPath, 'utf-8');
      expect(rules).toContain('auth');
      expect(rules).toContain('billing');
    });

    it('preserves existing settings', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ env: { MY_VAR: '1' }, hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }),
        'utf-8',
      );

      const result = await installClaudeHooks(tempDir);
      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));

      expect(settings.env.MY_VAR).toBe('1');
      expect(settings.hooks.PreCompact).toBeDefined();
      expect(settings.mcpServers['domain-agents']).toBeDefined();
    });

    it('is idempotent — does not duplicate hooks on re-run', async () => {
      await installClaudeHooks(tempDir);
      await installClaudeHooks(tempDir);

      const result = await installClaudeHooks(tempDir);
      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));

      const domainHooks = settings.hooks.SessionStart.filter(
        (h: any) => h.hooks?.some((hh: any) => hh.command?.includes('domain-agents-mcp'))
      );
      expect(domainHooks.length).toBe(1);
    });
  });

  describe('monorepo support', () => {
    it('finds .claude dir by walking up from nested project', async () => {
      const parent = await mkdtemp(join(tmpdir(), 'domain-agents-parent-'));
      const child = join(parent, 'apps', 'my-app');
      await cp(resolve(FIXTURES, 'feature-organized'), child, { recursive: true });
      await mkdir(join(parent, '.claude'), { recursive: true });
      await writeFile(join(parent, '.claude', 'settings.json'), '{}', 'utf-8');
      await runDiscover(child);

      const result = await installClaudeHooks(child);

      expect(result.settingsPath).toBe(join(parent, '.claude', 'settings.json'));
      expect(result.rulesPath).toBe(join(parent, '.claude', 'rules', 'domain-agents.md'));

      await rm(parent, { recursive: true, force: true });
    });
  });
});
