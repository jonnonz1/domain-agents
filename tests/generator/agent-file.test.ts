import { describe, it, expect } from 'vitest';
import { generateAgentFile } from '../../src/generator/agent-file.js';
import type { DomainProposal } from '../../src/types.js';

describe('Agent File Generation', () => {
  const mockDomain: DomainProposal = {
    name: 'email',
    files: [
      'src/email/email.service.ts',
      'src/email/template.ts',
      'src/email/types.ts',
    ],
    confidence: 0.91,
    signals: [
      { type: 'directory', description: 'src/email/ exists as distinct directory', strength: 0.95 },
      { type: 'imports', description: '87% of imports are internal to cluster', strength: 0.85 },
      { type: 'dependency', description: 'uses @sendgrid/mail', strength: 0.8 },
    ],
    interfaces: [
      {
        file: 'src/email/email.service.ts',
        exports: ['EmailService', 'sendEmail', 'scheduleEmail'],
        consumers: ['billing', 'users'],
      },
    ],
    coupling: {
      billing: 0.23,
      users: 0.08,
      auth: 0.15,
    },
  };

  it('generates valid markdown', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('# Email Agent');
  });

  it('includes purpose section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Purpose');
  });

  it('includes ownership section with file paths', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Ownership');
    expect(content).toContain('src/email/');
  });

  it('includes interfaces section with exposed and consumed', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Interfaces');
    expect(content).toContain('EmailService');
    expect(content).toContain('billing');
    expect(content).toContain('users');
  });

  it('includes scaling stage section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Scaling Stage');
    expect(content).toContain('Inline');
  });

  it('includes technical debt section with placeholders', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Technical Debt');
    // Should have placeholder items based on analysis
    expect(content).toContain('- [ ]');
  });

  it('includes observability section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Observability');
    // Should encourage data-driven decisions
    expect(content).toMatch(/metric|instrument|monitor/i);
  });

  it('includes observability gaps section encouraging data gathering', () => {
    const content = generateAgentFile(mockDomain);
    // Key thesis point: agents should have a strong preference for gathering data
    expect(content).toContain('### Gaps');
  });

  it('includes scaling triggers section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('### Scaling Triggers');
  });

  it('includes domain rules section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Domain Rules');
  });

  it('includes context section for AI agents', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('## Context for AI Agents');
    // Should reference tech debt awareness
    expect(content).toMatch(/tech debt|technical debt/i);
    // Should reference observability
    expect(content).toMatch(/observ|metric|instrument/i);
  });

  it('includes evolution path section', () => {
    const content = generateAgentFile(mockDomain);
    expect(content).toContain('### Evolution Path');
  });

  it('uses coupling data to document dependencies', () => {
    const content = generateAgentFile(mockDomain);
    // Should document which domains this one is coupled to
    expect(content).toContain('billing');
    expect(content).toContain('auth');
  });
});
