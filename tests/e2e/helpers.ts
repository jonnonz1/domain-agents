import { resolve, join } from 'path';
import { mkdtemp, rm, cp } from 'fs/promises';
import { tmpdir } from 'os';
import { minimatch } from 'minimatch';
import { runDiscover } from '../../src/cli/discover.js';
import { runInit } from '../../src/cli/init.js';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

export interface FixtureContext {
  tempDir: string;
  cleanup: () => Promise<void>;
}

export async function setupFixture(name: string): Promise<FixtureContext> {
  const tempDir = await mkdtemp(join(tmpdir(), `domain-agents-e2e-${name}-`));
  await cp(resolve(FIXTURES, name), tempDir, { recursive: true });
  await runDiscover(tempDir);
  await runInit(tempDir);
  return {
    tempDir,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

export function parseFrontmatterGlobs(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  const frontmatter = match[1];
  const globs: string[] = [];
  let inGlobs = false;

  for (const line of frontmatter.split('\n')) {
    if (line.trim().startsWith('globs:')) {
      inGlobs = true;
      continue;
    }
    if (inGlobs) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        globs.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''));
      } else {
        break;
      }
    }
  }

  return globs;
}

export function fileMatchesGlobs(filePath: string, globs: string[]): boolean {
  const prefixed = filePath.startsWith('src/') ? filePath : `src/${filePath}`;
  const unprefixed = filePath.replace(/^src\//, '');

  return globs.some(
    g => minimatch(prefixed, g) || minimatch(unprefixed, g),
  );
}

/**
 * Ground truth: fixture → file → expected domain (null = unassigned).
 * Based on current engine output, validated against clustering tests.
 */
export const GROUND_TRUTH: Record<string, Record<string, string | null>> = {
  'feature-organized': {
    'auth/auth.middleware.ts': 'auth',
    'auth/auth.service.ts': 'auth',
    'auth/session.ts': 'auth',
    'auth/types.ts': 'auth',
    'billing/billing.service.ts': 'billing',
    'billing/invoice.ts': 'billing',
    'billing/subscription.ts': 'billing',
    'billing/types.ts': 'billing',
    'email/email.service.ts': 'email',
    'email/template.ts': 'email',
    'email/types.ts': 'email',
    'users/team.ts': 'users',
    'users/types.ts': 'users',
    'users/user.repository.ts': 'users',
    'users/user.service.ts': 'users',
    'shared/config.ts': 'shared',
    'shared/logger.ts': 'shared',
  },

  'layer-organized': {
    'controllers/auth.controller.ts': 'auth',
    'middleware/auth.middleware.ts': 'auth',
    'services/auth.service.ts': 'auth',
    'routes/auth.routes.ts': 'auth',
    'controllers/billing.controller.ts': 'billing',
    'services/billing.service.ts': 'billing',
    'routes/billing.routes.ts': 'billing',
    'models/invoice.model.ts': 'billing',
    'models/subscription.model.ts': 'billing',
    'controllers/email.controller.ts': 'email',
    'services/email.service.ts': 'email',
    'routes/email.routes.ts': 'email',
    'models/email-log.model.ts': 'email',
    'controllers/user.controller.ts': 'user',
    'services/user.service.ts': 'user',
    'routes/user.routes.ts': 'user',
    'models/user.model.ts': 'user',
    'routes/index.ts': null,
    'utils/logger.ts': null,
    'utils/validator.ts': null,
  },

  'mixed': {
    'auth/auth.repository.ts': 'auth',
    'auth/auth.service.ts': 'auth',
    'auth/auth.types.ts': 'auth',
    'services/notification.ts': 'notification',
    'lib/email-client.ts': 'notification',
    'lib/sms-client.ts': 'notification',
    'services/payment.ts': 'payment',
    'lib/stripe-client.ts': 'payment',
    'models/invoice.ts': 'payment',
    'api/user-handler.ts': 'user',
    'models/user.ts': 'user',
    'api/billing-handler.ts': 'user',
    'services/subscription.ts': 'subscription',
    'models/subscription-plan.ts': 'subscription',
    'app.ts': null,
    'constants.ts': null,
    'helpers.ts': null,
    'lib/db.ts': null,
    'api/admin-handler.ts': null,
  },
};

export const FIXTURE_NAMES = ['feature-organized', 'layer-organized', 'mixed'] as const;
