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

    const dirPrefixes = new Set<string>();
    const filePatterns = new Set<string>();
    const singular = domainName.replace(/s$/, '');

    for (const file of domain.files) {
      const parts = file.split('/');
      if (parts.length > 1) {
        dirPrefixes.add(parts[0]);
      }
      const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '');
      const nameParts = fileName.split(/[.\-]/);
      if (nameParts[0] === domainName || nameParts[0] === singular) {
        filePatterns.add(`**/${domainName}.*`);
        filePatterns.add(`**/${domainName}-*`);
        if (singular !== domainName) {
          filePatterns.add(`**/${singular}.*`);
          filePatterns.add(`**/${singular}-*`);
        }
      }
    }

    const patterns: string[] = [];

    for (const dir of dirPrefixes) {
      if (dir === domainName || dir === domainName + 's' || dir === singular) {
        patterns.push(`src/${dir}/**`);
      }
    }

    for (const pattern of filePatterns) {
      patterns.push(pattern);
    }

    // Add explicit paths for files not covered by directory or naming patterns
    for (const file of domain.files) {
      const prefixed = `src/${file}`;
      const covered = patterns.some(p => {
        if (p.endsWith('/**')) {
          return prefixed.startsWith(p.slice(0, -2));
        }
        if (p.startsWith('**/')) {
          const baseName = file.split('/').pop() ?? '';
          const suffix = p.slice(3);
          if (suffix.endsWith('*')) {
            return baseName.startsWith(suffix.slice(0, -1));
          }
          if (suffix.includes('.*')) {
            const prefix = suffix.split('.*')[0];
            return baseName.split(/[.\-]/)[0] === prefix;
          }
        }
        return prefixed === p;
      });
      if (!covered) {
        patterns.push(prefixed);
      }
    }

    return patterns;
  }

  return { getDomain, getAgentContext, getContextForFile, listDomains, getGlobPatterns };
}
