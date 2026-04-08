import { describe, it, expect } from 'vitest';
import { analyzeNaming } from '../../src/discovery/naming.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Naming Analysis', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('identifies naming groups by directory/prefix', async () => {
      const result = await analyzeNaming(rootPath);
      expect(result.groups.length).toBeGreaterThan(0);
    });

    it('groups auth-related files', async () => {
      const result = await analyzeNaming(rootPath);
      const authGroup = result.groups.find(g => g.pattern === 'auth');
      expect(authGroup).toBeDefined();
      expect(authGroup!.files.length).toBeGreaterThanOrEqual(2);
    });

    it('groups email-related files', async () => {
      const result = await analyzeNaming(rootPath);
      const emailGroup = result.groups.find(g => g.pattern === 'email');
      expect(emailGroup).toBeDefined();
      expect(emailGroup!.files.length).toBeGreaterThanOrEqual(2);
    });

    it('groups billing-related files', async () => {
      const result = await analyzeNaming(rootPath);
      const billingGroup = result.groups.find(g => g.pattern === 'billing');
      expect(billingGroup).toBeDefined();
      expect(billingGroup!.files.length).toBeGreaterThanOrEqual(2);
    });

    it('groups user-related files', async () => {
      const result = await analyzeNaming(rootPath);
      const userGroup = result.groups.find(g =>
        g.pattern === 'user' || g.pattern === 'users'
      );
      expect(userGroup).toBeDefined();
      expect(userGroup!.files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('identifies naming groups that span layers', async () => {
      const result = await analyzeNaming(rootPath);
      // Should group auth.controller + auth.service + auth.routes + auth.middleware
      const authGroup = result.groups.find(g => g.pattern === 'auth');
      expect(authGroup).toBeDefined();
      // auth files span across controllers/, services/, routes/, middleware/
      expect(authGroup!.files.length).toBeGreaterThanOrEqual(3);
    });

    it('identifies billing group across layers', async () => {
      const result = await analyzeNaming(rootPath);
      const billingGroup = result.groups.find(g => g.pattern === 'billing');
      expect(billingGroup).toBeDefined();
      // billing.controller + billing.service + billing.routes
      expect(billingGroup!.files.length).toBeGreaterThanOrEqual(3);
    });

    it('identifies email group across layers', async () => {
      const result = await analyzeNaming(rootPath);
      const emailGroup = result.groups.find(g => g.pattern === 'email');
      expect(emailGroup).toBeDefined();
      expect(emailGroup!.files.length).toBeGreaterThanOrEqual(2);
    });

    it('detects framework suffix patterns', async () => {
      const result = await analyzeNaming(rootPath);
      // Should detect .controller, .service, .model, .routes suffixes
      // These are layer indicators, not domain indicators
      const hasControllerPattern = result.groups.some(g =>
        g.matchType === 'suffix' && g.pattern === 'controller'
      );
      const hasServicePattern = result.groups.some(g =>
        g.matchType === 'suffix' && g.pattern === 'service'
      );
      // At least framework suffixes should be detected
      expect(hasControllerPattern || hasServicePattern).toBe(true);
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('identifies auth group from directory name', async () => {
      const result = await analyzeNaming(rootPath);
      const authGroup = result.groups.find(g => g.pattern === 'auth');
      expect(authGroup).toBeDefined();
    });

    it('identifies billing/payment-related files across directories', async () => {
      const result = await analyzeNaming(rootPath);
      // billing-handler.ts, payment.ts, subscription.ts, invoice.ts, stripe-client.ts
      // These might be grouped under different patterns
      const billingGroup = result.groups.find(g =>
        g.pattern === 'billing' || g.pattern === 'payment'
      );
      expect(billingGroup).toBeDefined();
    });

    it('identifies notification/email-related files', async () => {
      const result = await analyzeNaming(rootPath);
      const notifGroup = result.groups.find(g =>
        g.pattern === 'notification' || g.pattern === 'email'
      );
      expect(notifGroup).toBeDefined();
    });
  });
});
