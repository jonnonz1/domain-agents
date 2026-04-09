import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type { DomainProposal } from '../types.js';

export interface ClaudeHooksResult {
  mcpConfigured: boolean;
  settingsPath: string;
}

/**
 * Find the nearest .claude/settings.json by walking up from rootPath.
 * Returns the .claude directory path, or rootPath/.claude if none found.
 */
async function findClaudeSettingsDir(rootPath: string): Promise<string> {
  let dir = resolve(rootPath);
  const root = resolve('/');

  while (dir !== root) {
    const candidate = join(dir, '.claude');
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch {
      // not found, keep going up
    }
    dir = resolve(dir, '..');
  }

  // No existing .claude found — create at rootPath
  return join(rootPath, '.claude');
}

function getMcpBinaryPath(): string {
  // Use the binary name from package.json — npm link makes it available on PATH
  return 'domain-agents-mcp';
}

export async function installClaudeHooks(rootPath: string): Promise<ClaudeHooksResult> {
  const proposalPath = join(rootPath, '.domain-agents', 'proposal.json');
  // Verify proposal exists
  await readFile(proposalPath, 'utf-8');

  const claudeDir = await findClaudeSettingsDir(rootPath);
  const settingsPath = join(claudeDir, 'settings.json');

  // Load existing settings or create new
  let settings: Record<string, any> = {};
  try {
    const existing = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(existing);
  } catch {
    // No existing settings
  }

  // Add or update MCP server config
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  settings.mcpServers['domain-agents'] = {
    command: getMcpBinaryPath(),
    args: [resolve(rootPath)],
  };

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  return { mcpConfigured: true, settingsPath };
}
