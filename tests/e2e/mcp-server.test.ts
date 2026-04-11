import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startServer } from '../../src/mcp/server.js';
import { setupFixture, GROUND_TRUTH, FIXTURE_NAMES, type FixtureContext } from './helpers.js';

function getTextContent(result: any): string {
  return result.content.map((c: any) => c.text).join('\n');
}

for (const fixture of FIXTURE_NAMES) {
  describe(`MCP server: ${fixture}`, () => {
    let ctx: FixtureContext;
    let client: Client;

    beforeAll(async () => {
      ctx = await setupFixture(fixture);

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

    describe('list_domains', () => {
      it('returns all discovered domains', async () => {
        const result = await client.callTool({ name: 'list_domains', arguments: {} });
        const text = getTextContent(result);

        const expectedDomains = [...new Set(
          Object.values(GROUND_TRUTH[fixture]).filter((d): d is string => d !== null),
        )];
        for (const domain of expectedDomains) {
          expect(text).toContain(domain);
        }
      });

      it('includes file counts', async () => {
        const result = await client.callTool({ name: 'list_domains', arguments: {} });
        const text = getTextContent(result);
        expect(text).toMatch(/\d+ files/);
      });
    });

    describe('domain_lookup', () => {
      it('resolves assigned files to correct domain', async () => {
        const entries = Object.entries(GROUND_TRUTH[fixture]).filter(([, d]) => d !== null);
        for (const [file, expectedDomain] of entries) {
          const result = await client.callTool({
            name: 'domain_lookup',
            arguments: { file_path: file },
          });
          const text = getTextContent(result);
          expect(text, `${file} should resolve to ${expectedDomain}`).toContain(`**${expectedDomain}**`);
        }
      });

      it('returns not-assigned for unassigned files', async () => {
        const unassigned = Object.entries(GROUND_TRUTH[fixture])
          .filter(([, d]) => d === null)
          .map(([f]) => f);

        for (const file of unassigned) {
          const result = await client.callTool({
            name: 'domain_lookup',
            arguments: { file_path: file },
          });
          const text = getTextContent(result);
          expect(text, `${file} should be unassigned`).toContain('not assigned');
        }
      });

      it('returns not-assigned for unknown files', async () => {
        const result = await client.callTool({
          name: 'domain_lookup',
          arguments: { file_path: 'totally/unknown/file.ts' },
        });
        expect(getTextContent(result)).toContain('not assigned');
      });
    });

    describe('domain_context', () => {
      it('returns agent content for each domain', async () => {
        const domains = [...new Set(
          Object.values(GROUND_TRUTH[fixture]).filter((d): d is string => d !== null),
        )];

        for (const domain of domains) {
          const result = await client.callTool({
            name: 'domain_context',
            arguments: { domain_name: domain },
          });
          const text = getTextContent(result);
          expect(text, `${domain} should have agent content`).toContain('Agent');
          expect(text).toContain('Interfaces');
        }
      });

      it('returns available domains for unknown domain', async () => {
        const result = await client.callTool({
          name: 'domain_context',
          arguments: { domain_name: 'nonexistent' },
        });
        const text = getTextContent(result);
        expect(text).toContain('not found');
        expect(text).toContain('Available');
      });
    });

    describe('domain_files', () => {
      it('returns correct files for each domain', async () => {
        const domainFiles = new Map<string, string[]>();
        for (const [file, domain] of Object.entries(GROUND_TRUTH[fixture])) {
          if (domain === null) continue;
          if (!domainFiles.has(domain)) domainFiles.set(domain, []);
          domainFiles.get(domain)!.push(file);
        }

        for (const [domain, files] of domainFiles) {
          const result = await client.callTool({
            name: 'domain_files',
            arguments: { domain_name: domain },
          });
          const text = getTextContent(result);
          expect(text).toContain(domain);
          for (const file of files) {
            expect(text, `${domain} should list ${file}`).toContain(file);
          }
        }
      });

      it('returns error for unknown domain', async () => {
        const result = await client.callTool({
          name: 'domain_files',
          arguments: { domain_name: 'nonexistent' },
        });
        expect(getTextContent(result)).toContain('not found');
      });
    });
  });
}
