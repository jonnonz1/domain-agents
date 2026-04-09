import { relative, basename } from 'path';
import type { NamingAnalysis, NamingGroup } from '../types.js';
import { findTsFiles, findSrcRoot } from './files.js';

const FRAMEWORK_SUFFIXES = ['controller', 'service', 'model', 'repository', 'routes', 'middleware', 'handler', 'guard', 'pipe', 'interceptor', 'module', 'resolver', 'gateway'];

function extractDomainPrefix(fileName: string): string | null {
  // Remove extension
  const name = fileName.replace(/\.tsx?$/, '');

  // Split on common separators: dots, hyphens
  const parts = name.split(/[.\-]/);
  if (parts.length < 2) return null;

  // If the last part is a known framework suffix, the prefix is the domain
  const lastPart = parts[parts.length - 1];
  if (FRAMEWORK_SUFFIXES.includes(lastPart)) {
    return parts.slice(0, -1).join('-');
  }

  return null;
}

function extractContainsPattern(fileName: string): string | null {
  const name = fileName.replace(/\.tsx?$/, '').toLowerCase();
  // Check if the filename contains a recognizable domain word
  const domainWords = ['auth', 'billing', 'payment', 'email', 'notification', 'user', 'subscription', 'invoice', 'stripe', 'session'];
  for (const word of domainWords) {
    if (name.includes(word) && name !== word) {
      return word;
    }
  }
  return null;
}

export async function analyzeNaming(rootPath: string): Promise<NamingAnalysis> {
  const srcRoot = await findSrcRoot(rootPath);
  const allFiles = await findTsFiles(rootPath);

  const prefixGroups = new Map<string, string[]>();
  const suffixGroups = new Map<string, string[]>();
  const directoryGroups = new Map<string, string[]>();
  const containsGroups = new Map<string, string[]>();

  for (const file of allFiles) {
    const rel = relative(srcRoot, file);
    const name = basename(file);

    // 1. Directory-based grouping
    const parts = rel.split('/');
    if (parts.length > 1) {
      const topDir = parts[0];
      // Use directory name as a potential domain signal
      if (!directoryGroups.has(topDir)) directoryGroups.set(topDir, []);
      directoryGroups.get(topDir)!.push(rel);
    }

    // 2. Prefix-based grouping (e.g., auth.service.ts → "auth")
    const prefix = extractDomainPrefix(name);
    if (prefix) {
      if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
      prefixGroups.get(prefix)!.push(rel);
    }

    // 3. Suffix-based grouping (detect framework patterns)
    const nameNoExt = name.replace(/\.tsx?$/, '');
    const nameParts = nameNoExt.split(/[.\-]/);
    if (nameParts.length >= 2) {
      const suffix = nameParts[nameParts.length - 1];
      if (FRAMEWORK_SUFFIXES.includes(suffix)) {
        if (!suffixGroups.has(suffix)) suffixGroups.set(suffix, []);
        suffixGroups.get(suffix)!.push(rel);
      }
    }

    // 4. Contains-based grouping (e.g., "billing-handler" → "billing")
    const contains = extractContainsPattern(name);
    if (contains) {
      if (!containsGroups.has(contains)) containsGroups.set(contains, []);
      containsGroups.get(contains)!.push(rel);
    }
  }

  const groups: NamingGroup[] = [];

  // Prefix groups (strongest signal for cross-layer domain identification)
  for (const [pattern, files] of prefixGroups) {
    if (files.length >= 2) {
      groups.push({ pattern, files, matchType: 'prefix' });
    }
  }

  // Contains groups (picks up things like billing-handler, stripe-client)
  for (const [pattern, files] of containsGroups) {
    // Only add if not already captured by prefix
    const existingPrefix = groups.find(g => g.pattern === pattern && g.matchType === 'prefix');
    if (!existingPrefix && files.length >= 1) {
      // Merge with prefix group if one exists
      const prefixGroup = groups.find(g => g.pattern === pattern);
      if (prefixGroup) {
        const newFiles = files.filter(f => !prefixGroup.files.includes(f));
        prefixGroup.files.push(...newFiles);
      } else {
        groups.push({ pattern, files, matchType: 'contains' });
      }
    }
  }

  // Directory groups (useful for feature-organized codebases) — merge into existing groups
  for (const [pattern, files] of directoryGroups) {
    if (files.length >= 2) {
      const existing = groups.find(g => g.pattern === pattern);
      if (existing) {
        const newFiles = files.filter(f => !existing.files.includes(f));
        existing.files.push(...newFiles);
      } else {
        groups.push({ pattern, files, matchType: 'directory' });
      }
    }
  }

  // Suffix groups (framework pattern detection)
  for (const [pattern, files] of suffixGroups) {
    if (files.length >= 2) {
      groups.push({ pattern, files, matchType: 'suffix' });
    }
  }

  return { groups };
}
