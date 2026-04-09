import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

const CONFIG_DIR = join(homedir(), '.config', 'domain-agents');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface Config {
  anthropicApiKey?: string;
}

export async function loadConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runSetup(): Promise<void> {
  console.log('\nDomain Agents Setup\n');

  const existing = await loadConfig();

  if (existing.anthropicApiKey) {
    const masked = existing.anthropicApiKey.slice(0, 10) + '...' + existing.anthropicApiKey.slice(-4);
    console.log(`  Existing API key: ${masked}`);
    const overwrite = await prompt('  Overwrite? (y/N) ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('\n  Keeping existing key.\n');
      return;
    }
  }

  const key = await prompt('  Anthropic API key: ');

  if (!key) {
    console.log('\n  No key provided. You can set ANTHROPIC_API_KEY env var instead.\n');
    return;
  }

  if (!key.startsWith('sk-ant-')) {
    console.log('\n  Warning: key doesn\'t look like an Anthropic API key (expected sk-ant-... prefix).\n');
    const proceed = await prompt('  Save anyway? (y/N) ');
    if (proceed.toLowerCase() !== 'y') return;
  }

  await saveConfig({ ...existing, anthropicApiKey: key });
  console.log(`\n  Key saved to ${CONFIG_FILE}`);
  console.log('  This key will be used by "domain-agents init --enrich".\n');
}

/**
 * Resolve the Anthropic API key from environment or config file.
 * Environment variable takes precedence.
 */
export async function resolveApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const config = await loadConfig();
  return config.anthropicApiKey ?? null;
}
