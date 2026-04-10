import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { createLookup } from './lookup.js';
import type { DomainProposal } from '../types.js';

export interface ClaudeHooksResult {
  settingsPath: string;
  rulesPath: string;
  domainRuleFiles: string[];
  hookScript: string;
}

/**
 * Find the nearest .claude/ directory by walking up from rootPath.
 * Returns the .claude directory path, or rootPath/.claude if none found.
 */
async function findClaudeDir(rootPath: string): Promise<string> {
  let dir = resolve(rootPath);
  const root = resolve('/');

  while (dir !== root) {
    const candidate = join(dir, '.claude');
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch {
      // keep walking up
    }
    dir = resolve(dir, '..');
  }

  return join(rootPath, '.claude');
}

export async function installClaudeHooks(rootPath: string): Promise<ClaudeHooksResult> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  const proposalData = await readFile(proposalPath, 'utf-8');
  const proposal = JSON.parse(proposalData) as {
    rootPath: string;
    domains: DomainProposal[];
    unassigned: string[];
  };

  const claudeDir = await findClaudeDir(rootPath);
  const settingsPath = join(claudeDir, 'settings.json');

  // --- 1. Configure MCP server in settings.json ---

  let settings: Record<string, any> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch {
    // fresh settings
  }

  if (!settings.mcpServers) settings.mcpServers = {};

  settings.mcpServers['domain-agents'] = {
    command: 'domain-agents-mcp',
    args: [resolve(rootPath)],
  };

  // --- 2. Add SessionStart hook to inject domain summary ---

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes('domain-agents-mcp'))
  );

  settings.hooks.SessionStart.push({
    hooks: [{
      type: 'command',
      command: `domain-agents-mcp ${resolve(rootPath)} --list-domains`,
    }],
  });

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // --- 3. Create .claude/rules/domain-agents.md (global rules) ---

  const rulesDir = join(claudeDir, 'rules');
  await mkdir(rulesDir, { recursive: true });
  const rulesPath = join(rulesDir, 'domain-agents.md');

  const domainList = proposal.domains
    .slice(0, 20)
    .map(d => `${d.name} (${d.files.length} files)`)
    .join(', ');

  const rulesContent = `# Domain Architecture

This codebase has ${proposal.domains.length} discovered business domains. Per-domain rules auto-activate when you edit files in each domain.

## MCP Tools Available

- **domain_context(domain_name)** — Full agent file for a domain (purpose, tech debt, rules, scaling stage)
- **domain_files(domain_name)** — List all files in a domain
- **domain_lookup(file_path)** — Look up which domain a file belongs to
- **list_domains** — See all domains in the system

## Key Domains

${domainList}
`;

  await writeFile(rulesPath, rulesContent, 'utf-8');

  // --- 4. Generate per-domain rule files with glob activation ---

  const lookup = await createLookup(rootPath);
  const domainRuleFiles = await generateDomainRules(lookup, proposal.domains, rulesDir);

  return { settingsPath, rulesPath, domainRuleFiles, hookScript: 'SessionStart hook configured' };
}

/**
 * Generate a .claude/rules/domain-<name>.md file per domain with glob-based activation.
 * When Claude Code edits a file matching the globs, the domain context auto-loads.
 */
async function generateDomainRules(
  lookup: ReturnType<typeof createLookup> extends Promise<infer T> ? T : never,
  domains: DomainProposal[],
  rulesDir: string,
): Promise<string[]> {
  const ruleFiles: string[] = [];

  for (const domain of domains) {
    const globs = lookup.getGlobPatterns(domain.name);
    if (!globs || globs.length === 0) continue;

    const context = lookup.getAgentContext(domain.name);
    if (!context) continue;

    const consumedDomains = Object.keys(domain.coupling).filter(d => domain.coupling[d] > 0);

    const sections: string[] = [];

    // Frontmatter with globs for auto-activation
    sections.push('---');
    sections.push(`description: ${domain.name} domain — auto-activates when editing files in this domain`);
    sections.push('globs:');
    for (const g of globs) {
      sections.push(`  - ${g}`);
    }
    sections.push('---');
    sections.push('');

    // Agent context
    sections.push(context);

    // Cross-domain instructions
    if (consumedDomains.length > 0) {
      sections.push('## Cross-Domain Dependencies');
      sections.push('');
      sections.push('This domain depends on the following domains. Use `domain_context` to load their rules before making changes that cross boundaries:');
      sections.push('');
      for (const dep of consumedDomains) {
        const score = domain.coupling[dep];
        sections.push(`- **${dep}** (coupling: ${score.toFixed(2)}) — run \`domain_context("${dep}")\``);
      }
      sections.push('');
    }

    const filePath = join(rulesDir, `domain-${domain.name}.md`);
    await writeFile(filePath, sections.join('\n'), 'utf-8');
    ruleFiles.push(filePath);
  }

  return ruleFiles;
}
