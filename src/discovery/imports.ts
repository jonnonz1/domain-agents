import ts from 'typescript';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, resolve, dirname, extname } from 'path';
import type { ImportGraph, FileNode, ImportStatement, ExportedSymbol, ImportEdge } from '../types.js';

async function findTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...await findTsFiles(fullPath));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function findSrcRoot(rootPath: string): Promise<string> {
  try {
    const srcPath = join(rootPath, 'src');
    const s = await stat(srcPath);
    if (s.isDirectory()) return srcPath;
  } catch {
    // no src/ directory
  }
  return rootPath;
}

function resolveImportPath(importSource: string, fromFile: string, allFiles: string[]): string | null {
  if (!importSource.startsWith('.')) return null;

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

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
  const allFiles = await findTsFiles(srcRoot);

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
      imp.resolvedPath = resolveImportPath(imp.source, filePath, allFiles);
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
