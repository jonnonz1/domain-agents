import { relative } from 'path';
import type { InterfaceAnalysis, InterfacePoint, CouplingPair, ImportGraph } from '../types.js';

const LAYER_NAMES = new Set([
  'controllers', 'controller',
  'services', 'service',
  'models', 'model',
  'routes', 'route',
  'middleware', 'middlewares',
  'utils', 'util', 'utilities',
  'helpers', 'helper',
  'lib', 'libs',
  'api',
  'views', 'view',
  'dtos', 'dto',
  'schemas', 'schema',
  'validators', 'validation',
]);

/**
 * Assign a domain name to a file based on its path and name.
 * Uses deeper path analysis to find the most meaningful domain segment,
 * rather than stopping at the top-level directory.
 */
function assignDomain(relativePath: string): string {
  const parts = relativePath.split('/');
  const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '');

  // For deeper paths like lib/services/entity/entity.ts or app/(app)/entities/[id]/page.tsx,
  // find the most meaningful directory segment
  if (parts.length >= 3) {
    // Walk past layer/framework dirs to find the domain-meaningful segment
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      // Skip layer names, route group markers like (app), and dynamic segments like [id]
      if (LAYER_NAMES.has(segment)) continue;
      if (segment.startsWith('(') && segment.endsWith(')')) continue;
      if (segment.startsWith('[') && segment.endsWith(']')) continue;
      if (segment === 'src') continue;

      // For top-level dirs that contain deeper structure (app/, lib/),
      // keep walking to find the real domain
      if (i === 0 && parts.length > 3) continue;

      return segment;
    }
  }

  const topDir = parts.length > 1 ? parts[0] : null;

  // If the top-level dir is NOT a layer name, use it as the domain
  if (topDir && !LAYER_NAMES.has(topDir)) {
    return topDir;
  }

  // Top-level dir is a layer name — extract domain from the filename
  const nameParts = fileName.split(/[.\-]/);
  if (nameParts.length >= 2) {
    return nameParts[0];
  }

  return fileName;
}

export async function detectInterfaces(graph: ImportGraph, rootPath: string): Promise<InterfaceAnalysis> {
  // Build domain assignments for all files
  const fileDomains = new Map<string, string>();
  for (const node of graph.nodes) {
    fileDomains.set(node.path, assignDomain(node.relativePath));
  }

  // Find interface points: files imported by files from different domains
  const fileConsumers = new Map<string, Set<string>>(); // file path → set of consumer domains

  for (const edge of graph.edges) {
    const fromDomain = fileDomains.get(edge.from);
    const toDomain = fileDomains.get(edge.to);
    if (!fromDomain || !toDomain) continue;

    // Only count cross-domain imports
    if (fromDomain === toDomain) continue;

    if (!fileConsumers.has(edge.to)) fileConsumers.set(edge.to, new Set());
    fileConsumers.get(edge.to)!.add(fromDomain);
  }

  // Interface points: files consumed by 1+ different domains (any cross-domain import is an interface)
  const interfaces: InterfacePoint[] = [];
  const interfaceFiles = new Set<string>();

  for (const [filePath, consumers] of fileConsumers) {
    if (consumers.size >= 1) {
      const node = graph.nodes.find(n => n.path === filePath);
      const exportNames = node ? node.exports.map(e => e.name) : [];
      interfaces.push({
        file: relative(rootPath, filePath),
        exports: exportNames,
        consumers: Array.from(consumers).sort(),
      });
      interfaceFiles.add(filePath);
    }
  }

  // Also detect files with significant exports that are imported by any other file
  // These are service/model files that act as public APIs for their domain
  for (const node of graph.nodes) {
    if (interfaceFiles.has(node.path)) continue;
    // Must have meaningful exports (functions, classes — not just types)
    const valueExports = node.exports.filter(e => e.kind !== 'type' && e.kind !== 'interface');
    if (valueExports.length < 2) continue;

    // Check if any other file imports from this one
    const importers = graph.edges.filter(e => e.to === node.path && e.from !== node.path);
    if (importers.length < 2) continue;

    // This file is a significant export point — record it as an interface
    const fileDomain = fileDomains.get(node.path);
    const consumerDomains = new Set<string>();
    for (const edge of importers) {
      const fromDomain = fileDomains.get(edge.from);
      if (fromDomain && fromDomain !== fileDomain) {
        consumerDomains.add(fromDomain);
      }
    }
    // Even if all consumers are same domain, it's still a notable export surface
    const consumers = consumerDomains.size > 0
      ? Array.from(consumerDomains).sort()
      : [fileDomain ?? 'internal'];

    interfaces.push({
      file: relative(rootPath, node.path),
      exports: node.exports.map(e => e.name),
      consumers,
    });
  }

  // Calculate coupling scores between domain pairs
  const pairEdges = new Map<string, number>(); // "domA|domB" → cross-boundary edge count
  const domainEdgeCounts = new Map<string, number>(); // domain → total outgoing edges

  for (const edge of graph.edges) {
    const fromDomain = fileDomains.get(edge.from);
    const toDomain = fileDomains.get(edge.to);
    if (!fromDomain || !toDomain) continue;

    domainEdgeCounts.set(fromDomain, (domainEdgeCounts.get(fromDomain) ?? 0) + 1);

    if (fromDomain !== toDomain) {
      const key = [fromDomain, toDomain].sort().join('|');
      pairEdges.set(key, (pairEdges.get(key) ?? 0) + 1);
    }
  }

  const couplingScores: CouplingPair[] = [];
  for (const [key, crossingEdges] of pairEdges) {
    const [domainA, domainB] = key.split('|');
    const totalEdgesA = domainEdgeCounts.get(domainA) ?? 1;
    const totalEdgesB = domainEdgeCounts.get(domainB) ?? 1;
    // Coupling score: ratio of cross-boundary edges to total edges from both domains
    const score = crossingEdges / Math.max(totalEdgesA, totalEdgesB);
    couplingScores.push({
      domainA,
      domainB,
      score: Math.min(score, 1),
      crossingEdges,
    });
  }

  return { interfaces, couplingScores };
}
