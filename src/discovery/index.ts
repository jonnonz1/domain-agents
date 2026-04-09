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

/** Directories that act as containers — we look inside them for domain names */
const CONTAINER_DIRS = new Set([
  ...LAYER_NAMES,
  // Framework-specific containers that organize by feature inside
  'components', 'hooks', 'pages', 'app', 'apps',
  'features', 'modules', 'domains', 'providers',
  'queries', 'mutations', 'subscriptions',
  'store', 'stores', 'state', 'slices',
  'tests', '__tests__', 'specs', 'spec',
  // Organizational directories within lib/ that group by concern, not domain
  'const', 'constants',
  'interfaces', 'interface',
  'types', 'type',
  'queue', 'queues', 'workers', 'worker', 'jobs',
  'serializers', 'serializer',
  'migrations', 'seeds',
  'transformers', 'formatters', 'decorators',
  'filters', 'pipes', 'guards', 'interceptors',
  'schemas', 'schema',
  'test-helpers',
]);

const UNASSIGNABLE_NAMES = new Set([
  'index', 'main', 'app', 'server', 'setup', 'bootstrap',
  'helpers', 'constants', 'config', 'types', 'utils',
  'logger', 'validator', 'db', 'database', 'route',
  'page', 'layout', 'loading', 'error', 'not-found',
  'template', 'default', 'head', 'opengraph-image',
  'global-error', 'middleware',
]);

/** Prefixes that are code verbs / generic words, not business domain names */
const GARBAGE_PREFIXES = new Set([
  // CRUD + common action verbs
  'with', 'use', 'get', 'set', 'create', 'delete', 'update', 'remove',
  'add', 'find', 'check', 'process', 'run', 'handle', 'fetch', 'send',
  'emit', 'resolve', 'generate', 'mock', 'test', 'setup', 'build',
  'make', 'parse', 'format', 'validate', 'transform', 'convert',
  'load', 'save', 'read', 'write', 'init', 'start', 'stop',
  'enable', 'disable', 'register', 'unregister', 'subscribe',
  // Domain action verbs
  'restore', 'reconcile', 'recode', 'reverse', 'dispose', 'activate',
  'deactivate', 'sync', 'disconnect', 'connect', 'suggest', 'duplicate',
  'import', 'export', 'assign', 'unassign', 'invite', 'revoke',
  'highlight', 'expand', 'toggle', 'dismiss', 'verify', 'approve',
  'reject', 'cancel', 'archive', 'clone', 'revert', 'publish',
  'provision', 'enrich', 'classify', 'draft', 'triage',
  // Adjective/past-tense forms
  'reconciled', 'highlighted', 'grouped', 'persisted', 'excluded',
  'visible', 'similar', 'unreconciled', 'bulk',
  // Prepositions and determiners
  'on', 'is', 'has', 'can', 'should', 'will', 'do',
  'from', 'to', 'for', 'by', 'of', 'in', 'at',
  // Generic nouns that aren't business domains
  'base', 'abstract', 'common', 'shared', 'core', 'internal',
  'util', 'helper', 'wrapper', 'factory', 'provider', 'context',
  'manager', 'handler', 'listener', 'observer', 'adapter',
  'current', 'default', 'custom', 'new', 'old', 'legacy',
  'public', 'private', 'global', 'local', 'temp', 'tmp',
  'response', 'request', 'input', 'output', 'result', 'data',
  'item', 'list', 'map', 'set', 'array', 'collection',
  'error', 'errors', 'mock', 'mocks', 'stub', 'stubs',
  'fixture', 'fixtures', 'seed', 'seeds',
]);

/**
 * Extract a meaningful domain name from a filename.
 * For "use-bank-accounts.ts" → "bank-accounts"
 * For "journal.test.ts" → "journal"
 * For "with-admin-access.ts" → "admin" (strips verb prefix)
 */
function extractDomainFromFileName(fileName: string): string | null {
  let name = fileName.replace(/\.tsx?$/, '');

  // Strip test/spec suffixes
  name = name.replace(/\.(test|spec|integration|e2e)$/, '');

  const parts = name.split(/[.\-]/);
  if (parts.length === 0) return null;

  // Strip leading verb prefixes (use-, with-, get-, create-, etc.)
  while (parts.length > 1 && GARBAGE_PREFIXES.has(parts[0])) {
    parts.shift();
  }

  // Strip trailing framework suffixes and action words
  const TRAILING_STRIP = new Set([
    'controller', 'service', 'model', 'repository', 'handler',
    'guard', 'pipe', 'interceptor', 'module', 'resolver', 'gateway',
    'middleware', 'client', 'provider', 'config', 'schema',
    'test', 'spec', 'integration',
  ]);
  while (parts.length > 1 && TRAILING_STRIP.has(parts[parts.length - 1])) {
    parts.pop();
  }

  const result = parts.join('-');
  if (!result || UNASSIGNABLE_NAMES.has(result) || GARBAGE_PREFIXES.has(result)) return null;
  return result;
}

/**
 * Depluralize the last segment of a hyphenated name for merging comparison.
 * "entities" → "entity", "journals" → "journal", "bank-accounts" → "bank-account"
 */
function stemDomainName(name: string): string {
  const parts = name.split('-');
  let last = parts[parts.length - 1];
  // Order matters: check -ies before -s
  if (last.endsWith('ies') && last.length > 4) {
    last = last.slice(0, -3) + 'y';
  } else if (last.endsWith('shes') || last.endsWith('ches') || last.endsWith('xes') || last.endsWith('zes') || last.endsWith('ses')) {
    last = last.slice(0, -2);
  } else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us') && last.length > 3) {
    last = last.slice(0, -1);
  }
  parts[parts.length - 1] = last;
  return parts.join('-');
}

/** Strip Next.js route group wrappers: "(app)" → "app", "(marketing)" → "marketing" */
function stripRouteGroup(segment: string): string | null {
  const match = segment.match(/^\((.+)\)$/);
  return match ? match[1] : segment;
}

/**
 * Assign a domain to a file based on its path structure.
 * Handles nested directories, Next.js conventions, and cross-layer patterns.
 */
function assignDomain(relativePath: string): string | null {
  const parts = relativePath.split('/');
  const fileName = parts[parts.length - 1];

  // Root-level files are usually config/framework files — don't assign to domains
  if (parts.length === 1) {
    return null;
  }

  const topDir = parts[0];

  // For container directories, look deeper for domain names
  if (CONTAINER_DIRS.has(topDir)) {
    // Next.js app/ directory: handle route groups and API routes
    if (topDir === 'app' && parts.length >= 3) {
      // app/api/journals/route.ts → "journals"
      // app/(app)/admin/page.tsx → "admin"
      // app/api/public/v1/entities/route.ts → "entities" (skip api/public/v1 prefix)
      let domainIdx = 1;
      // Skip through container-like segments
      const API_SEGMENTS = new Set(['api', 'public', 'v1', 'v2', 'v3']);
      while (domainIdx < parts.length - 1) {
        const segment = stripRouteGroup(parts[domainIdx]);
        if (segment && !API_SEGMENTS.has(segment) && !CONTAINER_DIRS.has(segment) && segment !== 'app') {
          return segment;
        }
        domainIdx++;
      }
      // Couldn't find a domain segment — try filename
      const domain = extractDomainFromFileName(fileName);
      return domain;
    }

    // hooks/use-bank-accounts.ts → "bank-accounts"
    // hooks/admin/use-admin-users.ts → "admin"
    if (topDir === 'hooks') {
      // If there's a subdirectory, use it
      if (parts.length >= 3) {
        const subDir = parts[1];
        if (!UNASSIGNABLE_NAMES.has(subDir) && !subDir.startsWith('__')) {
          return subDir;
        }
      }
      // Otherwise extract from filename
      const domain = extractDomainFromFileName(fileName);
      return domain;
    }

    // components/journals/journal-form.tsx → "journals"
    // lib/services/journal/journal.ts → "journal"
    // lib/middleware/api/with-entity-access.ts → "entity"
    if (parts.length >= 3) {
      // Walk through path segments to find the most specific domain-like segment
      for (let i = 1; i < parts.length - 1; i++) {
        const segment = parts[i];
        if (!CONTAINER_DIRS.has(segment) && !LAYER_NAMES.has(segment) &&
            !UNASSIGNABLE_NAMES.has(segment) && !segment.startsWith('__') &&
            !segment.startsWith('[') && !segment.startsWith('(')) {
          return segment;
        }
      }
    }

    // Container with just a file: components/route-change-toast.tsx
    // Extract from filename
    const domain = extractDomainFromFileName(fileName);
    return domain;
  }

  // Non-container top-level directories: use the directory as domain
  // schemas/entity.schema.ts → "schemas"
  // prisma/seeds/accounts/index.ts → "prisma"
  // scripts/analyze-perf-logs.ts → "scripts"
  return topDir;
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

  // Step 2: Normalize and merge domains

  // Phase 1: Normalize plural/singular domain names (journals → journal, entities → entity)
  // Merge smaller variant into larger one
  const normalizedNames = new Map<string, string>(); // stem → canonical domain name
  for (const domain of domainFiles.keys()) {
    const stem = stemDomainName(domain);
    if (!normalizedNames.has(stem)) {
      normalizedNames.set(stem, domain);
    } else {
      const existing = normalizedNames.get(stem)!;
      // Keep the one with more files as canonical
      const existingFiles = domainFiles.get(existing)?.length ?? 0;
      const currentFiles = domainFiles.get(domain)?.length ?? 0;
      if (currentFiles > existingFiles) {
        normalizedNames.set(stem, domain);
      }
    }
  }

  // Merge plural variants
  for (const [stem, canonical] of normalizedNames) {
    for (const [domain, files] of Array.from(domainFiles.entries())) {
      if (domain === canonical) continue;
      const domainStem = stemDomainName(domain);
      if (domainStem === stem) {
        // Merge into canonical
        if (!domainFiles.has(canonical)) continue;
        domainFiles.get(canonical)!.push(...files);
        for (const f of files) fileDomainMap.set(f, canonical);
        domainFiles.delete(domain);
      }
    }
  }

  // Phase 2: Merge compound-name domains into their parent domain if one exists
  // e.g., "entity-access" → "entity", "journal-sources" → "journals", "akahu-auto-sync" → "akahu"
  // Only when the parent domain exists and the child is small

  // Build a lookup: stemmed name → actual domain name (for finding plural/singular variants)
  const stemToCanonical = new Map<string, string>();
  for (const domain of domainFiles.keys()) {
    const stem = stemDomainName(domain);
    // If there's a conflict, prefer the domain with more files
    if (!stemToCanonical.has(stem) ||
        (domainFiles.get(domain)?.length ?? 0) > (domainFiles.get(stemToCanonical.get(stem)!)?.length ?? 0)) {
      stemToCanonical.set(stem, domain);
    }
  }

  function findParentDomain(name: string): string | null {
    const parts = name.split('-');
    for (let len = parts.length - 1; len >= 1; len--) {
      const prefix = parts.slice(0, len).join('-');
      // Check exact match
      if (domainFiles.has(prefix)) return prefix;
      // Check stemmed match (e.g., "journal" matches "journals")
      const stemmed = stemDomainName(prefix);
      const canonical = stemToCanonical.get(stemmed);
      if (canonical && canonical !== name && domainFiles.has(canonical)) return canonical;
      // Check plural match (e.g., "journal" tries "journals")
      if (domainFiles.has(prefix + 's')) return prefix + 's';
    }
    return null;
  }

  for (const [domain, files] of Array.from(domainFiles.entries())) {
    const parent = findParentDomain(domain);
    if (!parent) continue;
    // Merge if child is small relative to parent, or child is very small
    const parentSize = domainFiles.get(parent)?.length ?? 0;
    if (files.length <= 8 || files.length < parentSize * 0.3) {
      domainFiles.get(parent)!.push(...files);
      for (const f of files) fileDomainMap.set(f, parent);
      domainFiles.delete(domain);
    }
  }

  // Phase 2b: Merge compound names that share a prefix
  // e.g., "bank-balance" + "bank-statement" + "bank-transaction" → merge into "bank-accounts" (largest)
  const prefixGroups = new Map<string, string[]>(); // prefix → domain names
  for (const domain of domainFiles.keys()) {
    const parts = domain.split('-');
    if (parts.length < 2) continue;
    const prefix = parts[0];
    if (GARBAGE_PREFIXES.has(prefix)) continue;
    if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
    prefixGroups.get(prefix)!.push(domain);
  }

  for (const [prefix, members] of prefixGroups) {
    if (members.length < 2) continue;

    // Sort by file count descending — largest becomes canonical
    members.sort((a, b) => (domainFiles.get(b)?.length ?? 0) - (domainFiles.get(a)?.length ?? 0));
    const canonical = members[0];
    const canonicalSize = domainFiles.get(canonical)?.length ?? 0;

    for (let i = 1; i < members.length; i++) {
      const member = members[i];
      if (!domainFiles.has(member)) continue;
      const memberFiles = domainFiles.get(member)!;
      // Merge if the member is significantly smaller than canonical
      if (memberFiles.length <= 15 || memberFiles.length < canonicalSize * 0.5) {
        domainFiles.get(canonical)!.push(...memberFiles);
        for (const f of memberFiles) fileDomainMap.set(f, canonical);
        domainFiles.delete(member);
      }
    }
  }

  // Phase 3: Merge small clusters into their strongest import target
  for (const [domain, files] of Array.from(domainFiles.entries())) {
    if (files.length > 5) continue;

    const info = getConnectionInfo(files, domain, graph, rootPath, fileDomainMap);

    // Find the domain this cluster has the strongest connection to
    let bestTarget: string | null = null;
    let bestStrength = 0;
    let totalStrength = 0;
    for (const [target, strength] of info.connections) {
      totalStrength += strength;
      if (strength > bestStrength && domainFiles.has(target)) {
        bestStrength = strength;
        bestTarget = target;
      }
    }

    if (!bestTarget) continue;
    const targetSize = domainFiles.get(bestTarget)?.length ?? 0;

    // Merge if:
    // 1. Singleton with single consumer (leaf node)
    // 2. Small domain with dominant connection to a larger domain
    const isDominantConnection = totalStrength > 0 && (bestStrength / totalStrength) > 0.4;
    const isTargetLarger = targetSize >= files.length * 2;
    const isLeaf = files.length === 1 && info.outgoingCrossDomain === 0 && info.consumerDomainCount === 1;

    if (isLeaf || (isDominantConnection && isTargetLarger)) {
      domainFiles.get(bestTarget)!.push(...files);
      for (const f of files) fileDomainMap.set(f, bestTarget);
      domainFiles.delete(domain);
    }
  }

  // Phase 4: Move remaining singletons importing from 3+ domains to unassigned (coupling hotspots)
  for (const [domain, files] of Array.from(domainFiles.entries())) {
    if (files.length !== 1) continue;

    const node = graph.nodes.find((n: any) => n.relativePath === files[0]);
    if (!node) continue;
    const outgoingDomains = new Set<string>();
    for (const imp of node.imports) {
      if (!imp.resolvedPath) continue;
      const targetRel = toRelative(rootPath, imp.resolvedPath);
      const targetDomain = fileDomainMap.get(targetRel);
      if (targetDomain && targetDomain !== domain) outgoingDomains.add(targetDomain);
    }

    if (outgoingDomains.size >= 3) {
      unassigned.push(files[0]);
      fileDomainMap.delete(files[0]);
      domainFiles.delete(domain);
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

  // Step 5: Filter low-confidence noise — move to unassigned
  const filteredDomains: DomainProposal[] = [];

  for (const domain of domains) {
    const isSingleFileNoise = domain.files.length === 1 && domain.confidence < 0.30;
    const isTinyNoSignal = domain.files.length <= 2 && domain.signals.length === 0;
    const isLowConfidenceNoise = domain.files.length <= 2 && domain.confidence < 0.10;
    if (isSingleFileNoise || isTinyNoSignal || isLowConfidenceNoise) {
      unassigned.push(...domain.files);
    } else {
      filteredDomains.push(domain);
    }
  }

  return {
    rootPath,
    files: graph.nodes,
    edges: graph.edges,
    domains: filteredDomains,
    unassigned,
  };
}
