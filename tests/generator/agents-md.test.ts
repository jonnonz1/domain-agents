import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from '../../src/generator/agents-md.js';
import type { DiscoveryResult } from '../../src/types.js';

describe('AGENTS.md Generation', () => {
  const mockResult: DiscoveryResult = {
    rootPath: '/app',
    files: [],
    edges: [],
    domains: [
      {
        name: 'auth',
        files: ['src/auth/auth.service.ts', 'src/auth/session.ts'],
        confidence: 0.94,
        signals: [{ type: 'directory', description: 'auth/ directory', strength: 0.95 }],
        interfaces: [
          { file: 'src/auth/auth.service.ts', exports: ['AuthService'], consumers: ['billing'] },
        ],
        coupling: { billing: 0.1, users: 0.15 },
      },
      {
        name: 'billing',
        files: ['src/billing/billing.service.ts', 'src/billing/invoice.ts'],
        confidence: 0.89,
        signals: [{ type: 'directory', description: 'billing/ directory', strength: 0.9 }],
        interfaces: [
          { file: 'src/billing/billing.service.ts', exports: ['BillingService'], consumers: ['users'] },
        ],
        coupling: { auth: 0.1, email: 0.23, users: 0.2 },
      },
      {
        name: 'email',
        files: ['src/email/email.service.ts', 'src/email/template.ts'],
        confidence: 0.91,
        signals: [{ type: 'directory', description: 'email/ directory', strength: 0.95 }],
        interfaces: [
          { file: 'src/email/email.service.ts', exports: ['EmailService'], consumers: ['billing', 'users'] },
        ],
        coupling: { billing: 0.23, users: 0.08 },
      },
      {
        name: 'users',
        files: ['src/users/user.service.ts', 'src/users/user.repository.ts'],
        confidence: 0.86,
        signals: [{ type: 'directory', description: 'users/ directory', strength: 0.9 }],
        interfaces: [
          { file: 'src/users/user.repository.ts', exports: ['UserRepository'], consumers: ['auth', 'billing'] },
        ],
        coupling: { auth: 0.15, billing: 0.2, email: 0.08 },
      },
    ],
    unassigned: ['src/shared/logger.ts', 'src/shared/config.ts'],
  };

  it('generates valid markdown with title', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('# System Agents Map');
  });

  it('includes overview section', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Overview');
  });

  it('includes domain table with all domains', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Domains');
    expect(content).toContain('auth');
    expect(content).toContain('billing');
    expect(content).toContain('email');
    expect(content).toContain('users');
  });

  it('links to agent files in the domain table', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('agents/auth.md');
    expect(content).toContain('agents/billing.md');
    expect(content).toContain('agents/email.md');
    expect(content).toContain('agents/users.md');
  });

  it('includes scaling stage column (defaulting to Inline)', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('Inline');
  });

  it('includes domain dependency graph', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Domain Dependency Graph');
  });

  it('includes cross-domain contracts section', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Cross-Domain Contracts');
    // Should document interface points
    expect(content).toContain('EmailService');
    expect(content).toContain('AuthService');
  });

  it('includes global architecture rules', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Global Architecture Rules');
  });

  it('includes observability guidance in rules', () => {
    const content = generateAgentsMd(mockResult);
    // Key thesis: observability is first-class
    expect(content).toMatch(/observ|instrument|metric/i);
  });

  it('includes unassigned files section when present', () => {
    const content = generateAgentsMd(mockResult);
    expect(content).toContain('## Unassigned Files');
    expect(content).toContain('logger.ts');
    expect(content).toContain('config.ts');
  });

  it('omits unassigned section when no unassigned files', () => {
    const noUnassigned = { ...mockResult, unassigned: [] };
    const content = generateAgentsMd(noUnassigned);
    expect(content).not.toContain('## Unassigned Files');
  });

  it('includes tech debt consensus guidance', () => {
    const content = generateAgentsMd(mockResult);
    // Key thesis: tech debt from each domain informs feature development
    expect(content).toMatch(/tech debt|technical debt/i);
  });
});
