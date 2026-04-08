import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { discoverDomains } from '../discovery/index.js';
import type { DiscoveryResult } from '../types.js';

export async function runDiscover(rootPath: string): Promise<DiscoveryResult> {
  const result = await discoverDomains(rootPath);

  // Save proposal to .domain-agents/proposal.json
  const outputDir = join(rootPath, '.domain-agents');
  await mkdir(outputDir, { recursive: true });

  const proposal = {
    rootPath: result.rootPath,
    domains: result.domains,
    unassigned: result.unassigned,
  };

  await writeFile(
    join(outputDir, 'proposal.json'),
    JSON.stringify(proposal, null, 2),
    'utf-8',
  );

  return result;
}
