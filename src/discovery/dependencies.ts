import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DependencyAnalysis, DependencyHint } from '../types.js';

interface PackageDomainMapping {
  packages: string[];
  domain: string;
  confidence: number;
}

const DOMAIN_MAPPINGS: PackageDomainMapping[] = [
  // Auth
  { packages: ['jsonwebtoken', 'jwt-simple', 'jose', 'passport', 'passport-local', 'passport-jwt', 'bcrypt', 'bcryptjs', 'argon2', '@auth0/nextjs-auth0', 'next-auth', 'lucia'], domain: 'auth', confidence: 0.85 },
  // Billing / Payments
  { packages: ['stripe', '@stripe/stripe-js', '@paddle/paddle-node-sdk', 'braintree', 'paypal-rest-sdk', '@paypal/checkout-server-sdk', 'square', 'chargebee', 'lemon-squeezy'], domain: 'billing', confidence: 0.9 },
  // Email
  { packages: ['@sendgrid/mail', '@sendgrid/client', 'nodemailer', 'postmark', '@mailgun/mailgun.js', 'mailgun-js', 'ses-transport', '@aws-sdk/client-ses', 'resend'], domain: 'email', confidence: 0.85 },
  // Notifications / Messaging
  { packages: ['twilio', '@slack/web-api', '@slack/bolt', 'firebase-admin', 'web-push', 'onesignal-node', '@pusher/push-notifications-server'], domain: 'notifications', confidence: 0.8 },
  // Storage / Media
  { packages: ['@aws-sdk/client-s3', 'multer', 'sharp', 'cloudinary', '@google-cloud/storage', 'minio'], domain: 'storage', confidence: 0.8 },
  // Search
  { packages: ['@elastic/elasticsearch', 'algoliasearch', 'meilisearch', 'typesense'], domain: 'search', confidence: 0.85 },
  // Analytics
  { packages: ['@segment/analytics-node', 'mixpanel', 'posthog-node', '@amplitude/node'], domain: 'analytics', confidence: 0.8 },
];

// Infrastructure packages that should NOT generate domain hints
const INFRASTRUCTURE_PACKAGES = new Set([
  'express', 'fastify', 'koa', 'hapi', 'next', 'nuxt',
  'react', 'react-dom', 'vue', 'angular', 'svelte',
  'typescript', 'ts-node', 'tsx',
  'pg', 'mysql2', 'mongodb', 'mongoose', 'sequelize', 'prisma', '@prisma/client', 'knex', 'drizzle-orm', 'typeorm',
  'redis', 'ioredis',
  'winston', 'pino', 'bunyan',
  'jest', 'vitest', 'mocha', 'chai',
  'eslint', 'prettier',
  'dotenv', 'zod', 'joi', 'yup',
  'axios', 'node-fetch', 'got',
  'lodash', 'underscore', 'ramda',
  'uuid', 'nanoid',
  'cors', 'helmet', 'compression',
  'bull', 'bullmq', 'amqplib', // queue infra, not domain-specific
]);

export async function analyzeDependencies(rootPath: string): Promise<DependencyAnalysis> {
  const packageJsonPath = join(rootPath, 'package.json');
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    return { hints: [] };
  }

  const allDeps = Object.keys(packageJson.dependencies ?? {});
  const hints: DependencyHint[] = [];

  for (const dep of allDeps) {
    if (INFRASTRUCTURE_PACKAGES.has(dep)) continue;

    for (const mapping of DOMAIN_MAPPINGS) {
      if (mapping.packages.includes(dep)) {
        hints.push({
          packageName: dep,
          suggestedDomain: mapping.domain,
          confidence: mapping.confidence,
        });
        break;
      }
    }
  }

  return { hints };
}
