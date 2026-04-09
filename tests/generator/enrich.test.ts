import { describe, it, expect } from 'vitest';
import { selectKeyFiles, parseResponse, buildPrompt, generateEnrichedAgentFile } from '../../src/generator/enrich.js';
import type { DomainProposal } from '../../src/types.js';

const mockDomain: DomainProposal = {
  name: 'journals',
  files: [
    'lib/services/journal/journal.ts',
    'lib/services/journal/journal.test.ts',
    'lib/schema/journal.ts',
    'lib/const/journal-types.ts',
    'lib/interfaces/models/journal.ts',
    'components/journals/journal-form.tsx',
    'components/journals/lines/cells/amount-cell.tsx',
    'hooks/use-manual-journals.ts',
    'app/api/journals/route.ts',
    'app/(app)/journals/page.tsx',
    'lib/utils/journal.ts',
    'lib/queries/journal.ts',
  ],
  confidence: 0.45,
  signals: [
    { type: 'imports', description: '65% of imports are internal', strength: 0.65 },
    { type: 'naming', description: '12 files match journal pattern', strength: 0.7 },
  ],
  interfaces: [
    {
      file: 'lib/services/journal/journal.ts',
      exports: ['createJournal', 'postJournal', 'voidJournal'],
      consumers: ['transactions', 'bank-accounts'],
    },
  ],
  coupling: {
    entities: 0.15,
    transactions: 0.08,
    'bank-accounts': 0.05,
  },
};

describe('selectKeyFiles', () => {
  it('prioritizes service files over tests', () => {
    const files = [
      'lib/services/journal/journal.test.ts',
      'lib/services/journal/journal.ts',
    ];
    const selected = selectKeyFiles(files);
    expect(selected[0]).toBe('lib/services/journal/journal.ts');
  });

  it('prioritizes API routes', () => {
    const files = [
      'components/journals/journal-form.tsx',
      'app/api/journals/route.ts',
      'lib/const/journal-types.ts',
    ];
    const selected = selectKeyFiles(files);
    expect(selected[0]).toBe('app/api/journals/route.ts');
  });

  it('deprioritizes test files', () => {
    const files = [
      'lib/services/journal/journal.test.ts',
      'lib/services/journal/journal.integration.test.ts',
      'lib/services/journal/journal.ts',
      'lib/schema/journal.ts',
    ];
    const selected = selectKeyFiles(files);
    // Test files should be at the end
    const testIdx = selected.findIndex(f => f.includes('.test.'));
    const serviceIdx = selected.findIndex(f => f === 'lib/services/journal/journal.ts');
    if (testIdx !== -1) {
      expect(serviceIdx).toBeLessThan(testIdx);
    }
  });

  it('deprioritizes index files', () => {
    const files = [
      'lib/services/journal/index.ts',
      'lib/services/journal/journal.ts',
    ];
    const selected = selectKeyFiles(files);
    expect(selected[0]).toBe('lib/services/journal/journal.ts');
  });

  it('limits to MAX_FILES_PER_DOMAIN (8)', () => {
    const files = Array.from({ length: 20 }, (_, i) => `lib/services/module-${i}.ts`);
    const selected = selectKeyFiles(files);
    expect(selected.length).toBe(8);
  });

  it('handles empty file list', () => {
    expect(selectKeyFiles([])).toEqual([]);
  });
});

describe('parseResponse', () => {
  it('parses a well-formatted LLM response', () => {
    const response = `PURPOSE:
Manages journal entries including creation, posting, voiding, and inter-entity transfers. Enforces double-entry accounting rules.

SCALING_STAGE:
inline — All journal operations are synchronous database transactions

TECH_DEBT:
- The journal service has grown large (800+ lines) and should be split into creation, posting, and voiding modules
- No validation abstraction — business rules are inline in service methods
- Inter-entity transfer logic is tightly coupled to journal creation

DOMAIN_RULES:
- Journal lines must always sum to zero (debit = credit)
- Posted journals cannot be edited, only voided and re-created
- Inter-entity transfers must create matching journals in both entities

OBSERVABILITY:
The journal service has basic Sentry error tracking but no custom metrics. Missing: journal creation rate, average lines per journal, void frequency, inter-entity transfer volume.`;

    const result = parseResponse(response);

    expect(result.purpose).toContain('journal entries');
    expect(result.purpose).toContain('double-entry');
    expect(result.scalingStage).toContain('inline');
    expect(result.techDebt).toHaveLength(3);
    expect(result.techDebt[0]).toContain('grown large');
    expect(result.domainRules).toHaveLength(3);
    expect(result.domainRules[0]).toContain('sum to zero');
    expect(result.observability).toContain('Sentry');
  });

  it('handles missing sections gracefully', () => {
    const response = `PURPOSE:
This domain handles payments.

SCALING_STAGE:
queued`;

    const result = parseResponse(response);

    expect(result.purpose).toContain('payments');
    expect(result.scalingStage).toContain('queued');
    expect(result.techDebt).toEqual([]);
    expect(result.domainRules).toEqual([]);
    expect(result.observability).toBe('Add instrumentation to key code paths.');
  });

  it('handles completely empty response', () => {
    const result = parseResponse('');

    expect(result.purpose).toContain('Review and describe');
    expect(result.scalingStage).toBe('inline');
    expect(result.techDebt).toEqual([]);
    expect(result.domainRules).toEqual([]);
  });

  it('handles response with extra whitespace and formatting', () => {
    const response = `
PURPOSE:

  Handles user authentication and session management.


SCALING_STAGE:
  async — Uses background token refresh

TECH_DEBT:
  - Session tokens stored in cookies without rotation
  - No rate limiting on login attempts

DOMAIN_RULES:
  - All routes require authentication unless explicitly marked public
  - Sessions expire after 24 hours

OBSERVABILITY:
  Login success/failure rates tracked via analytics. No latency metrics.
`;

    const result = parseResponse(response);
    expect(result.purpose).toContain('authentication');
    expect(result.scalingStage).toContain('async');
    expect(result.techDebt).toHaveLength(2);
    expect(result.domainRules).toHaveLength(2);
  });
});

describe('buildPrompt', () => {
  it('includes domain metadata', () => {
    const prompt = buildPrompt(mockDomain, [
      { path: 'lib/services/journal/journal.ts', content: 'export function createJournal() {}' },
    ]);

    expect(prompt).toContain('"journals"');
    expect(prompt).toContain('12'); // file count
    expect(prompt).toContain('45%'); // confidence
  });

  it('includes file contents with code blocks', () => {
    const prompt = buildPrompt(mockDomain, [
      { path: 'lib/services/journal/journal.ts', content: 'export function createJournal() {}' },
    ]);

    expect(prompt).toContain('### lib/services/journal/journal.ts');
    expect(prompt).toContain('```typescript');
    expect(prompt).toContain('createJournal');
  });

  it('lists all domain files', () => {
    const prompt = buildPrompt(mockDomain, []);

    expect(prompt).toContain('- lib/services/journal/journal.ts');
    expect(prompt).toContain('- components/journals/journal-form.tsx');
    expect(prompt).toContain('- app/api/journals/route.ts');
  });

  it('includes coupling information', () => {
    const prompt = buildPrompt(mockDomain, []);

    expect(prompt).toContain('entities');
    expect(prompt).toContain('transactions');
    expect(prompt).toContain('bank-accounts');
  });

  it('asks for all required sections', () => {
    const prompt = buildPrompt(mockDomain, []);

    expect(prompt).toContain('PURPOSE');
    expect(prompt).toContain('SCALING_STAGE');
    expect(prompt).toContain('TECH_DEBT');
    expect(prompt).toContain('DOMAIN_RULES');
    expect(prompt).toContain('OBSERVABILITY');
  });
});

describe('generateEnrichedAgentFile', () => {
  const enriched = {
    purpose: 'Manages journal entries including creation, posting, voiding, and inter-entity transfers. Enforces double-entry accounting rules ensuring debits always equal credits.',
    scalingStage: 'inline — All journal operations are synchronous database transactions',
    techDebt: [
      'The journal service has grown large and should be split',
      'No validation abstraction for business rules',
    ],
    domainRules: [
      'Journal lines must always sum to zero (debit = credit)',
      'Posted journals cannot be edited, only voided',
    ],
    observability: 'Basic Sentry error tracking. Missing: journal creation rate, void frequency.',
  };

  it('includes the enriched purpose instead of placeholder', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('Manages journal entries');
    expect(content).toContain('double-entry accounting');
    expect(content).not.toContain('Review and expand this description');
  });

  it('includes the detected scaling stage', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('**Current: Inline**');
    expect(content).toContain('All journal operations are synchronous');
  });

  it('includes specific tech debt items as checkboxes', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('- [ ] The journal service has grown large');
    expect(content).toContain('- [ ] No validation abstraction');
  });

  it('includes domain rules', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('Journal lines must always sum to zero');
    expect(content).toContain('Posted journals cannot be edited');
  });

  it('includes observability assessment', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('Basic Sentry error tracking');
    expect(content).toContain('journal creation rate');
  });

  it('includes interface information from discovery', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('createJournal');
    expect(content).toContain('postJournal');
    expect(content).toContain('voidJournal');
    expect(content).toContain('transactions');
  });

  it('includes ownership metadata', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('12 files');
    expect(content).toContain('45%');
  });

  it('lists consumed domains with cross-domain review rule', () => {
    const content = generateEnrichedAgentFile(mockDomain, enriched);

    expect(content).toContain('**entities**');
    expect(content).toContain('require cross-domain review');
  });

  it('falls back gracefully when enriched content is empty', () => {
    const emptyEnriched = {
      purpose: '',
      scalingStage: '',
      techDebt: [],
      domainRules: [],
      observability: '',
    };

    const content = generateEnrichedAgentFile(mockDomain, emptyEnriched);

    // Should still produce valid markdown with fallback content
    expect(content).toContain('# Journals Agent');
    expect(content).toContain('## Ownership');
    // Fallback tech debt items when none provided
    expect(content).toContain('Review and document interface contracts');
  });
});
