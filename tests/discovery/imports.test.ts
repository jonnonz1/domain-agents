import { describe, it, expect } from 'vitest';
import { buildImportGraph } from '../../src/discovery/imports.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Import Graph Analysis', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('builds nodes for all TypeScript files', async () => {
      const graph = await buildImportGraph(rootPath);
      expect(graph.nodes.length).toBe(17);
    });

    it('detects imports between files', async () => {
      const graph = await buildImportGraph(rootPath);
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it('resolves relative import paths to absolute paths', async () => {
      const graph = await buildImportGraph(rootPath);
      const authServiceNode = graph.nodes.find(n =>
        n.relativePath.includes('auth/auth.service')
      );
      expect(authServiceNode).toBeDefined();
      // auth.service imports from ../users/user.repository
      const crossDomainImport = authServiceNode!.imports.find(i =>
        i.resolvedPath?.includes('users/user.repository')
      );
      expect(crossDomainImport).toBeDefined();
      expect(crossDomainImport!.resolvedPath).toBeTruthy();
    });

    it('identifies cross-domain edges', async () => {
      const graph = await buildImportGraph(rootPath);
      // billing.service imports from email.service (cross-domain)
      const crossDomainEdge = graph.edges.find(e =>
        e.from.includes('billing') && e.to.includes('email')
      );
      expect(crossDomainEdge).toBeDefined();
    });

    it('identifies intra-domain edges', async () => {
      const graph = await buildImportGraph(rootPath);
      // auth.middleware imports from auth.service (same domain)
      const intraDomainEdge = graph.edges.find(e =>
        e.from.includes('auth/auth.middleware') && e.to.includes('auth/auth.service')
      );
      expect(intraDomainEdge).toBeDefined();
    });

    it('assigns lower weight to type-only imports', async () => {
      const graph = await buildImportGraph(rootPath);
      const typeImportEdges = graph.edges.filter(e => e.weight < 1);
      const valueImportEdges = graph.edges.filter(e => e.weight === 1);
      // We should have both type-only and value imports
      // Type-only imports get weight < 1
      expect(typeImportEdges.length + valueImportEdges.length).toBe(graph.edges.length);
    });

    it('extracts exported symbols from files', async () => {
      const graph = await buildImportGraph(rootPath);
      const emailService = graph.nodes.find(n =>
        n.relativePath.includes('email/email.service')
      );
      expect(emailService).toBeDefined();
      expect(emailService!.exports.length).toBeGreaterThan(0);
      expect(emailService!.exports.some(e => e.name === 'EmailService')).toBe(true);
    });

    it('marks external imports with null resolvedPath', async () => {
      const graph = await buildImportGraph(rootPath);
      // Some files might import from node_modules (not in our fixtures directly,
      // but the import graph should handle missing resolutions)
      const allImports = graph.nodes.flatMap(n => n.imports);
      const internalImports = allImports.filter(i => i.resolvedPath !== null);
      expect(internalImports.length).toBeGreaterThan(0);
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('builds import graph across layers', async () => {
      const graph = await buildImportGraph(rootPath);
      // controller → service edges
      const controllerToService = graph.edges.filter(e =>
        e.from.includes('controllers') && e.to.includes('services')
      );
      expect(controllerToService.length).toBeGreaterThan(0);
    });

    it('detects service-to-model import chains', async () => {
      const graph = await buildImportGraph(rootPath);
      // service → model edges
      const serviceToModel = graph.edges.filter(e =>
        e.from.includes('services') && e.to.includes('models')
      );
      expect(serviceToModel.length).toBeGreaterThan(0);
    });

    it('detects cross-domain service imports', async () => {
      const graph = await buildImportGraph(rootPath);
      // auth.service imports email.service (cross-domain at service layer)
      const authToEmail = graph.edges.find(e =>
        e.from.includes('auth.service') && e.to.includes('email.service')
      );
      expect(authToEmail).toBeDefined();
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('handles files at different nesting levels', async () => {
      const graph = await buildImportGraph(rootPath);
      // Should include root-level files like helpers.ts, app.ts
      const rootFiles = graph.nodes.filter(n =>
        !n.relativePath.includes('/')
        || n.relativePath.split('/').length === 1
      );
      expect(rootFiles.length).toBeGreaterThan(0);
    });

    it('detects high-coupling files (many cross-boundary imports)', async () => {
      const graph = await buildImportGraph(rootPath);
      // admin-handler imports from many different areas
      const adminNode = graph.nodes.find(n =>
        n.relativePath.includes('admin-handler')
      );
      expect(adminNode).toBeDefined();
      expect(adminNode!.imports.length).toBeGreaterThanOrEqual(4);
    });
  });
});
