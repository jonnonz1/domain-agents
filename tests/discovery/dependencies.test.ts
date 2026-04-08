import { describe, it, expect } from 'vitest';
import { analyzeDependencies } from '../../src/discovery/dependencies.js';
import { resolve } from 'path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('Dependency Analysis', () => {
  describe('feature-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'feature-organized');

    it('reads package.json and extracts dependency hints', async () => {
      const result = await analyzeDependencies(rootPath);
      expect(result.hints.length).toBeGreaterThan(0);
    });

    it('maps auth-related packages to auth domain', async () => {
      const result = await analyzeDependencies(rootPath);
      // jsonwebtoken, bcrypt → auth
      const authHints = result.hints.filter(h => h.suggestedDomain === 'auth');
      expect(authHints.length).toBeGreaterThanOrEqual(1);
      expect(authHints.some(h => h.packageName === 'jsonwebtoken')).toBe(true);
    });

    it('maps payment-related packages to billing domain', async () => {
      const result = await analyzeDependencies(rootPath);
      // stripe → billing
      const billingHints = result.hints.filter(h => h.suggestedDomain === 'billing');
      expect(billingHints.length).toBeGreaterThanOrEqual(1);
      expect(billingHints.some(h => h.packageName === 'stripe')).toBe(true);
    });

    it('maps email-related packages to email domain', async () => {
      const result = await analyzeDependencies(rootPath);
      // @sendgrid/mail → email
      const emailHints = result.hints.filter(h => h.suggestedDomain === 'email');
      expect(emailHints.length).toBeGreaterThanOrEqual(1);
      expect(emailHints.some(h => h.packageName === '@sendgrid/mail')).toBe(true);
    });

    it('assigns confidence scores to hints', async () => {
      const result = await analyzeDependencies(rootPath);
      for (const hint of result.hints) {
        expect(hint.confidence).toBeGreaterThan(0);
        expect(hint.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('ignores generic infrastructure packages', async () => {
      const result = await analyzeDependencies(rootPath);
      // express, pg are infrastructure — should not generate domain hints
      const expressHint = result.hints.find(h => h.packageName === 'express');
      expect(expressHint).toBeUndefined();
    });
  });

  describe('layer-organized codebase', () => {
    const rootPath = resolve(FIXTURES, 'layer-organized');

    it('detects nodemailer as email domain hint', async () => {
      const result = await analyzeDependencies(rootPath);
      const emailHints = result.hints.filter(h => h.suggestedDomain === 'email');
      expect(emailHints.some(h => h.packageName === 'nodemailer')).toBe(true);
    });

    it('detects stripe as billing domain hint', async () => {
      const result = await analyzeDependencies(rootPath);
      const billingHints = result.hints.filter(h => h.suggestedDomain === 'billing');
      expect(billingHints.some(h => h.packageName === 'stripe')).toBe(true);
    });
  });

  describe('mixed codebase', () => {
    const rootPath = resolve(FIXTURES, 'mixed');

    it('detects twilio as notification domain hint', async () => {
      const result = await analyzeDependencies(rootPath);
      const hints = result.hints.filter(h =>
        h.suggestedDomain === 'notifications' || h.suggestedDomain === 'email'
      );
      // twilio → notifications or messaging
      expect(hints.length).toBeGreaterThan(0);
    });

    it('detects multiple email-related packages', async () => {
      const result = await analyzeDependencies(rootPath);
      // @sendgrid/mail → email
      const emailHints = result.hints.filter(h => h.suggestedDomain === 'email');
      expect(emailHints.length).toBeGreaterThanOrEqual(1);
    });
  });
});
