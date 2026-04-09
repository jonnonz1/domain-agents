#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join, isAbsolute, relative } from 'path';
import type { DomainProposal } from '../types.js';

interface ProposalData {
  rootPath: string;
  domains: DomainProposal[];
  unassigned: string[];
}

async function loadProposal(rootPath: string): Promise<ProposalData> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  const data = await readFile(proposalPath, 'utf-8');
  return JSON.parse(data);
}

async function loadAgentFile(rootPath: string, domainName: string): Promise<string | null> {
  try {
    return await readFile(join(rootPath, 'agents', `${domainName}.md`), 'utf-8');
  } catch {
    return null;
  }
}

function startServer(rootPath: string) {
  const server = new McpServer({
    name: 'domain-agents',
    version: '0.1.0',
  });

  let proposal: ProposalData | null = null;
  let fileDomainMap: Map<string, string> | null = null;

  async function ensureLoaded() {
    if (!proposal) {
      proposal = await loadProposal(rootPath);
      fileDomainMap = new Map();
      for (const domain of proposal.domains) {
        for (const file of domain.files) {
          fileDomainMap.set(file, domain.name);
        }
      }
    }
    return { proposal: proposal!, fileDomainMap: fileDomainMap! };
  }

  server.tool(
    'domain_lookup',
    'Look up which domain a file belongs to and get its full context. Use this when working on a file to understand which business domain it belongs to, what the domain rules are, and what other files are related.',
    { file_path: z.string().describe('Absolute or relative file path to look up') },
    async ({ file_path }) => {
      const { proposal, fileDomainMap } = await ensureLoaded();

      // Normalize path to relative
      let normalized = file_path;
      if (isAbsolute(file_path)) {
        normalized = relative(rootPath, file_path);
      }
      // Strip src/ prefix if present
      normalized = normalized.replace(/^src\//, '');

      const domainName = fileDomainMap.get(normalized);
      if (!domainName) {
        return {
          content: [{
            type: 'text' as const,
            text: `File "${normalized}" is not assigned to any domain. It may be a shared utility or config file.`,
          }],
        };
      }

      const agentContent = await loadAgentFile(rootPath, domainName);
      if (agentContent) {
        return {
          content: [{
            type: 'text' as const,
            text: `File "${normalized}" belongs to the **${domainName}** domain.\n\n${agentContent}`,
          }],
        };
      }

      const domain = proposal.domains.find(d => d.name === domainName);
      return {
        content: [{
          type: 'text' as const,
          text: `File "${normalized}" belongs to the **${domainName}** domain (${domain?.files.length ?? 0} files, ${Math.round((domain?.confidence ?? 0) * 100)}% confidence).`,
        }],
      };
    },
  );

  server.tool(
    'list_domains',
    'List all discovered business domains in the codebase with their file counts and confidence scores.',
    {},
    async () => {
      const { proposal } = await ensureLoaded();

      const lines = proposal.domains.map(d =>
        `- **${d.name}** — ${d.files.length} files, ${Math.round(d.confidence * 100)}% confidence`
      );

      return {
        content: [{
          type: 'text' as const,
          text: `# Business Domains (${proposal.domains.length} total)\n\n${lines.join('\n')}\n\nUnassigned: ${proposal.unassigned.length} files`,
        }],
      };
    },
  );

  server.tool(
    'domain_context',
    'Get the full agent file for a specific domain, including purpose, interfaces, tech debt, domain rules, scaling stage, and observability.',
    { domain_name: z.string().describe('Name of the domain (e.g., "journals", "bank-accounts", "auth")') },
    async ({ domain_name }) => {
      const { proposal } = await ensureLoaded();

      const agentContent = await loadAgentFile(rootPath, domain_name);
      if (agentContent) {
        return { content: [{ type: 'text' as const, text: agentContent }] };
      }

      const domain = proposal.domains.find(d => d.name === domain_name);
      if (!domain) {
        const available = proposal.domains.map(d => d.name).join(', ');
        return {
          content: [{
            type: 'text' as const,
            text: `Domain "${domain_name}" not found. Available domains: ${available}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Domain "${domain_name}" found (${domain.files.length} files) but no agent file generated yet. Run "domain-agents init" to generate agent files.`,
        }],
      };
    },
  );

  server.tool(
    'domain_files',
    'List all files belonging to a specific domain.',
    { domain_name: z.string().describe('Name of the domain') },
    async ({ domain_name }) => {
      const { proposal } = await ensureLoaded();
      const domain = proposal.domains.find(d => d.name === domain_name);

      if (!domain) {
        return {
          content: [{
            type: 'text' as const,
            text: `Domain "${domain_name}" not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `# ${domain_name} (${domain.files.length} files)\n\n${domain.files.map(f => `- ${f}`).join('\n')}`,
        }],
      };
    },
  );

  return server;
}

// Main: resolve root path from args, support --list-domains for hook usage
const args = process.argv.slice(2);
const listDomainsFlag = args.includes('--list-domains');
const rootPath = args.find(a => !a.startsWith('--')) || process.cwd();

if (listDomainsFlag) {
  // CLI mode: print domain summary to stdout for SessionStart hooks
  loadProposal(rootPath).then(proposal => {
    console.log(`This codebase has ${proposal.domains.length} business domains. Use the domain-agents MCP tools (domain_lookup, domain_context, domain_files, list_domains) to get domain context before making changes.`);
    console.log('');
    console.log('Top domains:');
    for (const d of proposal.domains.slice(0, 15)) {
      console.log(`  ${d.name.padEnd(22)} ${String(d.files.length).padStart(3)} files  ${Math.round(d.confidence * 100)}% confidence`);
    }
    if (proposal.domains.length > 15) {
      console.log(`  ... and ${proposal.domains.length - 15} more`);
    }
  }).catch(() => {
    // No proposal yet — silently skip
  });
} else {
  // MCP server mode
  const server = startServer(rootPath);
  const transport = new StdioServerTransport();
  server.connect(transport);
}
