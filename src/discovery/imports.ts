import ts from 'typescript';
import { readFile } from 'fs/promises';
import { join, relative, resolve, dirname } from 'path';
import type { ImportGraph, FileNode, ImportStatement, ExportedSymbol, ImportEdge } from '../types.js';
import { findTsFiles, findSrcRoot } from './files.js';

/** Path alias entries parsed from tsconfig.json */
interface PathAlias {
  prefix: string;
  replacement: string;
}

async function loadPathAliases(rootPath: string): Promise<PathAlias[]> {
  const aliases: PathAlias[] = [];
  try {
    const tsconfigPath = join(rootPath, 'tsconfig.json');
    const raw = await readFile(tsconfigPath, 'utf-8');
    // Use TypeScript's own parser which handles comments, trailing commas, etc.
    const parsed = ts.parseConfigFileTextToJson(tsconfigPath, raw);
    if (parsed.error) return aliases;

    const config = parsed.config;
    const paths = config?.compilerOptions?.paths;
    if (!paths) return aliases;

    const baseUrl = config?.compilerOptions?.baseUrl || '.';
    const baseDir = resolve(rootPath, baseUrl);

    for (const [pattern, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const target = targets[0] as string;
      // Convert glob patterns: "@/*" → prefix "@/", target "./*" → baseDir + "/"
      const prefix = pattern.replace(/\*$/, '');
      // Skip bare wildcard pattern ("*") — it would match all external packages
      if (prefix === '') continue;
      const replacement = resolve(baseDir, target.replace(/\*$/, ''));
      aliases.push({ prefix, replacement });
    }
  } catch {
    // No tsconfig or can't parse — that's fine
  }
  // Sort by prefix length descending so longer prefixes match first
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return aliases;
}

function resolveImportPath(
  importSource: string,
  fromFile: string,
  allFiles: string[],
  pathAliases: PathAlias[],
): string | null {
  let resolved: string;

  if (importSource.startsWith('.')) {
    // Relative import
    const fromDir = dirname(fromFile);
    resolved = resolve(fromDir, importSource);
  } else {
    // Try path aliases
    let aliasResolved = false;
    resolved = '';
    for (const alias of pathAliases) {
      if (importSource.startsWith(alias.prefix)) {
        const remainder = importSource.slice(alias.prefix.length);
        resolved = join(alias.replacement, remainder);
        aliasResolved = true;
        break;
      }
    }
    if (!aliasResolved) return null; // External package
  }

  // Strip .js extension (TS files use .js in imports for Node16 resolution)
  if (resolved.endsWith('.js')) {
    resolved = resolved.slice(0, -3);
  }

  // Try exact .ts, .tsx, then /index.ts, /index.tsx
  const candidates = [
    resolved + '.ts',
    resolved + '.tsx',
    join(resolved, 'index.ts'),
    join(resolved, 'index.tsx'),
    resolved, // might already have extension
  ];

  for (const candidate of candidates) {
    if (allFiles.includes(candidate)) return candidate;
  }

  return null;
}

function extractExports(sourceFile: ts.SourceFile): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];

  function visit(node: ts.Node) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExport = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const hasDefault = modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (!hasExport) {
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      exports.push({ name: node.name.text, kind: 'function', isDefault: !!hasDefault });
    } else if (ts.isClassDeclaration(node) && node.name) {
      exports.push({ name: node.name.text, kind: 'class', isDefault: !!hasDefault });
    } else if (ts.isInterfaceDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'interface', isDefault: !!hasDefault });
    } else if (ts.isTypeAliasDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'type', isDefault: !!hasDefault });
    } else if (ts.isEnumDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'enum', isDefault: !!hasDefault });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exports.push({ name: decl.name.text, kind: 'variable', isDefault: !!hasDefault });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}

function extractImports(sourceFile: ts.SourceFile): ImportStatement[] {
  const imports: ImportStatement[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const source = node.moduleSpecifier.text;
      const isTypeOnly = node.importClause?.isTypeOnly ?? false;
      const symbols: string[] = [];

      if (node.importClause) {
        if (node.importClause.name) {
          symbols.push(node.importClause.name.text);
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const spec of node.importClause.namedBindings.elements) {
              symbols.push(spec.name.text);
            }
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            symbols.push(node.importClause.namedBindings.name.text);
          }
        }
      }

      imports.push({
        source,
        resolvedPath: null, // resolved later
        symbols,
        isTypeOnly,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

export async function buildImportGraph(rootPath: string): Promise<ImportGraph> {
  const srcRoot = await findSrcRoot(rootPath);
  const allFiles = await findTsFiles(rootPath);
  const pathAliases = await loadPathAliases(rootPath);

  const nodes: FileNode[] = [];
  const edges: ImportEdge[] = [];

  // Parse all files
  for (const filePath of allFiles) {
    const content = await readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    const fileExports = extractExports(sourceFile);
    const fileImports = extractImports(sourceFile);

    // Resolve import paths
    for (const imp of fileImports) {
      imp.resolvedPath = resolveImportPath(imp.source, filePath, allFiles, pathAliases);
    }

    nodes.push({
      path: filePath,
      relativePath: relative(srcRoot, filePath),
      exports: fileExports,
      imports: fileImports,
    });
  }

  // Build edges from resolved imports
  for (const node of nodes) {
    for (const imp of node.imports) {
      if (imp.resolvedPath) {
        edges.push({
          from: node.path,
          to: imp.resolvedPath,
          symbols: imp.symbols,
          weight: imp.isTypeOnly ? 0.3 : 1,
        });
      }
    }
  }

  return { nodes, edges };
}
