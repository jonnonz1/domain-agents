import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import { runDiscover } from '../../src/cli/discover.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, readFile, writeFile, mkdir, readdir } from 'fs/promises';
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
      expect(rules).toContain('domain_context');
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

  describe('per-domain rule files', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-claude-'));
      await cp(resolve(FIXTURES, 'feature-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('generates per-domain rule files', async () => {
      const result = await installClaudeHooks(tempDir);

      expect(result.domainRuleFiles.length).toBeGreaterThanOrEqual(4);
      expect(result.domainRuleFiles.every(f => f.endsWith('.md'))).toBe(true);
    });

    it('creates domain-<name>.md files in .claude/rules/', async () => {
      await installClaudeHooks(tempDir);

      const entries = await readdir(join(tempDir, '.claude', 'rules'));
      expect(entries).toContain('domain-auth.md');
      expect(entries).toContain('domain-billing.md');
      expect(entries).toContain('domain-email.md');
      expect(entries).toContain('domain-users.md');
    });

    it('rule files have frontmatter with glob patterns', async () => {
      await installClaudeHooks(tempDir);

      const authRule = await readFile(join(tempDir, '.claude', 'rules', 'domain-auth.md'), 'utf-8');
      expect(authRule).toMatch(/^---\n/);
      expect(authRule).toContain('globs:');
      expect(authRule).toContain('auth');
    });

    it('rule files contain domain agent context', async () => {
      await installClaudeHooks(tempDir);

      const billingRule = await readFile(join(tempDir, '.claude', 'rules', 'domain-billing.md'), 'utf-8');
      expect(billingRule).toContain('Billing');
      expect(billingRule).toContain('Interfaces');
      expect(billingRule).toContain('Technical Debt');
    });

    it('rule files include cross-domain dependency instructions', async () => {
      await installClaudeHooks(tempDir);

      // Find a domain that has coupling to other domains
      const ruleFiles = await readdir(join(tempDir, '.claude', 'rules'));
      const domainFiles = ruleFiles.filter(f => f.startsWith('domain-'));

      let foundCrossDomain = false;
      for (const file of domainFiles) {
        const content = await readFile(join(tempDir, '.claude', 'rules', file), 'utf-8');
        if (content.includes('Cross-Domain Dependencies')) {
          foundCrossDomain = true;
          expect(content).toContain('domain_context');
          break;
        }
      }
      expect(foundCrossDomain).toBe(true);
    });

    it('frontmatter description mentions auto-activation', async () => {
      await installClaudeHooks(tempDir);

      const authRule = await readFile(join(tempDir, '.claude', 'rules', 'domain-auth.md'), 'utf-8');
      expect(authRule).toContain('auto-activates');
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
      expect(result.domainRuleFiles.length).toBeGreaterThanOrEqual(1);

      await rm(parent, { recursive: true, force: true });
    });
  });
});
