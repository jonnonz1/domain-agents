import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DomainProposal } from '../types.js';

const MAX_FILES_PER_DOMAIN = 8;
const MAX_FILE_SIZE = 4000; // characters per file
const MODEL = 'claude-sonnet-4-20250514';

export interface EnrichedContent {
  purpose: string;
  scalingStage: string;
  techDebt: string[];
  domainRules: string[];
  observability: string;
}

/**
 * Pick the most representative files from a domain for LLM context.
 * Prioritizes service files, avoids tests and generated code.
 */
export function selectKeyFiles(files: string[]): string[] {
  const scored = files.map(f => {
    let score = 0;
    // Prioritize service/business logic files
    if (f.includes('/services/')) score += 10;
    if (f.includes('/lib/')) score += 5;
    if (f.includes('/api/') && f.endsWith('route.ts')) score += 8;
    // Deprioritize tests, types, constants
    if (f.includes('.test.') || f.includes('.spec.') || f.includes('.integration.')) score -= 20;
    if (f.includes('/const/') || f.includes('/constants/')) score -= 5;
    if (f.includes('/types/') || f.includes('types.ts')) score -= 3;
    if (f.includes('index.ts')) score -= 8;
    // Prioritize files with the domain name in them
    if (f.includes('schema')) score += 2;
    // Components are useful for understanding the UI surface
    if (f.endsWith('.tsx')) score += 1;
    return { file: f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_FILES_PER_DOMAIN).map(s => s.file);
}

async function readFileContent(rootPath: string, relativePath: string): Promise<string | null> {
  try {
    const content = await readFile(join(rootPath, relativePath), 'utf-8');
    if (content.length > MAX_FILE_SIZE) {
      return content.slice(0, MAX_FILE_SIZE) + '\n// ... truncated';
    }
    return content;
  } catch {
    return null;
  }
}

export function buildPrompt(domain: DomainProposal, fileContents: { path: string; content: string }[]): string {
  const consumedDomains = Object.entries(domain.coupling)
    .filter(([, score]) => score > 0)
    .map(([name, score]) => `${name} (coupling: ${score.toFixed(2)})`)
    .join(', ');

  const filesSection = fileContents
    .map(f => `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``)
    .join('\n\n');

  return `You are analyzing a business domain within a TypeScript codebase.

## Domain: "${domain.name}"
- **Total files**: ${domain.files.length}
- **Discovery confidence**: ${Math.round(domain.confidence * 100)}%
- **Dependencies on other domains**: ${consumedDomains || 'none detected'}

## Key source files

${filesSection}

## All files in this domain (${domain.files.length} total)

${domain.files.map(f => `- ${f}`).join('\n')}

---

Based on the code above, provide the following analysis. Be specific and grounded in what you see in the code — do not guess or make up details.

1. **PURPOSE** (2-3 sentences): What business problem does this domain solve? What are its core responsibilities? Write this for a developer who needs to understand the domain before making changes.

2. **SCALING_STAGE** (one of: inline, async, queued, service, distributed): What is the current scaling stage based on the code? Look for evidence of queue usage, async patterns, separate service calls, etc. Just the stage name and a one-line justification.

3. **TECH_DEBT** (3-5 bullet points): Specific technical debt or risks you can see in the code. Reference actual patterns, missing abstractions, or coupling issues. Not generic advice.

4. **DOMAIN_RULES** (3-5 bullet points): Business rules or invariants this domain enforces. What must always be true? What constraints exist?

5. **OBSERVABILITY** (2-3 sentences): What instrumentation exists? What's missing? What metrics would help make scaling decisions?

Respond in this exact format:
PURPOSE:
<your text>

SCALING_STAGE:
<stage> — <justification>

TECH_DEBT:
- <item>
- <item>

DOMAIN_RULES:
- <rule>
- <rule>

OBSERVABILITY:
<your text>`;
}

export function parseResponse(text: string): EnrichedContent {
  const sections: Record<string, string> = {};
  const sectionNames = ['PURPOSE', 'SCALING_STAGE', 'TECH_DEBT', 'DOMAIN_RULES', 'OBSERVABILITY'];

  for (let i = 0; i < sectionNames.length; i++) {
    const name = sectionNames[i];
    const nextName = sectionNames[i + 1];
    const startPattern = new RegExp(`${name}:\\s*\\n?`, 'i');
    const startMatch = text.match(startPattern);
    if (!startMatch) continue;

    const startIdx = startMatch.index! + startMatch[0].length;
    let endIdx = text.length;
    if (nextName) {
      const endPattern = new RegExp(`\\n${nextName}:`, 'i');
      const endMatch = text.slice(startIdx).match(endPattern);
      if (endMatch) {
        endIdx = startIdx + endMatch.index!;
      }
    }
    sections[name] = text.slice(startIdx, endIdx).trim();
  }

  return {
    purpose: sections['PURPOSE'] || 'Review and describe the business purpose of this domain.',
    scalingStage: sections['SCALING_STAGE'] || 'inline',
    techDebt: (sections['TECH_DEBT'] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().replace(/^-\s*/, '')),
    domainRules: (sections['DOMAIN_RULES'] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().replace(/^-\s*/, '')),
    observability: sections['OBSERVABILITY'] || 'Add instrumentation to key code paths.',
  };
}

export async function enrichDomain(
  client: Anthropic,
  domain: DomainProposal,
  rootPath: string,
): Promise<EnrichedContent> {
  const keyFiles = selectKeyFiles(domain.files);
  const fileContents: { path: string; content: string }[] = [];

  for (const file of keyFiles) {
    const content = await readFileContent(rootPath, file);
    if (content) {
      fileContents.push({ path: file, content });
    }
  }

  const prompt = buildPrompt(domain, fileContents);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  return parseResponse(text);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function commonDirPrefix(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length > 1) {
      dirs.add(parts.slice(0, -1).join('/') + '/');
    }
  }
  return Array.from(dirs).sort();
}

export function generateEnrichedAgentFile(domain: DomainProposal, enriched: EnrichedContent): string {
  const name = capitalize(domain.name);
  const dirs = commonDirPrefix(domain.files);
  const dirList = dirs.length > 0 ? dirs.map(d => `\`${d}**\``).join(', ') : domain.files.map(f => `\`${f}\``).join(', ');

  const exposedInterfaces = domain.interfaces.filter(i =>
    domain.files.some(f => i.file.includes(f) || f.includes(i.file))
  );
  const consumedDomains = Object.keys(domain.coupling).filter(d => domain.coupling[d] > 0);

  const sections: string[] = [];

  // Title
  sections.push(`# ${name} Agent\n`);

  // Purpose
  sections.push(`## Purpose\n`);
  sections.push(`${enriched.purpose}\n`);

  // Ownership
  sections.push(`## Ownership\n`);
  sections.push(`- **Files**: ${dirList}`);
  sections.push(`- **File count**: ${domain.files.length} files`);
  sections.push(`- **Discovery confidence**: ${Math.round(domain.confidence * 100)}%\n`);

  // Interfaces
  sections.push(`## Interfaces\n`);
  sections.push(`### Exposed (other domains call these)`);
  if (exposedInterfaces.length > 0) {
    for (const iface of exposedInterfaces) {
      sections.push(`- \`${iface.file}\`: ${iface.exports.map(e => `\`${e}\``).join(', ')}`);
      sections.push(`  - Consumed by: ${iface.consumers.join(', ')}`);
    }
  } else {
    sections.push(`- None detected — this domain may be a leaf or consumer-only`);
  }
  sections.push('');
  sections.push(`### Consumed (this domain calls these)`);
  if (consumedDomains.length > 0) {
    for (const dep of consumedDomains) {
      sections.push(`- **${dep}** (coupling score: ${domain.coupling[dep].toFixed(2)})`);
    }
  } else {
    sections.push(`- None detected`);
  }
  sections.push('');

  // Scaling Stage
  sections.push(`## Scaling Stage\n`);
  const stageLine = enriched.scalingStage.split('—')[0].split('–')[0].trim().toLowerCase();
  const stageJustification = enriched.scalingStage.includes('—') || enriched.scalingStage.includes('–')
    ? enriched.scalingStage.split(/[—–]/)[1]?.trim()
    : '';
  sections.push(`**Current: ${capitalize(stageLine)}**\n`);
  if (stageJustification) {
    sections.push(`${stageJustification}\n`);
  }
  sections.push(`### Evolution Path`);
  sections.push(`- **Inline** → **Async** (fire-and-forget via event loop)`);
  sections.push(`- **Async** → **Queued** (adds retry, persistence, backpressure)`);
  sections.push(`- **Queued** → **Separate Service** (own deployment, own database, same interface)`);
  sections.push(`- **Separate Service** → **Distributed** (own infrastructure, independent scaling)\n`);

  // Technical Debt
  sections.push(`## Technical Debt\n`);
  if (enriched.techDebt.length > 0) {
    for (const item of enriched.techDebt) {
      sections.push(`- [ ] ${item}`);
    }
  } else {
    sections.push(`- [ ] Review and document interface contracts`);
    sections.push(`- [ ] Identify provider coupling`);
    sections.push(`- [ ] Error handling coverage`);
  }
  sections.push('');

  // Observability
  sections.push(`## Observability\n`);
  sections.push(`${enriched.observability}\n`);

  // Domain Rules
  sections.push(`## Domain Rules\n`);
  if (enriched.domainRules.length > 0) {
    for (const rule of enriched.domainRules) {
      sections.push(`- ${rule}`);
    }
  } else {
    sections.push(`- All access to ${domain.name} functionality MUST go through the defined interfaces`);
    sections.push(`- Interface changes must be backwards-compatible or coordinated with consumers`);
  }
  if (consumedDomains.length > 0) {
    sections.push(`- Changes affecting ${consumedDomains.join(', ')} require cross-domain review`);
  }
  sections.push('');

  // Context for AI Agents
  sections.push(`## Context for AI Agents\n`);
  sections.push(`When working in this domain:`);
  sections.push(`- **Check tech debt** before implementing features`);
  sections.push(`- **Preserve interface contracts** — implementation can change, but signatures and behavior must remain stable`);
  sections.push(`- **Consider the evolution path** — is this implementation easy to replace when the domain scales?`);
  if (consumedDomains.length > 0) {
    sections.push(`- **Cross-domain awareness**: depends on ${consumedDomains.join(', ')}`);
  }
  sections.push('');

  return sections.join('\n');
}

export function createClient(): Anthropic {
  // SDK reads ANTHROPIC_API_KEY from environment automatically
  return new Anthropic();
}
