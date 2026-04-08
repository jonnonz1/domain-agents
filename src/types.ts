/**
 * Core types for the domain-agents discovery engine.
 */

/** A file node in the import graph */
export interface FileNode {
  /** Absolute path to the file */
  path: string;
  /** Path relative to the project root */
  relativePath: string;
  /** Exported symbols (functions, classes, types, interfaces) */
  exports: ExportedSymbol[];
  /** Import statements in this file */
  imports: ImportStatement[];
}

export interface ExportedSymbol {
  name: string;
  kind: 'function' | 'class' | 'type' | 'interface' | 'variable' | 'enum';
  isDefault: boolean;
}

export interface ImportStatement {
  /** The module specifier (e.g., '../email/email.service') */
  source: string;
  /** Resolved absolute path of the imported file (null if external) */
  resolvedPath: string | null;
  /** Imported symbols */
  symbols: string[];
  /** Whether this is a type-only import */
  isTypeOnly: boolean;
}

/** Edge in the import graph */
export interface ImportEdge {
  /** Absolute path of the importing file */
  from: string;
  /** Absolute path of the imported file */
  to: string;
  /** Symbols imported */
  symbols: string[];
  /** Weight: type-only imports weigh less */
  weight: number;
}

/** A cluster of files that likely form a domain */
export interface FileCluster {
  /** Proposed domain name */
  name: string;
  /** Files in this cluster (relative paths) */
  files: string[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Signals that contributed to this clustering */
  signals: ClusterSignal[];
}

export interface ClusterSignal {
  type: 'directory' | 'imports' | 'naming' | 'dependency' | 'framework';
  description: string;
  strength: number; // 0-1
}

/** Proposed domain from the discovery engine */
export interface DomainProposal {
  name: string;
  files: string[];
  confidence: number;
  signals: ClusterSignal[];
  interfaces: InterfacePoint[];
  coupling: Record<string, number>; // domain name → coupling score
}

/** An interface point between domains */
export interface InterfacePoint {
  /** File that exposes the interface */
  file: string;
  /** Exported symbols that are used by other domains */
  exports: string[];
  /** Which domains import from this interface */
  consumers: string[];
}

/** Full discovery result */
export interface DiscoveryResult {
  /** Root path of the analyzed project */
  rootPath: string;
  /** All file nodes analyzed */
  files: FileNode[];
  /** Import graph edges */
  edges: ImportEdge[];
  /** Proposed domains */
  domains: DomainProposal[];
  /** Files not assigned to any domain */
  unassigned: string[];
}

/** Result of structure analysis pass */
export interface StructureAnalysis {
  /** Top-level directories under src/ (or root) */
  topLevelDirs: string[];
  /** Organization pattern detected */
  pattern: 'feature' | 'layer' | 'mixed' | 'flat';
  /** Files grouped by their top-level directory */
  filesByDirectory: Record<string, string[]>;
  /** Total TypeScript files found */
  totalFiles: number;
}

/** Result of import graph analysis */
export interface ImportGraph {
  nodes: FileNode[];
  edges: ImportEdge[];
}

/** Result of naming analysis */
export interface NamingAnalysis {
  /** Groups of files sharing naming patterns */
  groups: NamingGroup[];
}

export interface NamingGroup {
  /** The common pattern (e.g., 'email', 'auth') */
  pattern: string;
  /** Files matching this pattern */
  files: string[];
  /** How the pattern was detected */
  matchType: 'prefix' | 'directory' | 'suffix' | 'contains';
}

/** Result of dependency analysis */
export interface DependencyAnalysis {
  /** Domain hints from package.json dependencies */
  hints: DependencyHint[];
}

export interface DependencyHint {
  /** npm package name */
  packageName: string;
  /** Suggested domain */
  suggestedDomain: string;
  /** Confidence that this maps to the domain */
  confidence: number;
}

/** Result of interface detection */
export interface InterfaceAnalysis {
  /** Detected interface points between clusters */
  interfaces: InterfacePoint[];
  /** Coupling scores between cluster pairs */
  couplingScores: CouplingPair[];
}

export interface CouplingPair {
  domainA: string;
  domainB: string;
  /** 0 = no coupling, 1 = completely coupled */
  score: number;
  /** Import edges that cross this boundary */
  crossingEdges: number;
}

/** Scaling stage for a domain */
export type ScalingStage = 'inline' | 'async' | 'queued' | 'service' | 'distributed';

/** Tech debt item tracked by a domain agent */
export interface TechDebtItem {
  description: string;
  impact: 'low' | 'medium' | 'high';
  relevantAtStage: ScalingStage[];
}

/** Observability metric specification */
export interface MetricSpec {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  description: string;
}

/** Generated domain agent file content */
export interface AgentFileContent {
  domainName: string;
  purpose: string;
  ownership: {
    files: string[];
    routes: string[];
    config: string[];
  };
  interfaces: {
    exposed: InterfacePoint[];
    consumed: { domain: string; symbols: string[] }[];
  };
  scalingStage: ScalingStage;
  techDebt: TechDebtItem[];
  observability: {
    currentMetrics: MetricSpec[];
    gaps: string[];
    scalingTriggers: string[];
  };
  domainRules: string[];
}
