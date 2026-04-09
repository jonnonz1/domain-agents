import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DomainProposal } from '../types.js';

interface Proposal {
  rootPath: string;
  domains: DomainProposal[];
  unassigned: string[];
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

function bar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `${COLORS.green}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset}`;
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return COLORS.green;
  if (c >= 0.7) return COLORS.yellow;
  return COLORS.red;
}

function signalBadge(type: string): string {
  const badges: Record<string, string> = {
    directory: `${COLORS.blue}dir${COLORS.reset}`,
    imports: `${COLORS.cyan}imp${COLORS.reset}`,
    naming: `${COLORS.magenta}nam${COLORS.reset}`,
    dependency: `${COLORS.yellow}dep${COLORS.reset}`,
    framework: `${COLORS.green}frm${COLORS.reset}`,
  };
  return badges[type] || type;
}

export async function runShow(rootPath: string, options: { files?: boolean; coupling?: boolean }) {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  let raw: string;
  try {
    raw = await readFile(proposalPath, 'utf-8');
  } catch {
    throw new Error(`No proposal found at ${proposalPath}\nRun 'domain-agents discover' first.`);
  }

  const proposal: Proposal = JSON.parse(raw);
  const domains = proposal.domains;
  const totalFiles = domains.reduce((sum, d) => sum + d.files.length, 0) + proposal.unassigned.length;

  // Header
  console.log();
  console.log(`${COLORS.bold}  Domain Proposal${COLORS.reset}  ${COLORS.dim}${proposal.rootPath}${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${'─'.repeat(60)}${COLORS.reset}`);
  console.log(`  ${COLORS.bold}${domains.length}${COLORS.reset} domains  ${COLORS.bold}${totalFiles}${COLORS.reset} files  ${COLORS.bold}${proposal.unassigned.length}${COLORS.reset} unassigned`);
  console.log();

  // Sort by file count descending
  const sorted = [...domains].sort((a, b) => b.files.length - a.files.length);
  const maxFiles = sorted[0]?.files.length || 1;
  const maxNameLen = Math.max(...sorted.map(d => d.name.length), 10);

  // Domain table
  console.log(`  ${COLORS.bold}${'Domain'.padEnd(maxNameLen)}  Files  Confidence  Signals       Distribution${COLORS.reset}`);
  console.log(`  ${COLORS.dim}${'─'.repeat(maxNameLen + 58)}${COLORS.reset}`);

  for (const domain of sorted) {
    const name = domain.name.padEnd(maxNameLen);
    const files = String(domain.files.length).padStart(5);
    const conf = Math.round(domain.confidence * 100);
    const confStr = `${confidenceColor(domain.confidence)}${String(conf).padStart(3)}%${COLORS.reset}`;
    const signals = [...new Set(domain.signals.map(s => s.type))].map(signalBadge).join(' ');
    const ratio = domain.files.length / maxFiles;
    const visualization = bar(ratio, 20);

    console.log(`  ${COLORS.bold}${name}${COLORS.reset}  ${files}  ${confStr}        ${signals.padEnd(30)}${visualization}`);

    if (options.files) {
      for (const file of domain.files) {
        console.log(`  ${' '.repeat(maxNameLen)}  ${COLORS.dim}  └ ${file}${COLORS.reset}`);
      }
    }
  }

  if (proposal.unassigned.length > 0) {
    console.log(`  ${COLORS.dim}${'─'.repeat(maxNameLen + 58)}${COLORS.reset}`);
    console.log(`  ${COLORS.yellow}${'unassigned'.padEnd(maxNameLen)}${COLORS.reset}  ${String(proposal.unassigned.length).padStart(5)}  ${COLORS.dim} --        --${COLORS.reset}`);
    if (options.files) {
      for (const file of proposal.unassigned) {
        console.log(`  ${' '.repeat(maxNameLen)}  ${COLORS.dim}  └ ${file}${COLORS.reset}`);
      }
    }
  }

  // Coupling section
  const coupledPairs: { a: string; b: string; score: number }[] = [];
  for (const domain of domains) {
    for (const [other, score] of Object.entries(domain.coupling)) {
      if (score > 0 && domain.name < other) {
        coupledPairs.push({ a: domain.name, b: other, score });
      }
    }
  }

  if (coupledPairs.length > 0 && options.coupling) {
    coupledPairs.sort((a, b) => b.score - a.score);
    console.log();
    console.log(`  ${COLORS.bold}Coupling${COLORS.reset}`);
    console.log(`  ${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
    for (const pair of coupledPairs.slice(0, 20)) {
      const pct = Math.round(pair.score * 100);
      const color = pct > 50 ? COLORS.red : pct > 20 ? COLORS.yellow : COLORS.dim;
      console.log(`  ${pair.a} ${COLORS.dim}↔${COLORS.reset} ${pair.b}  ${color}${pct}%${COLORS.reset}  ${bar(pair.score, 15)}`);
    }
    if (coupledPairs.length > 20) {
      console.log(`  ${COLORS.dim}... and ${coupledPairs.length - 20} more${COLORS.reset}`);
    }
  }

  // Interfaces section
  const domainsWithInterfaces = domains.filter(d => d.interfaces.length > 0);
  if (domainsWithInterfaces.length > 0) {
    console.log();
    console.log(`  ${COLORS.bold}Interfaces${COLORS.reset}  ${COLORS.dim}(cross-domain boundary points)${COLORS.reset}`);
    console.log(`  ${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
    for (const domain of domainsWithInterfaces) {
      for (const iface of domain.interfaces) {
        const consumers = iface.consumers.join(', ');
        console.log(`  ${COLORS.cyan}${domain.name}${COLORS.reset} → ${COLORS.dim}${iface.file}${COLORS.reset}`);
        console.log(`    exports: ${iface.exports.join(', ')}`);
        console.log(`    ${COLORS.dim}used by: ${consumers}${COLORS.reset}`);
      }
    }
  }

  console.log();
}
