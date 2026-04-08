import { describe, it, expect } from 'vitest';
import { detectInterfaces } from '../../src/discovery/interfaces.js';
import { buildImportGraph } from '../../src/discovery/imports.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Interface Detection', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('identifies cross-domain interface points', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      expect(result.interfaces.length).toBeGreaterThan(0);
    });

    it('identifies email.service as an interface point', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // email.service is imported by billing.service and user.service
      const emailInterface = result.interfaces.find(i =>
        i.file.includes('email/email.service')
      );
      expect(emailInterface).toBeDefined();
      expect(emailInterface!.consumers.length).toBeGreaterThanOrEqual(2);
    });

    it('identifies user.repository as an interface point', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // user.repository is imported by auth.service, billing.service, subscription
      const userRepoInterface = result.interfaces.find(i =>
        i.file.includes('users/user.repository')
      );
      expect(userRepoInterface).toBeDefined();
      expect(userRepoInterface!.consumers.length).toBeGreaterThanOrEqual(2);
    });

    it('does not flag intra-domain imports as interfaces', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // auth.service → auth.middleware is intra-domain, not an interface
      // session.ts is only used within auth — shouldn't be flagged
      const sessionInterface = result.interfaces.find(i =>
        i.file.includes('auth/session')
      );
      expect(sessionInterface).toBeUndefined();
    });

    it('calculates coupling scores between domains', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      expect(result.couplingScores.length).toBeGreaterThan(0);

      // billing ↔ email should have coupling
      const billingEmailCoupling = result.couplingScores.find(c =>
        (c.domainA === 'billing' && c.domainB === 'email') ||
        (c.domainA === 'email' && c.domainB === 'billing')
      );
      expect(billingEmailCoupling).toBeDefined();
      expect(billingEmailCoupling!.score).toBeGreaterThan(0);
    });

    it('coupling scores are between 0 and 1', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      for (const coupling of result.couplingScores) {
        expect(coupling.score).toBeGreaterThanOrEqual(0);
        expect(coupling.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('identifies service files as interface points across layers', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // In a layer-organized codebase, services that are imported by
      // controllers from different business domains are interface points
      expect(result.interfaces.length).toBeGreaterThan(0);
    });

    it('detects email.service as consumed by multiple business domains', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      const emailServiceInterface = result.interfaces.find(i =>
        i.file.includes('email.service')
      );
      expect(emailServiceInterface).toBeDefined();
      // auth.service and billing.service both import email.service
      expect(emailServiceInterface!.consumers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('identifies user model as high-coupling point', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // user.ts model is imported by many different areas
      const userModelInterface = result.interfaces.find(i =>
        i.file.includes('models/user')
      );
      expect(userModelInterface).toBeDefined();
      expect(userModelInterface!.consumers.length).toBeGreaterThanOrEqual(3);
    });

    it('identifies admin-handler as coupling hotspot in scores', async () => {
      const graph = await buildImportGraph(rootPath);
      const result = await detectInterfaces(graph, rootPath);

      // admin-handler imports from many domains — coupling should be reflected
      expect(result.couplingScores.length).toBeGreaterThan(0);
    });
  });
});
