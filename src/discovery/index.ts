import { relative } from 'path';
import type { DiscoveryResult, DomainProposal, ClusterSignal, InterfacePoint, ImportGraph } from '../types.js';
import { analyzeStructure } from './structure.js';
import { buildImportGraph } from './imports.js';
import { analyzeNaming } from './naming.js';
import { analyzeDependencies } from './dependencies.js';
import { detectInterfaces } from './interfaces.js';

const LAYER_NAMES = new Set([
  'controllers', 'controller', 'services', 'service',
  'models', 'model', 'routes', 'route',
  'middleware', 'middlewares', 'utils', 'util', 'utilities',
  'helpers', 'helper', 'lib', 'libs', 'api',
  'views', 'view', 'dtos', 'dto',
  'schemas', 'schema', 'validators', 'validation',
]);

const UNASSIGNABLE_NAMES = new Set([
  'index', 'main', 'app', 'server', 'setup', 'bootstrap',
  'helpers', 'constants', 'config', 'types', 'utils',
  'logger', 'validator', 'db', 'database',
]);

function extractPrefix(fileName: string): string | null {
  const name = fileName.replace(/\.tsx?$/, '');
  const parts = name.split(/[.\-]/);
  if (parts.length >= 1) return parts[0];
  return null;
}

function assignDomain(relativePath: string): string | null {
  const parts = relativePath.split('/');
  const topDir = parts.length > 1 ? parts[0] : null;
  const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '');

  if (!topDir || topDir === '.') {
    const prefix = extractPrefix(fileName);
    if (prefix && !UNASSIGNABLE_NAMES.has(prefix)) return prefix;
    return null;
  }

  if (!LAYER_NAMES.has(topDir)) return topDir;

  const prefix = extractPrefix(fileName);
  if (prefix && !UNASSIGNABLE_NAMES.has(prefix)) return prefix;

  return null;
}

/** Resolve an absolute file path to a relative path that matches fileDomainMap keys */
function toRelative(rootPath: string, absPath: string): string {
  // Try srcRoot-relative first, then rootPath-relative
  const srcRel = relative(rootPath + '/src', absPath);
  if (!srcRel.startsWith('..')) return srcRel;
  return relative(rootPath, absPath);
}

interface ConnectionInfo {
  /** Map of domain → connection strength */
  connections: Map<string, number>;
  /** Number of outgoing cross-domain imports */
  outgoingCrossDomain: number;
  /** Number of distinct consumer domains (incoming) */
  consumerDomainCount: number;
}

function getConnectionInfo(
  files: string[],
  domainName: string,
  graph: ImportGraph,
  rootPath: string,
  fileDomainMap: Map<string, string>,
): ConnectionInfo {
  const connections = new Map<string, number>();
  let outgoingCrossDomain = 0;
  const consumerDomains = new Set<string>();

  for (const file of files) {
    const node = graph.nodes.find((n: any) => n.relativePath === file);
    if (!node) continue;

    for (const imp of node.imports) {
      if (!imp.resolvedPath) continue;
      const targetRel = toRelative(rootPath, imp.resolvedPath);
      const targetDomain = fileDomainMap.get(targetRel);
      if (targetDomain && targetDomain !== domainName) {
        connections.set(targetDomain, (connections.get(targetDomain) ?? 0) + 1);
        outgoingCrossDomain++;
      }
    }

    for (const edge of graph.edges) {
      const toRel = toRelative(rootPath, edge.to);
      if (toRel !== file) continue;
      const fromNode = graph.nodes.find((n: any) => n.path === edge.from);
      if (!fromNode) continue;
      const fromDomain = fileDomainMap.get(fromNode.relativePath);
      if (fromDomain && fromDomain !== domainName) {
        connections.set(fromDomain, (connections.get(fromDomain) ?? 0) + 2);
        consumerDomains.add(fromDomain);
      }
    }
  }

  return { connections, outgoingCrossDomain, consumerDomainCount: consumerDomains.size };
}

export async function discoverDomains(rootPath: string): Promise<DiscoveryResult> {
  const [structure, graph, naming, deps] = await Promise.all([
    analyzeStructure(rootPath),
    buildImportGraph(rootPath),
    analyzeNaming(rootPath),
    analyzeDependencies(rootPath),
  ]);

  const interfaceAnalysis = await detectInterfaces(graph, rootPath);

  // Step 1: Initial domain assignment
  const fileDomainMap = new Map<string, string>();
  const domainFiles = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const node of graph.nodes) {
    const domain = assignDomain(node.relativePath);
    if (domain) {
      fileDomainMap.set(node.relativePath, domain);
      if (!domainFiles.has(domain)) domainFiles.set(domain, []);
      domainFiles.get(domain)!.push(node.relativePath);
    } else {
      unassigned.push(node.relativePath);
    }
  }

  // Step 2: Merge small clusters (only for layer/mixed codebases)
  if (structure.pattern === 'layer' || structure.pattern === 'mixed') {
    // Phase 1: Merge leaf singletons (no outgoing cross-domain imports, exactly 1 consumer domain)
    for (const [domain, files] of Array.from(domainFiles.entries())) {
      if (files.length > 1) continue;

      const info = getConnectionInfo(files, domain, graph, rootPath, fileDomainMap);

      if (info.outgoingCrossDomain === 0 && info.consumerDomainCount === 1) {
        // True leaf with single consumer — merge into the consumer
        const [targetDomain] = info.connections.entries().next().value as [string, number];
        if (domainFiles.has(targetDomain)) {
          domainFiles.get(targetDomain)!.push(...files);
          for (const f of files) fileDomainMap.set(f, targetDomain);
          domainFiles.delete(domain);
        }
      }
    }

    // Phase 2: Move remaining singletons that import from 3+ domains to unassigned (coupling hotspots)
    for (const [domain, files] of Array.from(domainFiles.entries())) {
      if (files.length !== 1) continue;

      const info = getConnectionInfo(files, domain, graph, rootPath, fileDomainMap);
      const outgoingDomains = new Set<string>();
      const node = graph.nodes.find((n: any) => n.relativePath === files[0]);
      if (node) {
        for (const imp of node.imports) {
          if (!imp.resolvedPath) continue;
          const targetRel = toRelative(rootPath, imp.resolvedPath);
          const targetDomain = fileDomainMap.get(targetRel);
          if (targetDomain && targetDomain !== domain) outgoingDomains.add(targetDomain);
        }
      }

      if (outgoingDomains.size >= 3) {
        unassigned.push(files[0]);
        fileDomainMap.delete(files[0]);
        domainFiles.delete(domain);
      }
    }
  }

  // Step 3: Build domain proposals with signals and confidence
  const domains: DomainProposal[] = [];

  for (const [domainName, files] of domainFiles) {
    const signals: ClusterSignal[] = [];

    // Signal: directory structure
    const hasOwnDir = files.some(f => {
      const parts = f.split('/');
      return parts.length > 1 && parts[0] === domainName;
    });
    if (hasOwnDir) {
      signals.push({
        type: 'directory',
        description: `${domainName}/ exists as distinct directory`,
        strength: 0.95,
      });
    }

    // Signal: naming patterns
    const namingGroup = naming.groups.find(g => g.pattern === domainName);
    if (namingGroup) {
      signals.push({
        type: 'naming',
        description: `${namingGroup.files.length} files match '${domainName}' naming pattern`,
        strength: 0.7,
      });
    }

    // Signal: import cohesion
    let intraImports = 0;
    let totalImports = 0;
    for (const file of files) {
      const node = graph.nodes.find((n: any) => n.relativePath === file);
      if (!node) continue;
      for (const imp of node.imports) {
        if (!imp.resolvedPath) continue;
        totalImports++;
        const targetRel = toRelative(rootPath, imp.resolvedPath);
        const targetDomain = fileDomainMap.get(targetRel);
        if (targetDomain === domainName) intraImports++;
      }
    }
    if (totalImports > 0) {
      const cohesion = intraImports / totalImports;
      signals.push({
        type: 'imports',
        description: `${Math.round(cohesion * 100)}% of imports are internal to domain`,
        strength: cohesion,
      });
    }

    // Signal: dependency hints
    const domainHints = deps.hints.filter(h => h.suggestedDomain === domainName);
    if (domainHints.length > 0) {
      signals.push({
        type: 'dependency',
        description: `uses ${domainHints.map(h => h.packageName).join(', ')}`,
        strength: Math.max(...domainHints.map(h => h.confidence)),
      });
    }

    // Calculate confidence
    let confidence: number;
    if (signals.length === 0) {
      confidence = 0.3;
    } else {
      const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
      const signalCountBonus = Math.min(signals.length * 0.05, 0.15);
      confidence = Math.min(avgStrength + signalCountBonus, 0.99);
    }

    if (structure.pattern === 'layer') {
      confidence *= 0.85;
    } else if (structure.pattern === 'mixed' && !hasOwnDir) {
      confidence *= 0.75;
    }

    // Find interfaces relevant to this domain (exposed OR consumed)
    const domainInterfaces: InterfacePoint[] = interfaceAnalysis.interfaces.filter(iface => {
      // This domain exposes the interface
      const isProvider = files.some(f => {
        const ifaceNorm = iface.file.replace(/^src\//, '');
        return f === ifaceNorm || ifaceNorm === f;
      });
      // This domain consumes the interface
      const isConsumer = iface.consumers.includes(domainName);
      return isProvider || isConsumer;
    });

    // Calculate coupling with other domains
    const coupling: Record<string, number> = {};
    for (const pair of interfaceAnalysis.couplingScores) {
      if (pair.domainA === domainName) {
        coupling[pair.domainB] = pair.score;
      } else if (pair.domainB === domainName) {
        coupling[pair.domainA] = pair.score;
      }
    }

    domains.push({
      name: domainName,
      files,
      confidence,
      signals,
      interfaces: domainInterfaces,
      coupling,
    });
  }

  domains.sort((a, b) => b.confidence - a.confidence);

  return {
    rootPath,
    files: graph.nodes,
    edges: graph.edges,
    domains,
    unassigned,
  };
}
