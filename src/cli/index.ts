#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runDiscover } from './discover.js';
import { runShow } from './show.js';
import { runInit } from './init.js';
import { runHealth } from './health.js';
import { runSetup, resolveApiKey } from './setup.js';
import { installClaudeHooks } from '../hooks/claude.js';
import { installCursorRules } from '../hooks/cursor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

const program = new Command();

program
  .name('domain-agents')
  .description('Discover business domains in codebases and generate AI agent files for evolutionary architecture')
  .version(pkg.version);

program
  .command('discover')
  .description('Analyze a codebase and propose business domains')
  .argument('[path]', 'Path to the project root', '.')
  .option('--verbose', 'Show detailed analysis output')
  .action(async (path: string, options: { verbose?: boolean }) => {
    const rootPath = resolve(path);
    console.log(`\nAnalyzing codebase at ${rootPath}...\n`);

    try {
      const result = await runDiscover(rootPath);

      console.log('Proposed Domains:\n');
      for (const domain of result.domains) {
        const confidence = Math.round(domain.confidence * 100);
        const signalTypes = [...new Set(domain.signals.map(s => s.type))].join(', ');
        console.log(`  ${domain.name.padEnd(20)} ${String(domain.files.length).padStart(3)} files  confidence: ${confidence}%  signals: ${signalTypes}`);

        if (options.verbose) {
          for (const file of domain.files) {
            console.log(`    - ${file}`);
          }
        }
      }

      if (result.unassigned.length > 0) {
        console.log(`\n  Unassigned: ${result.unassigned.length} files`);
        if (options.verbose) {
          for (const file of result.unassigned) {
            console.log(`    - ${file}`);
          }
        }
      }

      console.log(`\nProposal saved to .domain-agents/proposal.json`);
      console.log(`Next: review the proposal, then run 'domain-agents init'\n`);
    } catch (err) {
      console.error('Discovery failed:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('show')
  .description('Display the discovery proposal in a visual format')
  .argument('[path]', 'Path to the project root', '.')
  .option('--files', 'Show individual files in each domain')
  .option('--coupling', 'Show coupling between domains')
  .action(async (path: string, options: { files?: boolean; coupling?: boolean }) => {
    const rootPath = resolve(path);

    try {
      await runShow(rootPath, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Configure domain-agents (API key for LLM enrichment)')
  .action(async () => {
    try {
      await runSetup();
    } catch (err) {
      console.error('Setup failed:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Generate agent files and AGENTS.md from a discovery proposal')
  .argument('[path]', 'Path to the project root', '.')
  .option('--enrich', 'Use Claude to generate contextual domain descriptions (requires API key via setup or ANTHROPIC_API_KEY)')
  .action(async (path: string, options: { enrich?: boolean }) => {
    const rootPath = resolve(path);

    if (options.enrich) {
      const apiKey = await resolveApiKey();
      if (!apiKey) {
        console.error('Error: --enrich requires an Anthropic API key.');
        console.error('Run "domain-agents setup" or set ANTHROPIC_API_KEY environment variable.');
        process.exit(1);
      }
      // Make the key available to the Anthropic SDK
      process.env.ANTHROPIC_API_KEY = apiKey;
    }

    try {
      if (options.enrich) {
        console.log('\nGenerating enriched agent files with Claude...\n');
      }

      const result = await runInit(rootPath, { enrich: options.enrich });

      console.log('\nGenerated files:\n');
      for (const file of result.agentFiles) {
        console.log(`  ✓ ${file}`);
      }
      console.log(`  ✓ ${result.agentsMdPath}`);
      console.log(`\nDone. Review the generated files and refine as needed.\n`);
    } catch (err) {
      console.error('Init failed:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check domain boundaries, coupling, and agent file staleness')
  .argument('[path]', 'Path to the project root', '.')
  .option('--ci', 'Exit with non-zero code if stale domains, coupling issues, or boundary violations are found')
  .option('--json', 'Output the health report as JSON')
  .action(async (path: string, options: { ci?: boolean; json?: boolean }) => {
    const rootPath = resolve(path);

    try {
      const report = await runHealth(rootPath);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('\nDomain Health Report:\n');
        for (const domain of report.domains) {
          const icon = domain.status === 'healthy' ? '✓' : domain.status === 'warning' ? '⚠' : '✗';
          let detail = '';
          if (domain.newFiles.length > 0) {
            detail += ` (${domain.newFiles.length} new files not covered)`;
          }
          if (domain.removedFiles.length > 0) {
            detail += ` (${domain.removedFiles.length} files removed)`;
          }
          console.log(`  ${icon} ${domain.name.padEnd(20)} ${domain.status}${detail}`);
        }

        if (report.couplingIssues.length > 0) {
          console.log('\nCoupling Issues:\n');
          for (const issue of report.couplingIssues) {
            console.log(`  ⚠ ${issue.message}`);
          }
        }

        if (report.boundaryViolations.length > 0) {
          console.log(`\nBoundary Violations: ${report.boundaryViolations.length} cross-domain imports bypass interfaces\n`);
        }

        if (report.recommendations.length > 0) {
          console.log('\nRecommendations:\n');
          for (const rec of report.recommendations) {
            console.log(`  → ${rec}`);
          }
        }

        console.log('');
      }

      if (options.ci) {
        const hasStale = report.domains.some(d => d.status === 'stale');
        const hasIssues = report.couplingIssues.length > 0 || report.boundaryViolations.length > 0;
        if (hasStale || hasIssues) {
          process.exit(1);
        }
      }
    } catch (err) {
      console.error('Health check failed:', (err as Error).message);
      process.exit(1);
    }
  });

const hooks = program
  .command('hooks')
  .description('Install editor/AI tool integrations');

hooks
  .command('claude')
  .description('Configure MCP server for domain context in Claude Code')
  .argument('[path]', 'Path to the project root', '.')
  .action(async (path: string) => {
    const rootPath = resolve(path);

    try {
      const result = await installClaudeHooks(rootPath);

      console.log('\nClaude Code integration installed:\n');
      console.log(`  ✓ ${result.settingsPath}  (MCP server + SessionStart hook)`);
      console.log(`  ✓ ${result.rulesPath}  (global domain rules)`);
      console.log(`  ✓ ${result.domainRuleFiles.length} per-domain rule files  (auto-activate on file edit)`);
      console.log(`\nClaude Code will now:`);
      console.log(`  1. Auto-load domain context when you edit files in any domain`);
      console.log(`  2. Show cross-domain dependencies and prompt you to consult related domains`);
      console.log(`  3. Have MCP tools: domain_lookup, domain_context, domain_files, list_domains\n`);
    } catch (err) {
      console.error('Hook installation failed:', (err as Error).message);
      process.exit(1);
    }
  });

hooks
  .command('cursor')
  .description('Generate .cursor/rules/ files for automatic domain context in Cursor')
  .argument('[path]', 'Path to the project root', '.')
  .action(async (path: string) => {
    const rootPath = resolve(path);

    try {
      const result = await installCursorRules(rootPath);

      console.log('\nCursor integration installed:\n');
      for (const file of result.ruleFiles) {
        console.log(`  ✓ ${file}`);
      }
      console.log(`\nCursor will automatically load domain context when editing matching files.\n`);
    } catch (err) {
      console.error('Hook installation failed:', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
