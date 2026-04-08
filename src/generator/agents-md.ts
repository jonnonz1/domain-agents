import type { DiscoveryResult } from '../types.js';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generateAgentsMd(result: DiscoveryResult): string {
  const sections: string[] = [];

  // Title
  sections.push(`# System Agents Map\n`);

  // Overview
  sections.push(`## Overview\n`);
  sections.push(`This document maps the business domains of the system, their ownership, and how they relate to each other. Each domain has a dedicated agent file with detailed context, interfaces, tech debt, and observability specifications.\n`);
  sections.push(`> Evolutionary architecture principle: domains communicate through stable interfaces. Implementations evolve independently. Observability data drives scaling decisions. Tech debt from each domain informs feature development across the system.\n`);

  // Domain table
  sections.push(`## Domains\n`);
  sections.push(`| Domain | Agent File | Files | Scaling Stage | Confidence |`);
  sections.push(`|--------|-----------|-------|---------------|------------|`);
  for (const domain of result.domains) {
    const link = `[agents/${domain.name}.md](agents/${domain.name}.md)`;
    const confidence = `${Math.round(domain.confidence * 100)}%`;
    sections.push(`| ${capitalize(domain.name)} | ${link} | ${domain.files.length} | Inline | ${confidence} |`);
  }
  sections.push('');

  // Dependency graph
  sections.push(`## Domain Dependency Graph\n`);
  sections.push('```');
  const edges: string[] = [];
  for (const domain of result.domains) {
    for (const [dep, score] of Object.entries(domain.coupling)) {
      if (score > 0) {
        edges.push(`${domain.name} --> ${dep} (${score.toFixed(2)})`);
      }
    }
  }
  if (edges.length > 0) {
    for (const edge of edges) {
      sections.push(edge);
    }
  } else {
    sections.push('No cross-domain dependencies detected.');
  }
  sections.push('```\n');

  // Cross-domain contracts
  sections.push(`## Cross-Domain Contracts\n`);
  sections.push(`Interface points where domains communicate. Changes to these require coordination.\n`);

  const allInterfaces = result.domains.flatMap(d => d.interfaces);
  const uniqueInterfaces = new Map<string, typeof allInterfaces[0]>();
  for (const iface of allInterfaces) {
    if (!uniqueInterfaces.has(iface.file)) {
      uniqueInterfaces.set(iface.file, iface);
    }
  }

  if (uniqueInterfaces.size > 0) {
    for (const [, iface] of uniqueInterfaces) {
      sections.push(`### \`${iface.file}\``);
      sections.push(`- **Exports**: ${iface.exports.map(e => `\`${e}\``).join(', ')}`);
      sections.push(`- **Consumers**: ${iface.consumers.join(', ')}`);
      sections.push('');
    }
  } else {
    sections.push(`No cross-domain interfaces detected yet. As the system grows, document interface contracts here.\n`);
  }

  // Global architecture rules
  sections.push(`## Global Architecture Rules\n`);
  sections.push(`1. Domains communicate ONLY through defined interfaces — no reaching into another domain's internals`);
  sections.push(`2. Each domain instruments its public interface methods with metrics and structured logging`);
  sections.push(`3. Tech debt in one domain that affects another must be surfaced in both agent files`);
  sections.push(`4. Interface changes require coordination with all consumer domains`);
  sections.push(`5. New features must include observability instrumentation — data-driven decisions require data`);
  sections.push(`6. Scaling decisions are driven by observability data, not speculation`);
  sections.push(`7. When a feature spans multiple domains, consult each domain's tech debt register for consensus\n`);

  // Unassigned files
  if (result.unassigned.length > 0) {
    sections.push(`## Unassigned Files\n`);
    sections.push(`These files were not assigned to any domain. They may be shared utilities, entry points, or candidates for future domain assignment.\n`);
    for (const file of result.unassigned) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');
  }

  return sections.join('\n');
}
