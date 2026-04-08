import { readFile } from 'fs/promises';
import { join, relative, isAbsolute } from 'path';
import { generateAgentFile } from '../generator/agent-file.js';
import type { DiscoveryResult, DomainProposal } from '../types.js';

export interface DomainLookup {
  getDomain(filePath: string): string | null;
  getAgentContext(domainName: string): string | null;
  getContextForFile(filePath: string): string | null;
  listDomains(): string[];
  getGlobPatterns(domainName: string): string[] | null;
}

export async function createLookup(rootPath: string): Promise<DomainLookup> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  const proposalData = await readFile(proposalPath, 'utf-8');
  const proposal = JSON.parse(proposalData) as {
    rootPath: string;
    domains: DomainProposal[];
    unassigned: string[];
  };

  // Build file → domain map
  const fileDomainMap = new Map<string, string>();
  for (const domain of proposal.domains) {
    for (const file of domain.files) {
      fileDomainMap.set(file, domain.name);
      // Also store with src/ prefix for absolute path resolution
      fileDomainMap.set('src/' + file, domain.name);
    }
  }

  // Build domain → proposal map
  const domainMap = new Map<string, DomainProposal>();
  for (const domain of proposal.domains) {
    domainMap.set(domain.name, domain);
  }

  // Cache generated agent content
  const agentContentCache = new Map<string, string>();

  function normalizePath(filePath: string): string {
    if (isAbsolute(filePath)) {
      return relative(rootPath, filePath);
    }
    return filePath;
  }

  function getDomain(filePath: string): string | null {
    const normalized = normalizePath(filePath);
    // Try exact match
    if (fileDomainMap.has(normalized)) return fileDomainMap.get(normalized)!;
    // Try stripping src/ prefix
    const withoutSrc = normalized.replace(/^src\//, '');
    if (fileDomainMap.has(withoutSrc)) return fileDomainMap.get(withoutSrc)!;
    return null;
  }

  function getAgentContext(domainName: string): string | null {
    const domain = domainMap.get(domainName);
    if (!domain) return null;

    if (!agentContentCache.has(domainName)) {
      agentContentCache.set(domainName, generateAgentFile(domain));
    }
    return agentContentCache.get(domainName)!;
  }

  function getContextForFile(filePath: string): string | null {
    const domain = getDomain(filePath);
    if (!domain) return null;
    return getAgentContext(domain);
  }

  function listDomains(): string[] {
    return proposal.domains.map(d => d.name);
  }

  function getGlobPatterns(domainName: string): string[] | null {
    const domain = domainMap.get(domainName);
    if (!domain) return null;

    // Extract unique directory prefixes from the domain's files
    const dirPrefixes = new Set<string>();
    const filePatterns = new Set<string>();

    for (const file of domain.files) {
      const parts = file.split('/');
      if (parts.length > 1) {
        dirPrefixes.add(parts[0]);
      }
      // Extract the naming prefix for cross-layer matching
      const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '');
      const nameParts = fileName.split(/[.\-]/);
      if (nameParts[0] === domainName || nameParts[0] === domainName.replace(/s$/, '')) {
        // e.g., auth.controller, auth.service → pattern **/auth.*
        filePatterns.add(`**/${domainName}.*`);
        filePatterns.add(`**/${domainName}-*`);
      }
    }

    const patterns: string[] = [];

    // Directory-based patterns (for feature-organized)
    for (const dir of dirPrefixes) {
      if (dir === domainName || dir === domainName + 's') {
        patterns.push(`src/${dir}/**`);
      }
    }

    // File-name based patterns (for layer-organized / mixed)
    for (const pattern of filePatterns) {
      patterns.push(pattern);
    }

    // If no patterns yet, use explicit file list
    if (patterns.length === 0) {
      for (const file of domain.files) {
        patterns.push(`src/${file}`);
      }
    }

    return patterns;
  }

  return { getDomain, getAgentContext, getContextForFile, listDomains, getGlobPatterns };
}
