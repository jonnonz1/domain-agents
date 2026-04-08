import { describe, it, expect } from 'vitest';
import { analyzeStructure } from '../../src/discovery/structure.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Structure Analysis', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('detects feature-based organization pattern', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.pattern).toBe('feature');
    });

    it('identifies top-level feature directories', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.topLevelDirs).toContain('auth');
      expect(result.topLevelDirs).toContain('billing');
      expect(result.topLevelDirs).toContain('email');
      expect(result.topLevelDirs).toContain('users');
      expect(result.topLevelDirs).toContain('shared');
    });

    it('groups files by directory', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.filesByDirectory['auth']).toHaveLength(4);
      expect(result.filesByDirectory['billing']).toHaveLength(4);
      expect(result.filesByDirectory['email']).toHaveLength(3);
      expect(result.filesByDirectory['users']).toHaveLength(4);
    });

    it('counts total TypeScript files', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.totalFiles).toBe(17); // 4+4+3+4+2 = 17
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('detects layer-based organization pattern', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.pattern).toBe('layer');
    });

    it('identifies layer directories', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.topLevelDirs).toContain('controllers');
      expect(result.topLevelDirs).toContain('services');
      expect(result.topLevelDirs).toContain('models');
      expect(result.topLevelDirs).toContain('routes');
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('detects mixed organization pattern', async () => {
      const result = await analyzeStructure(rootPath);
      expect(result.pattern).toBe('mixed');
    });

    it('identifies both feature and non-feature directories', async () => {
      const result = await analyzeStructure(rootPath);
      // auth is feature-like, but api/services/models/lib are layer-like
      expect(result.topLevelDirs).toContain('auth');
      expect(result.topLevelDirs).toContain('api');
      expect(result.topLevelDirs).toContain('services');
      expect(result.topLevelDirs).toContain('models');
      expect(result.topLevelDirs).toContain('lib');
    });

    it('includes root-level files in directory grouping', async () => {
      const result = await analyzeStructure(rootPath);
      // helpers.ts, constants.ts, app.ts are at the root src/ level
      expect(result.filesByDirectory['.']).toBeDefined();
      expect(result.filesByDirectory['.'].length).toBeGreaterThanOrEqual(3);
    });
  });
});
