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
 * - For feature-organized: uses the top-level directory (e.g., auth/foo.ts → "auth")
 * - For layer-organized: uses the naming prefix (e.g., services/auth.service.ts → "auth")
 * - Fallback: uses the filename stem
 */
function assignDomain(relativePath: string): string {
  const parts = relativePath.split('/');
  const topDir = parts.length > 1 ? parts[0] : null;
  const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '');

  // If the top-level dir is NOT a layer name, use it as the domain
  if (topDir && !LAYER_NAMES.has(topDir)) {
    return topDir;
  }

  // Top-level dir is a layer name — extract domain from the filename
  const nameParts = fileName.split(/[.\-]/);
  if (nameParts.length >= 2) {
    // e.g., "auth.service" → "auth", "billing-handler" → "billing"
    return nameParts[0];
  }

  // Single-word filename in a layer dir — use it as domain
  // e.g., models/user.ts → "user", models/invoice.ts → "invoice"
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

  // Interface points: files consumed by 2+ different domains
  const interfaces: InterfacePoint[] = [];
  for (const [filePath, consumers] of fileConsumers) {
    if (consumers.size >= 2) {
      const node = graph.nodes.find(n => n.path === filePath);
      const exportNames = node ? node.exports.map(e => e.name) : [];
      interfaces.push({
        file: relative(rootPath, filePath),
        exports: exportNames,
        consumers: Array.from(consumers).sort(),
      });
    }
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
