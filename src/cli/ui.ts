import chalk from 'chalk';

const BANNER = String.raw`
    __                    _                          __
 __/ /___  ____ ___  ____ _(_)___    ____ _____ ____  / /_____
/ _  / __ \/ __ \`__ \/ __ \`/ / __ \  / __ \`/ __ \`/ _ \/ __/ ___/
\_,_/\____/_/ /_/ /_/\__,_/_/_/ /_/  \__,_/\__, /\___/\__/____/
                                          /____/
`;

/**
 * Return the banner as a single string (cyan logo + dim tagline + trailing blank line).
 * chalk auto-disables when NO_COLOR is set or stdout is not a TTY.
 */
export function bannerString(): string {
  return (
    chalk.cyan(BANNER) +
    '\n' +
    chalk.dim('  discover domains · generate agents · evolutionary architecture') +
    '\n'
  );
}

/**
 * Print the banner to stdout.
 */
export function printBanner(): void {
  console.log(bannerString());
}

/** Green check prefix for successful items. */
export function success(msg: string): string {
  return `${chalk.green('✓')} ${msg}`;
}

/** Yellow warning prefix for advisory items. */
export function warn(msg: string): string {
  return `${chalk.yellow('⚠')} ${msg}`;
}

/** Red cross prefix for failures and stale items. */
export function error(msg: string): string {
  return `${chalk.red('✗')} ${msg}`;
}

/** Dim arrow prefix for recommendations. */
export function arrow(msg: string): string {
  return `${chalk.cyan('→')} ${msg}`;
}

/** Bold cyan section header. */
export function header(msg: string): string {
  return chalk.bold.cyan(msg);
}

/**
 * Colorize a confidence percentage: green ≥80, yellow 50–79, red <50.
 */
export function confidence(pct: number): string {
  const text = `${pct}%`;
  if (pct >= 80) return chalk.green(text);
  if (pct >= 50) return chalk.yellow(text);
  return chalk.red(text);
}

/**
 * Colorize a domain health status token.
 */
export function statusIcon(status: 'healthy' | 'warning' | 'stale' | string): string {
  if (status === 'healthy') return chalk.green('✓');
  if (status === 'warning') return chalk.yellow('⚠');
  return chalk.red('✗');
}
