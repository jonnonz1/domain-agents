import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { generateAgentFile } from '../generator/agent-file.js';
import { generateAgentsMd } from '../generator/agents-md.js';
import { enrichDomain, generateEnrichedAgentFile, createClient } from '../generator/enrich.js';
import type { DiscoveryResult } from '../types.js';

export interface InitResult {
  agentsMdPath: string;
  agentFiles: string[];
}

export async function runInit(rootPath: string, options: { enrich?: boolean } = {}): Promise<InitResult> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');

  let proposalData: string;
  try {
    proposalData = await readFile(proposalPath, 'utf-8');
  } catch {
    throw new Error(
      `No proposal found at ${proposalPath}. Run 'domain-agents discover' first.`,
    );
  }

  const proposal = JSON.parse(proposalData) as {
    rootPath: string;
    domains: DiscoveryResult['domains'];
    unassigned: string[];
  };

  // Build a DiscoveryResult from the proposal (files/edges not stored — use empty)
  const result: DiscoveryResult = {
    rootPath: proposal.rootPath,
    files: [],
    edges: [],
    domains: proposal.domains,
    unassigned: proposal.unassigned,
  };

  // Generate agents/ directory
  const agentsDir = join(rootPath, 'agents');
  await mkdir(agentsDir, { recursive: true });

  // Generate individual agent files
  const agentFiles: string[] = [];
  const client = options.enrich ? createClient() : null;

  for (const domain of proposal.domains) {
    let content: string;

    if (client) {
      try {
        process.stdout.write(`  Enriching ${domain.name}...`);
        const enriched = await enrichDomain(client, domain, rootPath);
        content = generateEnrichedAgentFile(domain, enriched);
        process.stdout.write(` done\n`);
      } catch (err) {
        process.stdout.write(` failed (${(err as Error).message}), using static template\n`);
        content = generateAgentFile(domain);
      }
    } else {
      content = generateAgentFile(domain);
    }

    const filePath = join(agentsDir, `${domain.name}.md`);
    await writeFile(filePath, content, 'utf-8');
    agentFiles.push(filePath);
  }

  // Generate AGENTS.md
  const agentsMdContent = generateAgentsMd(result);
  const agentsMdPath = join(rootPath, 'AGENTS.md');
  await writeFile(agentsMdPath, agentsMdContent, 'utf-8');

  return { agentsMdPath, agentFiles };
}
