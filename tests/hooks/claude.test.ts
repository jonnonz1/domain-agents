import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import { runDiscover } from '../../src/cli/discover.js';
import { resolve, join } from 'path';
import { mkdtemp, rm, cp, readFile, mkdir } from 'fs/promises';
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

    it('configures MCP server in .claude/settings.json', async () => {
      const result = await installClaudeHooks(tempDir);

      expect(result.mcpConfigured).toBe(true);
      expect(result.settingsPath).toContain('settings.json');

      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));
      expect(settings.mcpServers).toBeDefined();
      expect(settings.mcpServers['domain-agents']).toBeDefined();
      expect(settings.mcpServers['domain-agents'].command).toBe('domain-agents-mcp');
      expect(settings.mcpServers['domain-agents'].args[0]).toBe(resolve(tempDir));
    });

    it('preserves existing settings when adding MCP config', async () => {
      // Create existing settings
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      const existingSettings = {
        env: { MY_VAR: '1' },
        permissions: { allow: ['Bash(ls:*)'] },
      };
      await import('fs/promises').then(fs =>
        fs.writeFile(join(tempDir, '.claude', 'settings.json'), JSON.stringify(existingSettings), 'utf-8')
      );

      const result = await installClaudeHooks(tempDir);
      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));

      // Existing settings preserved
      expect(settings.env.MY_VAR).toBe('1');
      expect(settings.permissions.allow).toContain('Bash(ls:*)');
      // MCP added
      expect(settings.mcpServers['domain-agents']).toBeDefined();
    });

    it('finds .claude dir by walking up from project root', async () => {
      // Create a nested project structure: parent/.claude/ exists, child does not
      const parent = await mkdtemp(join(tmpdir(), 'domain-agents-parent-'));
      const child = join(parent, 'apps', 'my-app');
      await cp(resolve(FIXTURES, 'feature-organized'), child, { recursive: true });
      await mkdir(join(parent, '.claude'), { recursive: true });
      await import('fs/promises').then(fs =>
        fs.writeFile(join(parent, '.claude', 'settings.json'), '{}', 'utf-8')
      );
      await runDiscover(child);

      const result = await installClaudeHooks(child);

      // Should find the parent's .claude directory
      expect(result.settingsPath).toBe(join(parent, '.claude', 'settings.json'));

      await rm(parent, { recursive: true, force: true });
    });
  });

  describe('layer-organized', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'domain-agents-claude-'));
      await cp(resolve(FIXTURES, 'layer-organized'), tempDir, { recursive: true });
      await runDiscover(tempDir);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('configures MCP server for layer-organized codebases', async () => {
      const result = await installClaudeHooks(tempDir);

      expect(result.mcpConfigured).toBe(true);
      const settings = JSON.parse(await readFile(result.settingsPath, 'utf-8'));
      expect(settings.mcpServers['domain-agents'].command).toBe('domain-agents-mcp');
    });
  });
});
