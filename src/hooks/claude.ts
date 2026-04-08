import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createLookup } from './lookup.js';
import { generateAgentFile } from '../generator/agent-file.js';
import type { DomainProposal } from '../types.js';

export interface ClaudeHooksResult {
  claudeMdFiles: string[];
}

export async function installClaudeHooks(rootPath: string): Promise<ClaudeHooksResult> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  const proposalData = await readFile(proposalPath, 'utf-8');
  const proposal = JSON.parse(proposalData) as {
    rootPath: string;
    domains: DomainProposal[];
    unassigned: string[];
  };

  const lookup = await createLookup(rootPath);
  const claudeMdFiles: string[] = [];

  // Determine if this is feature-organized (domains have own directories)
  // or layer-organized (domains span directories)
  const featureDomains: DomainProposal[] = [];
  const crossLayerDomains: DomainProposal[] = [];

  for (const domain of proposal.domains) {
    const hasOwnDir = domain.files.some(f => {
      const parts = f.split('/');
      return parts.length > 1 && (parts[0] === domain.name || parts[0] === domain.name + 's');
    });

    if (hasOwnDir) {
      featureDomains.push(domain);
    } else {
      crossLayerDomains.push(domain);
    }
  }

  // Generate per-directory CLAUDE.md for feature-organized domains
  for (const domain of featureDomains) {
    const dirName = domain.files[0].split('/')[0];
    const dirPath = join(rootPath, 'src', dirName);
    const claudeMdPath = join(dirPath, 'CLAUDE.md');

    const content = generateAgentFile(domain);
    await writeFile(claudeMdPath, content, 'utf-8');
    claudeMdFiles.push(claudeMdPath);
  }

  // For cross-layer domains, generate a single CLAUDE.md at src/ root
  // that maps files to domains
  if (crossLayerDomains.length > 0) {
    const srcClaude = join(rootPath, 'src', 'CLAUDE.md');
    const content = generateCrossLayerClaudeMd(crossLayerDomains);
    await mkdir(join(rootPath, 'src'), { recursive: true });
    await writeFile(srcClaude, content, 'utf-8');
    claudeMdFiles.push(srcClaude);
  }

  return { claudeMdFiles };
}

function generateCrossLayerClaudeMd(domains: DomainProposal[]): string {
  const sections: string[] = [];

  sections.push(`# Domain Agent Context\n`);
  sections.push(`This codebase is organized by technical layers. Business domains span across directories.\n`);

  sections.push(`## File-to-Domain Mapping\n`);
  sections.push(`When working on a file, find its domain below to understand the relevant context.\n`);

  for (const domain of domains) {
    const name = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    sections.push(`### ${name} Domain\n`);
    sections.push(`**Files:**`);
    for (const file of domain.files) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');

    // Include key context inline
    if (domain.interfaces.length > 0) {
      sections.push(`**Interfaces:**`);
      for (const iface of domain.interfaces) {
        sections.push(`- \`${iface.file}\`: ${iface.exports.join(', ')} (consumers: ${iface.consumers.join(', ')})`);
      }
      sections.push('');
    }

    const deps = Object.entries(domain.coupling).filter(([, v]) => v > 0);
    if (deps.length > 0) {
      sections.push(`**Dependencies:** ${deps.map(([d, v]) => `${d} (${(v * 100).toFixed(0)}%)`).join(', ')}`);
      sections.push('');
    }

    sections.push(`**Rules:**`);
    sections.push(`- Check tech debt before implementing features in this domain`);
    sections.push(`- Instrument new code with metrics and structured logging`);
    sections.push(`- Preserve interface contracts — signatures must remain stable`);
    sections.push(`- Gather observability data to support scaling decisions\n`);
  }

  sections.push(`---\n`);
  sections.push(`> See \`agents/<domain>.md\` for full domain context including evolution path and scaling triggers.`);

  return sections.join('\n');
}
