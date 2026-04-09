import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

/** Directories always excluded from analysis at any nesting level */
const ALWAYS_EXCLUDED = new Set([
  'node_modules', 'dist', '.git',
]);

/** Directories excluded when found at the top level of the scan root */
const TOP_LEVEL_EXCLUDED = new Set([
  '.next', '.turbo', '.vercel', '.cache',
  'coverage', 'build', 'out', '__mocks__',
  'public', '.playwright-mcp',
]);

/**
 * Parse .gitignore for directory patterns to exclude.
 * Handles simple directory names and paths like "generated/prisma/".
 */
async function parseGitignoreExclusions(rootPath: string): Promise<Set<string>> {
  const excludes = new Set<string>();
  try {
    const content = await readFile(join(rootPath, '.gitignore'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
      // Strip leading/trailing slashes
      const pattern = trimmed.replace(/^\//, '').replace(/\/$/, '');
      // Only use simple directory names (no globs, no file extensions)
      if (pattern.includes('*') || pattern.includes('.')) continue;
      excludes.add(pattern);
    }
  } catch {
    // No .gitignore — that's fine
  }
  return excludes;
}

export async function findTsFiles(rootPath: string): Promise<string[]> {
  const gitignoreExcludes = await parseGitignoreExclusions(rootPath);
  const srcRoot = await findSrcRoot(rootPath);
  return walkDir(srcRoot, srcRoot, gitignoreExcludes);
}

async function walkDir(
  dir: string,
  scanRoot: string,
  gitignoreExcludes: Set<string>,
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  const isTopLevel = dir === scanRoot;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ALWAYS_EXCLUDED.has(entry.name)) continue;
      if (isTopLevel && TOP_LEVEL_EXCLUDED.has(entry.name)) continue;
      if (isTopLevel && gitignoreExcludes.has(entry.name)) continue;
      // Handle nested gitignore patterns like "generated/prisma"
      if (gitignoreExcludes.has(getRelativeDir(fullPath, scanRoot))) continue;
      results.push(...await walkDir(fullPath, scanRoot, gitignoreExcludes));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getRelativeDir(fullPath: string, scanRoot: string): string {
  if (fullPath.startsWith(scanRoot + '/')) {
    return fullPath.slice(scanRoot.length + 1);
  }
  return fullPath;
}

export async function findSrcRoot(rootPath: string): Promise<string> {
  try {
    const srcPath = join(rootPath, 'src');
    const s = await stat(srcPath);
    if (s.isDirectory()) return srcPath;
  } catch {
    // no src/ directory
  }
  return rootPath;
}
