import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { StructureAnalysis } from '../types.js';

const LAYER_NAMES = new Set([
  'controllers', 'controller',
  'services', 'service',
  'models', 'model',
  'routes', 'route',
  'middleware', 'middlewares',
  'utils', 'util', 'utilities',
  'helpers', 'helper',
  'lib', 'libs',
  'config', 'configs',
  'api',
  'views', 'view',
  'dtos', 'dto',
  'schemas', 'schema',
  'validators', 'validation',
]);

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

function detectPattern(topLevelDirs: string[]): StructureAnalysis['pattern'] {
  if (topLevelDirs.length === 0) return 'flat';

  const layerCount = topLevelDirs.filter(d => LAYER_NAMES.has(d)).length;
  const featureCount = topLevelDirs.length - layerCount;
  const layerRatio = layerCount / topLevelDirs.length;

  if (layerRatio >= 0.85) return 'layer';
  if (layerRatio <= 0.2) return 'feature';
  return 'mixed';
}

export async function analyzeStructure(rootPath: string): Promise<StructureAnalysis> {
  const srcRoot = await findSrcRoot(rootPath);
  const allFiles = await findTsFiles(srcRoot);

  const filesByDirectory: Record<string, string[]> = {};
  const topLevelDirSet = new Set<string>();

  for (const file of allFiles) {
    const rel = relative(srcRoot, file);
    const parts = rel.split('/');
    const topDir = parts.length > 1 ? parts[0] : '.';

    if (topDir !== '.') {
      topLevelDirSet.add(topDir);
    }

    if (!filesByDirectory[topDir]) {
      filesByDirectory[topDir] = [];
    }
    filesByDirectory[topDir].push(rel);
  }

  const topLevelDirs = Array.from(topLevelDirSet).sort();
  const pattern = detectPattern(topLevelDirs);

  return {
    topLevelDirs,
    pattern,
    filesByDirectory,
    totalFiles: allFiles.length,
  };
}
