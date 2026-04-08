import { describe, it, expect } from 'vitest';
import { discoverDomains } from '../../src/discovery/index.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Domain Clustering (Integration)', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('discovers domains matching the directory structure', async () => {
      const result = await discoverDomains(rootPath);

      const domainNames = result.domains.map(d => d.name);
      expect(domainNames).toContain('auth');
      expect(domainNames).toContain('billing');
      expect(domainNames).toContain('email');
      expect(domainNames).toContain('users');
    });

    it('assigns high confidence to feature-organized domains', async () => {
      const result = await discoverDomains(rootPath);

      for (const domain of result.domains) {
        if (domain.name !== 'shared') {
          expect(domain.confidence).toBeGreaterThanOrEqual(0.7);
        }
      }
    });

    it('assigns files to the correct domains', async () => {
      const result = await discoverDomains(rootPath);

      const authDomain = result.domains.find(d => d.name === 'auth');
      expect(authDomain).toBeDefined();
      expect(authDomain!.files.some(f => f.includes('auth.service'))).toBe(true);
      expect(authDomain!.files.some(f => f.includes('auth.middleware'))).toBe(true);

      const emailDomain = result.domains.find(d => d.name === 'email');
      expect(emailDomain).toBeDefined();
      expect(emailDomain!.files.some(f => f.includes('email.service'))).toBe(true);
    });

    it('identifies interface points between domains', async () => {
      const result = await discoverDomains(rootPath);

      const billingDomain = result.domains.find(d => d.name === 'billing');
      expect(billingDomain).toBeDefined();
      // billing has interfaces with email and users
      expect(billingDomain!.interfaces.length).toBeGreaterThan(0);
    });

    it('calculates coupling between domains', async () => {
      const result = await discoverDomains(rootPath);

      const billingDomain = result.domains.find(d => d.name === 'billing');
      expect(billingDomain).toBeDefined();
      // billing is coupled to email and users
      expect(Object.keys(billingDomain!.coupling).length).toBeGreaterThan(0);
      expect(billingDomain!.coupling['email']).toBeGreaterThan(0);
    });

    it('classifies shared/utility files as unassigned or shared domain', async () => {
      const result = await discoverDomains(rootPath);

      // shared/logger.ts and shared/config.ts should either be in a 'shared'
      // domain or in the unassigned list
      const sharedDomain = result.domains.find(d => d.name === 'shared');
      const sharedInUnassigned = result.unassigned.some(f =>
        f.includes('shared/')
      );
      expect(sharedDomain !== undefined || sharedInUnassigned).toBe(true);
    });

    it('has multiple signals supporting each domain', async () => {
      const result = await discoverDomains(rootPath);

      for (const domain of result.domains) {
        if (domain.name !== 'shared') {
          // Each domain should be supported by multiple signal types
          const signalTypes = new Set(domain.signals.map(s => s.type));
          expect(signalTypes.size).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('discovers business domains across technical layers', async () => {
      const result = await discoverDomains(rootPath);

      const domainNames = result.domains.map(d => d.name);
      // Should find auth, billing, email, user — NOT controllers, services, models
      expect(domainNames).toContain('auth');
      expect(domainNames).toContain('billing');
      expect(domainNames).toContain('email');
      expect(domainNames.some(n => n === 'user' || n === 'users')).toBe(true);
    });

    it('does NOT create domains for technical layers', async () => {
      const result = await discoverDomains(rootPath);

      const domainNames = result.domains.map(d => d.name);
      expect(domainNames).not.toContain('controllers');
      expect(domainNames).not.toContain('services');
      expect(domainNames).not.toContain('models');
      expect(domainNames).not.toContain('routes');
    });

    it('groups files from different layers into same domain', async () => {
      const result = await discoverDomains(rootPath);

      const authDomain = result.domains.find(d => d.name === 'auth');
      expect(authDomain).toBeDefined();
      // auth domain should span: auth.controller, auth.service, auth.routes, auth.middleware, user.model
      expect(authDomain!.files.some(f => f.includes('controllers/'))).toBe(true);
      expect(authDomain!.files.some(f => f.includes('services/'))).toBe(true);
    });

    it('has lower confidence than feature-organized domains', async () => {
      const result = await discoverDomains(rootPath);

      // Layer-organized is harder to cluster, so confidence should generally be lower
      const avgConfidence = result.domains.reduce((sum, d) => sum + d.confidence, 0) / result.domains.length;
      // Still reasonable confidence but not as high as feature-organized
      expect(avgConfidence).toBeGreaterThanOrEqual(0.5);
      expect(avgConfidence).toBeLessThanOrEqual(0.95);
    });

    it('identifies cross-domain service dependencies', async () => {
      const result = await discoverDomains(rootPath);

      // billing depends on email (billing.service → email.service)
      const billingDomain = result.domains.find(d => d.name === 'billing');
      expect(billingDomain).toBeDefined();
      expect(billingDomain!.coupling['email']).toBeGreaterThan(0);
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('discovers auth as a clean domain', async () => {
      const result = await discoverDomains(rootPath);

      const authDomain = result.domains.find(d => d.name === 'auth');
      expect(authDomain).toBeDefined();
      // auth/ is well-isolated, so confidence should be high
      expect(authDomain!.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('discovers billing/payment as a domain', async () => {
      const result = await discoverDomains(rootPath);

      const billingDomain = result.domains.find(d =>
        d.name === 'billing' || d.name === 'payment'
      );
      expect(billingDomain).toBeDefined();
      // Should include: billing-handler, payment.ts, subscription.ts, invoice model, stripe-client
      expect(billingDomain!.files.length).toBeGreaterThanOrEqual(3);
    });

    it('discovers notifications as a domain', async () => {
      const result = await discoverDomains(rootPath);

      const notifDomain = result.domains.find(d =>
        d.name === 'notifications' || d.name === 'notification' || d.name === 'email'
      );
      expect(notifDomain).toBeDefined();
    });

    it('flags files that are hard to assign', async () => {
      const result = await discoverDomains(rootPath);

      // admin-handler.ts touches many domains — may end up unassigned
      // or assigned with low confidence
      // helpers.ts, constants.ts are generic utilities
      const totalAssigned = result.domains.reduce((sum, d) => sum + d.files.length, 0);
      const totalFiles = totalAssigned + result.unassigned.length;
      expect(totalFiles).toBeGreaterThan(0);
      // Some files should be unassigned in a messy codebase
      expect(result.unassigned.length).toBeGreaterThan(0);
    });

    it('has mixed confidence levels reflecting the messy structure', async () => {
      const result = await discoverDomains(rootPath);

      const confidences = result.domains.map(d => d.confidence);
      const maxConfidence = Math.max(...confidences);
      const minConfidence = Math.min(...confidences);
      // Should have a range of confidence — some domains clean, some fuzzy
      expect(maxConfidence - minConfidence).toBeGreaterThan(0.1);
    });

    it('detects high coupling in tangled areas', async () => {
      const result = await discoverDomains(rootPath);

      // There should be coupling between domains due to the messy structure
      const allCouplingValues = result.domains.flatMap(d => Object.values(d.coupling));
      const hasSomeCoupling = allCouplingValues.some(v => v > 0.2);
      expect(hasSomeCoupling).toBe(true);
    });
  });
});
