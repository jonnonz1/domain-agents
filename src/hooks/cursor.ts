import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createLookup } from './lookup.js';

export interface CursorRulesResult {
  ruleFiles: string[];
}

export async function installCursorRules(rootPath: string): Promise<CursorRulesResult> {
  const lookup = await createLookup(rootPath);
  const domains = lookup.listDomains();

  const rulesDir = join(rootPath, '.cursor', 'rules');
  await mkdir(rulesDir, { recursive: true });

  const ruleFiles: string[] = [];

  for (const domainName of domains) {
    const context = lookup.getAgentContext(domainName);
    if (!context) continue;

    const globs = lookup.getGlobPatterns(domainName);
    if (!globs || globs.length === 0) continue;

    const frontmatter = [
      '---',
      `description: ${domainName} domain agent context`,
      `globs:`,
      ...globs.map(g => `  - ${g}`),
      '---',
      '',
    ].join('\n');

    const filePath = join(rulesDir, `${domainName}.mdc`);
    await writeFile(filePath, frontmatter + context, 'utf-8');
    ruleFiles.push(filePath);
  }

  return { ruleFiles };
}
