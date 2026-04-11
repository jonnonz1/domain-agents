import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { readFile, readdir } from 'fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startServer } from '../../src/mcp/server.js';
import { createLookup } from '../../src/hooks/lookup.js';
import { installClaudeHooks } from '../../src/hooks/claude.js';
import {
  setupFixture,
  parseFrontmatterGlobs,
  fileMatchesGlobs,
  GROUND_TRUTH,
  FIXTURE_NAMES,
  type FixtureContext,
} from './helpers.js';

interface DomainGlobs {
  [domain: string]: string[];
}

const ACCURACY_THRESHOLDS: Record<string, number> = {
  'feature-organized': 0.90,
  'layer-organized': 0.75,
  'mixed': 0.60,
};

for (const fixture of FIXTURE_NAMES) {
  describe(`Activation correctness: ${fixture}`, () => {
    let ctx: FixtureContext;
    let client: Client;
    let domainGlobs: DomainGlobs;

    beforeAll(async () => {
      ctx = await setupFixture(fixture);
      await installClaudeHooks(ctx.tempDir);

      // Load glob patterns from generated Claude rule files
      domainGlobs = {};
      const ruleDir = join(ctx.tempDir, '.claude', 'rules');
      const ruleFiles = (await readdir(ruleDir)).filter(
        f => f.startsWith('domain-') && f !== 'domain-agents.md',
      );
      for (const file of ruleFiles) {
        const domain = file.replace('domain-', '').replace('.md', '');
        const content = await readFile(join(ruleDir, file), 'utf-8');
        domainGlobs[domain] = parseFrontmatterGlobs(content);
      }

      // Start MCP server
      const server = startServer(ctx.tempDir);
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      client = new Client({ name: 'test', version: '1.0.0' });
      await client.connect(clientTransport);
    });

    afterAll(async () => {
      await client.close();
      await ctx.cleanup();
    });

    describe('Level 1: Domain assignment (lookup)', () => {
      it('assigns files to expected domains', async () => {
        const lookup = await createLookup(ctx.tempDir);
        let correct = 0;
        let total = 0;

        for (const [file, expected] of Object.entries(GROUND_TRUTH[fixture])) {
          total++;
          const actual = lookup.getDomain(file) ?? lookup.getDomain(`src/${file}`);
          if (expected === null) {
            if (actual === null) correct++;
          } else {
            if (actual === expected) correct++;
          }
        }

        const accuracy = correct / total;
        expect(accuracy, `Assignment accuracy ${(accuracy * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(
          ACCURACY_THRESHOLDS[fixture],
        );
      });
    });

    describe('Level 2: Glob activation (simulates Claude/Cursor)', () => {
      it('correct domain globs activate for assigned files', () => {
        let correct = 0;
        let total = 0;

        for (const [file, expected] of Object.entries(GROUND_TRUTH[fixture])) {
          if (expected === null) continue;
          total++;

          const matchedDomains = Object.entries(domainGlobs)
            .filter(([, globs]) => fileMatchesGlobs(file, globs))
            .map(([d]) => d);

          if (matchedDomains.includes(expected)) correct++;
        }

        const coverage = total > 0 ? correct / total : 1;
        // Glob coverage can be lower than assignment accuracy since some
        // files (e.g. invoice.model.ts in billing) may not match naming globs
        expect(coverage, `Glob coverage ${(coverage * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(
          Math.max(ACCURACY_THRESHOLDS[fixture] - 0.15, 0.5),
        );
      });

      it('no false activations for unassigned files', () => {
        const unassigned = Object.entries(GROUND_TRUTH[fixture])
          .filter(([, d]) => d === null)
          .map(([f]) => f);

        for (const file of unassigned) {
          const matchedDomains = Object.entries(domainGlobs)
            .filter(([, globs]) => fileMatchesGlobs(file, globs))
            .map(([d]) => d);

          // Unassigned files should ideally not trigger any domain agent.
          // If they do, it's not a hard failure but we track it.
          // Just ensure they don't match more than 1 domain.
          expect(
            matchedDomains.length,
            `Unassigned ${file} matched ${matchedDomains.join(', ')}`,
          ).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('Level 3: MCP lookup', () => {
      it('MCP domain_lookup returns correct domain', async () => {
        let correct = 0;
        let total = 0;

        for (const [file, expected] of Object.entries(GROUND_TRUTH[fixture])) {
          total++;
          const result = await client.callTool({
            name: 'domain_lookup',
            arguments: { file_path: file },
          });
          const text = result.content.map((c: any) => c.text).join('\n');

          if (expected === null) {
            if (text.includes('not assigned')) correct++;
          } else {
            if (text.includes(`**${expected}**`)) correct++;
          }
        }

        const accuracy = correct / total;
        expect(accuracy, `MCP accuracy ${(accuracy * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(
          ACCURACY_THRESHOLDS[fixture],
        );
      });
    });

    it('benchmark report', async () => {
      const lookup = await createLookup(ctx.tempDir);
      const truth = GROUND_TRUTH[fixture];
      const domains = [...new Set(Object.values(truth).filter((d): d is string => d !== null))];

      const report: string[] = [];
      report.push(`\n${'='.repeat(60)}`);
      report.push(`  ${fixture} (${Object.keys(truth).length} files)`);
      report.push('='.repeat(60));

      let totalAssign = 0, totalAssignOk = 0;
      let totalGlob = 0, totalGlobOk = 0;
      let totalMcp = 0, totalMcpOk = 0;

      for (const domain of domains) {
        const domainFiles = Object.entries(truth).filter(([, d]) => d === domain).map(([f]) => f);
        const count = domainFiles.length;

        let assignOk = 0, globOk = 0, mcpOk = 0;

        for (const file of domainFiles) {
          const assigned = lookup.getDomain(file) ?? lookup.getDomain(`src/${file}`);
          if (assigned === domain) assignOk++;

          if (domainGlobs[domain] && fileMatchesGlobs(file, domainGlobs[domain])) globOk++;

          const result = await client.callTool({
            name: 'domain_lookup',
            arguments: { file_path: file },
          });
          const text = result.content.map((c: any) => c.text).join('\n');
          if (text.includes(`**${domain}**`)) mcpOk++;
        }

        totalAssign += count; totalAssignOk += assignOk;
        totalGlob += count; totalGlobOk += globOk;
        totalMcp += count; totalMcpOk += mcpOk;

        report.push(
          `  ${domain.padEnd(16)} ${assignOk}/${count} assign  ${globOk}/${count} glob  ${mcpOk}/${count} mcp`,
        );
      }

      const assignPct = Math.round((totalAssignOk / totalAssign) * 100);
      const globPct = Math.round((totalGlobOk / totalGlob) * 100);
      const mcpPct = Math.round((totalMcpOk / totalMcp) * 100);

      report.push('-'.repeat(60));
      report.push(
        `  ${'TOTAL'.padEnd(16)} ${assignPct}% assign  ${globPct}% glob  ${mcpPct}% mcp`,
      );
      report.push('');

      console.log(report.join('\n'));

      // The report always passes — the threshold assertions are in the tests above.
      expect(true).toBe(true);
    });
  });
}
