import type { DomainProposal } from '../types.js';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function commonDirPrefix(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length > 1) {
      dirs.add(parts.slice(0, -1).join('/') + '/');
    }
  }
  return Array.from(dirs).sort();
}

export function generateAgentFile(domain: DomainProposal): string {
  const name = capitalize(domain.name);
  const dirs = commonDirPrefix(domain.files);
  const dirList = dirs.length > 0 ? dirs.map(d => `\`${d}**\``).join(', ') : domain.files.map(f => `\`${f}\``).join(', ');

  const exposedInterfaces = domain.interfaces.filter(i =>
    domain.files.some(f => i.file.includes(f) || f.includes(i.file))
  );
  const consumedDomains = Object.keys(domain.coupling).filter(d => domain.coupling[d] > 0);

  const sections: string[] = [];

  // Title
  sections.push(`# ${name} Agent\n`);

  // Purpose
  sections.push(`## Purpose\n`);
  sections.push(`This domain handles the ${domain.name} area of the system. Review and expand this description to reflect the business context — what problem does this domain solve for end users?\n`);

  // Ownership
  sections.push(`## Ownership\n`);
  sections.push(`- **Files**: ${dirList}`);
  sections.push(`- **File count**: ${domain.files.length} files`);
  sections.push(`- **Discovery confidence**: ${Math.round(domain.confidence * 100)}%\n`);

  // Interfaces
  sections.push(`## Interfaces\n`);
  sections.push(`### Exposed (other domains call these)`);
  if (exposedInterfaces.length > 0) {
    for (const iface of exposedInterfaces) {
      sections.push(`- \`${iface.file}\`: ${iface.exports.map(e => `\`${e}\``).join(', ')}`);
      sections.push(`  - Consumed by: ${iface.consumers.join(', ')}`);
    }
  } else {
    sections.push(`- None detected — this domain may be a leaf or consumer-only`);
  }
  sections.push('');
  sections.push(`### Consumed (this domain calls these)`);
  if (consumedDomains.length > 0) {
    for (const dep of consumedDomains) {
      sections.push(`- **${dep}** (coupling score: ${domain.coupling[dep].toFixed(2)})`);
    }
  } else {
    sections.push(`- None detected`);
  }
  sections.push('');

  // Scaling Stage
  sections.push(`## Scaling Stage\n`);
  sections.push(`**Current: Inline (synchronous)**\n`);
  sections.push(`All operations execute synchronously in the request path.\n`);
  sections.push(`### Evolution Path`);
  sections.push(`- **Inline** (current) → **Async** (fire-and-forget via event loop)`);
  sections.push(`- **Async** → **Queued** (BullMQ, SQS, or similar — adds retry, persistence, backpressure)`);
  sections.push(`- **Queued** → **Separate Service** (own deployment, own database, same interface)`);
  sections.push(`- **Separate Service** → **Distributed** (own infrastructure, independent scaling)\n`);
  sections.push(`> The interface contract stays stable across all stages. Only the implementation behind it changes.\n`);

  // Technical Debt
  sections.push(`## Technical Debt\n`);
  sections.push(`Track known issues, shortcuts, and architectural risks. Tech debt here informs decisions when features touch this domain.\n`);
  sections.push(`- [ ] Review and document interface contracts — are they clean enough to swap implementations?`);
  sections.push(`- [ ] Identify provider coupling — are external services abstracted behind interfaces?`);
  sections.push(`- [ ] Error handling coverage — are failure modes documented and handled?\n`);

  // Observability
  sections.push(`## Observability\n`);
  sections.push(`> Data-driven decisions are the foundation of evolutionary architecture. This domain should actively gather metrics, logs, and traces to build the case for when and how to evolve.\n`);
  sections.push(`### Current Metrics`);
  sections.push(`- Define key metrics for this domain (counters, histograms, gauges)`);
  sections.push(`- Instrument all public interface methods\n`);
  sections.push(`### Gaps`);
  sections.push(`- [ ] Identify what data is missing to make scaling decisions`);
  sections.push(`- [ ] Add instrumentation for critical code paths`);
  sections.push(`- [ ] Track usage patterns to inform evolution timing\n`);
  sections.push(`### Scaling Triggers`);
  sections.push(`- Define metric thresholds that signal it's time to evolve`);
  sections.push(`- Example: \`${domain.name}.request.count > X/min\` → introduce queue`);
  sections.push(`- Example: \`${domain.name}.error.rate > Y%\` → add retry logic\n`);

  // Domain Rules
  sections.push(`## Domain Rules\n`);
  sections.push(`- All access to ${domain.name} functionality MUST go through the defined interfaces`);
  sections.push(`- New code paths require observability instrumentation before shipping`);
  sections.push(`- Interface changes must be backwards-compatible or coordinated with consumers`);
  if (consumedDomains.length > 0) {
    sections.push(`- Changes affecting ${consumedDomains.join(', ')} require cross-domain review`);
  }
  sections.push('');

  // Context for AI Agents
  sections.push(`## Context for AI Agents\n`);
  sections.push(`When working in this domain:`);
  sections.push(`- **Check tech debt** before implementing features — existing debt may affect your approach`);
  sections.push(`- **Instrument new code** with metrics and structured logging`);
  sections.push(`- **Preserve interface contracts** — implementation can change freely, but signatures and behavior contracts must remain stable`);
  sections.push(`- **Gather data** to support scaling decisions — every new feature is an opportunity to add observability`);
  sections.push(`- **Consider the evolution path** — is this implementation easy to replace when the domain scales?`);
  if (consumedDomains.length > 0) {
    sections.push(`- **Cross-domain awareness**: this domain depends on ${consumedDomains.join(', ')} — changes there may affect this domain`);
  }
  sections.push('');

  return sections.join('\n');
}
