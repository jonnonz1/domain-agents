import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type { DomainProposal } from '../types.js';

export interface ClaudeHooksResult {
  settingsPath: string;
  rulesPath: string;
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

  // --- 1. Configure MCP server with instructions in settings.json ---

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

  // Remove any existing domain-agents hook
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes('domain-agents-mcp'))
  );

  // Add the hook — runs the MCP binary's list_domains at session start
  settings.hooks.SessionStart.push({
    hooks: [{
      type: 'command',
      command: `domain-agents-mcp ${resolve(rootPath)} --list-domains`,
    }],
  });

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // --- 3. Create .claude/rules/domain-agents.md ---

  const rulesDir = join(claudeDir, 'rules');
  await mkdir(rulesDir, { recursive: true });
  const rulesPath = join(rulesDir, 'domain-agents.md');

  const domainList = proposal.domains
    .slice(0, 20)
    .map(d => `${d.name} (${d.files.length} files)`)
    .join(', ');

  const rulesContent = `# Domain Architecture

This codebase has ${proposal.domains.length} discovered business domains. Domain agent files are in \`agents/<domain>.md\`.

## MCP Tools Available

Use the \`domain-agents\` MCP tools during implementation:

- **domain_lookup(file_path)** — Before editing a file, look up its domain to understand the context, rules, and interfaces
- **domain_context(domain_name)** — Get the full agent file for a domain including purpose, tech debt, domain rules, and scaling stage
- **domain_files(domain_name)** — List all files in a domain to understand the full scope of changes
- **list_domains** — See all domains in the system

## Implementation Workflow

1. Before starting work, call \`domain_lookup\` on the files you'll modify to understand which domains are involved
2. Read the domain rules and tech debt from the agent context — these inform implementation choices
3. When changes cross domain boundaries, check both domains' interface contracts
4. Preserve existing interface signatures — implementations can change, contracts must be stable
5. Note any new tech debt or observability gaps introduced by your changes

## Key Domains

${domainList}
`;

  await writeFile(rulesPath, rulesContent, 'utf-8');

  // --- 4. Create the --list-domains hook script support in MCP server ---
  // (handled by the MCP server binary itself)

  return { settingsPath, rulesPath, hookScript: 'SessionStart hook configured' };
}
