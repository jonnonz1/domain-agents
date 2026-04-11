import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { readFile, readdir } from 'fs/promises';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import { installCursorRules } from '../../src/hooks/cursor.js';
import { setupFixture, parseFrontmatterGlobs, type FixtureContext, FIXTURE_NAMES } from './helpers.js';

for (const fixture of FIXTURE_NAMES) {
  describe(`Full pipeline: ${fixture}`, () => {
    let ctx: FixtureContext;

    beforeAll(async () => {
      ctx = await setupFixture(fixture);
    });

    afterAll(async () => {
      await ctx.cleanup();
    });

    it('proposal.json exists with domains', async () => {
      const proposal = JSON.parse(
        await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
      );
      expect(proposal.domains.length).toBeGreaterThanOrEqual(2);
      for (const d of proposal.domains) {
        expect(d.name).toBeTruthy();
        expect(d.files.length).toBeGreaterThan(0);
        expect(d.confidence).toBeGreaterThan(0);
      }
    });

    it('every domain has an agent file', async () => {
      const proposal = JSON.parse(
        await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
      );
      for (const d of proposal.domains) {
        const agentPath = join(ctx.tempDir, 'agents', `${d.name}.md`);
        const content = await readFile(agentPath, 'utf-8');
        expect(content).toContain(`# ${d.name.charAt(0).toUpperCase() + d.name.slice(1)} Agent`);
      }
    });

    it('AGENTS.md references all domains', async () => {
      const agentsMd = await readFile(join(ctx.tempDir, 'AGENTS.md'), 'utf-8');
      const proposal = JSON.parse(
        await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
      );
      for (const d of proposal.domains) {
        expect(agentsMd).toContain(`agents/${d.name}.md`);
      }
    });

    describe('Claude Code integration', () => {
      let claudeResult: Awaited<ReturnType<typeof installClaudeHooks>>;

      beforeAll(async () => {
        claudeResult = await installClaudeHooks(ctx.tempDir);
      });

      it('settings.json has MCP server config', async () => {
        const settings = JSON.parse(await readFile(claudeResult.settingsPath, 'utf-8'));
        expect(settings.mcpServers['domain-agents']).toBeDefined();
        expect(settings.mcpServers['domain-agents'].command).toBe('domain-agents-mcp');
      });

      it('settings.json has SessionStart hook', async () => {
        const settings = JSON.parse(await readFile(claudeResult.settingsPath, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        const hook = settings.hooks.SessionStart.find(
          (h: any) => h.hooks?.some((hh: any) => hh.command?.includes('domain-agents-mcp')),
        );
        expect(hook).toBeDefined();
      });

      it('every domain has a Claude rule file', async () => {
        const proposal = JSON.parse(
          await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
        );
        const ruleFiles = await readdir(join(ctx.tempDir, '.claude', 'rules'));
        for (const d of proposal.domains) {
          expect(ruleFiles).toContain(`domain-${d.name}.md`);
        }
      });

      it('Claude rule files have valid frontmatter with globs', async () => {
        const ruleDir = join(ctx.tempDir, '.claude', 'rules');
        const ruleFiles = (await readdir(ruleDir)).filter(f => f.startsWith('domain-') && f !== 'domain-agents.md');

        for (const file of ruleFiles) {
          const content = await readFile(join(ruleDir, file), 'utf-8');
          const globs = parseFrontmatterGlobs(content);
          expect(globs.length, `${file} should have globs`).toBeGreaterThan(0);
        }
      });
    });

    describe('Cursor integration', () => {
      let cursorResult: Awaited<ReturnType<typeof installCursorRules>>;

      beforeAll(async () => {
        cursorResult = await installCursorRules(ctx.tempDir);
      });

      it('every domain has a Cursor rule file', async () => {
        const proposal = JSON.parse(
          await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
        );
        const ruleFiles = await readdir(join(ctx.tempDir, '.cursor', 'rules'));
        for (const d of proposal.domains) {
          expect(ruleFiles).toContain(`${d.name}.mdc`);
        }
      });

      it('Cursor rule files have valid frontmatter with globs', async () => {
        const ruleDir = join(ctx.tempDir, '.cursor', 'rules');
        const ruleFiles = (await readdir(ruleDir)).filter(f => f.endsWith('.mdc'));

        for (const file of ruleFiles) {
          const content = await readFile(join(ruleDir, file), 'utf-8');
          const globs = parseFrontmatterGlobs(content);
          expect(globs.length, `${file} should have globs`).toBeGreaterThan(0);
        }
      });
    });

    it('Claude and Cursor globs match for same domain', async () => {
      const proposal = JSON.parse(
        await readFile(join(ctx.tempDir, '.domain-agents', 'proposal.json'), 'utf-8'),
      );

      for (const d of proposal.domains) {
        const claudeContent = await readFile(
          join(ctx.tempDir, '.claude', 'rules', `domain-${d.name}.md`),
          'utf-8',
        );
        const cursorContent = await readFile(
          join(ctx.tempDir, '.cursor', 'rules', `${d.name}.mdc`),
          'utf-8',
        );

        const claudeGlobs = parseFrontmatterGlobs(claudeContent).sort();
        const cursorGlobs = parseFrontmatterGlobs(cursorContent).sort();
        expect(claudeGlobs, `${d.name} globs should match between Claude and Cursor`).toEqual(cursorGlobs);
      }
    });
  });
}
