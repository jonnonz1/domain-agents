import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { buildImportGraph } from '../discovery/imports.js';
import { analyzeStructure } from '../discovery/structure.js';
import type { DiscoveryResult } from '../types.js';

export interface DomainHealth {
  name: string;
  status: 'healthy' | 'warning' | 'stale';
  fileCount: number;
  newFiles: string[];
  removedFiles: string[];
}

export interface CouplingIssue {
  domainA: string;
  domainB: string;
  score: number;
  message: string;
}

export interface BoundaryViolation {
  file: string;
  importedFile: string;
  fromDomain: string;
  toDomain: string;
}

export interface HealthReport {
  domains: DomainHealth[];
  couplingIssues: CouplingIssue[];
  boundaryViolations: BoundaryViolation[];
  recommendations: string[];
}

export async function runHealth(rootPath: string): Promise<HealthReport> {
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

  // Re-analyze the current state of the codebase
  const [graph, structure] = await Promise.all([
    buildImportGraph(rootPath),
    analyzeStructure(rootPath),
  ]);

  const currentFiles = new Set(graph.nodes.map(n => n.relativePath));

  // Build domain → files mapping from proposal
  const domainFileMap = new Map<string, Set<string>>();
  const fileDomainMap = new Map<string, string>();
  for (const domain of proposal.domains) {
    domainFileMap.set(domain.name, new Set(domain.files));
    for (const file of domain.files) {
      fileDomainMap.set(file, domain.name);
    }
  }

  // Check each domain's health
  const domains: DomainHealth[] = [];
  const recommendations: string[] = [];

  for (const domain of proposal.domains) {
    const proposalFiles = new Set(domain.files);

    // Find new files that might belong to this domain but aren't tracked
    const newFiles: string[] = [];
    const removedFiles: string[] = [];

    // Check which proposal files still exist
    for (const file of proposalFiles) {
      if (!currentFiles.has(file)) {
        removedFiles.push(file);
      }
    }

    // Check for new files in the same directories as domain files
    const domainDirs = new Set<string>();
    for (const file of domain.files) {
      const parts = file.split('/');
      if (parts.length > 1) {
        domainDirs.add(parts[0]);
      }
    }

    for (const file of currentFiles) {
      if (fileDomainMap.has(file)) continue; // already assigned
      if (proposal.unassigned.includes(file)) continue;

      const parts = file.split('/');
      if (parts.length > 1 && domainDirs.has(parts[0])) {
        // New file in a directory owned by this domain
        newFiles.push(file);
      }
    }

    let status: DomainHealth['status'] = 'healthy';
    if (removedFiles.length > 0 || newFiles.length > 0) {
      status = newFiles.length > 2 || removedFiles.length > 0 ? 'stale' : 'warning';
    }

    if (newFiles.length > 0) {
      recommendations.push(
        `${domain.name}: ${newFiles.length} new file(s) not covered by agent — run 'domain-agents discover' to update`,
      );
    }

    domains.push({
      name: domain.name,
      status,
      fileCount: domain.files.length,
      newFiles,
      removedFiles,
    });
  }

  // Check coupling issues
  const couplingIssues: CouplingIssue[] = [];
  for (const domain of proposal.domains) {
    for (const [otherDomain, score] of Object.entries(domain.coupling)) {
      if (score > 0.3) {
        couplingIssues.push({
          domainA: domain.name,
          domainB: otherDomain,
          score,
          message: `High coupling (${(score * 100).toFixed(0)}%) between ${domain.name} and ${otherDomain}`,
        });
      }
    }
  }

  if (couplingIssues.length > 0) {
    recommendations.push(
      `${couplingIssues.length} high-coupling pair(s) detected — consider extracting shared types to interface contracts`,
    );
  }

  // Check boundary violations (cross-domain imports that don't go through interfaces)
  const boundaryViolations: BoundaryViolation[] = [];
  const interfaceFiles = new Set<string>();
  for (const domain of proposal.domains) {
    for (const iface of domain.interfaces) {
      interfaceFiles.add(iface.file);
    }
  }

  for (const edge of graph.edges) {
    const fromRel = graph.nodes.find(n => n.path === edge.from)?.relativePath;
    const toRel = graph.nodes.find(n => n.path === edge.to)?.relativePath;
    if (!fromRel || !toRel) continue;

    const fromDomain = fileDomainMap.get(fromRel);
    const toDomain = fileDomainMap.get(toRel);
    if (!fromDomain || !toDomain || fromDomain === toDomain) continue;

    // Cross-domain import — check if it goes through a known interface
    const isViaInterface = interfaceFiles.has(toRel) || interfaceFiles.has('src/' + toRel);
    if (!isViaInterface) {
      boundaryViolations.push({
        file: fromRel,
        importedFile: toRel,
        fromDomain,
        toDomain,
      });
    }
  }

  if (boundaryViolations.length > 0) {
    recommendations.push(
      `${boundaryViolations.length} cross-domain import(s) bypass defined interfaces — consider routing through interface contracts`,
    );
  }

  return { domains, couplingIssues, boundaryViolations, recommendations };
}
