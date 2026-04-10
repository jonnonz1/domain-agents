# domain-agents

[![npm version](https://img.shields.io/npm/v/domain-agents.svg)](https://www.npmjs.com/package/domain-agents)
[![CI](https://github.com/jonnonz1/domain-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/jonnonz1/domain-agents/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)

A CLI tool that discovers business domains in TypeScript/Node codebases and generates AI agent files for evolutionary architecture.

## The Problem

AI has collapsed the cost of building software. MVPs are cheap. But when the product takes off, the codebase hits a wall — AI-generated code optimizes for *now*, not for scale.

The traditional answer is "rewrite it properly." The better answer is **evolutionary architecture**: structure the system so each domain can evolve independently when the data says it's time.

## The Approach

`domain-agents` analyzes your codebase using static analysis (TypeScript compiler API, import graph analysis, naming patterns, dependency mapping) and identifies natural business domains. It then generates:

1. **Agent files** (`agents/<domain>.md`) — per-domain context including interfaces, tech debt, observability specs, and scaling paths
2. **System map** (`AGENTS.md`) — the dependency graph, cross-domain contracts, and architecture rules
3. **MCP server** — Claude Code and other AI tools can query domain context on demand

Each domain agent tracks:
- **Interfaces** — what it exposes, what it consumes, who depends on it
- **Technical debt** — known issues that inform feature development consensus across domains
- **Observability** — metrics to gather, gaps to fill, scaling triggers that signal when to evolve
- **Evolution path** — inline → async → queued → separate service → distributed

## Quick Start

```bash
npm install -g domain-agents

# 1. Discover domains in your codebase
domain-agents discover ./my-app

# 2. Review the proposal, then generate agent files
domain-agents init ./my-app

# 3. (Optional) Use Claude to enrich agent files with real code analysis
domain-agents setup                       # save your Anthropic API key
domain-agents init ./my-app --enrich      # generates contextual descriptions

# 4. Connect to your AI tools
domain-agents hooks claude ./my-app    # Claude Code: auto-activating rules + MCP server
domain-agents hooks cursor ./my-app    # Cursor: glob-activated .mdc rules

# 5. Check domain health over time
domain-agents health ./my-app
```

## AI Tool Integration

### Claude Code

```bash
domain-agents hooks claude ./my-app
```

This installs three layers of integration:

1. **Per-domain rule files** (`.claude/rules/domain-<name>.md`) — each has `globs:` frontmatter so Claude Code **auto-activates the domain context** when you edit files in that domain. Cross-domain dependencies are listed with instructions to consult related domains via MCP.
2. **MCP server** — 4 tools (`domain_lookup`, `domain_context`, `domain_files`, `list_domains`) for on-demand domain queries
3. **SessionStart hook** — prints a domain summary at the start of each session

When you say "add a new email service", Claude Code sees you editing email domain files, auto-loads the email agent context, sees it depends on `users` and `permissions`, and consults those domains too — seamlessly.

### Cursor

```bash
domain-agents hooks cursor ./my-app
```

Generates `.cursor/rules/<domain>.mdc` files with glob-based activation. Cursor automatically loads the relevant domain rules when editing matching files.

## LLM-Enriched Agent Files

With `--enrich`, the tool reads key files from each domain and uses Claude to generate contextual descriptions instead of generic templates:

```bash
domain-agents setup                       # one-time: save your API key
domain-agents init ./my-app --enrich
```

This produces agent files with:
- **Real purpose descriptions** based on actual code ("Manages journal entries with double-entry bookkeeping, multi-entity transfers, and GST calculations")
- **Accurate scaling stage** detection (finds queue usage, async patterns, etc.)
- **Specific tech debt** from code analysis, not generic checklists
- **Business domain rules** extracted from validation logic and invariants
- **Observability gaps** based on what's instrumented vs what's missing

The API key is stored at `~/.config/domain-agents/config.json` — never in the project.

## What It Detects

The discovery engine runs 5 analysis passes:

| Pass | Signal | What it does |
|------|--------|-------------|
| Structure | Directories | Detects feature vs. layer vs. mixed organization |
| Imports | TypeScript AST | Builds the full import graph, clusters by connectivity |
| Naming | File names | Groups `auth.controller` + `auth.service` + `auth.routes` → "auth" |
| Dependencies | package.json | Maps `stripe` → billing, `@sendgrid/mail` → email, `jsonwebtoken` → auth |
| Interfaces | Cross-domain edges | Finds boundary files imported by 2+ domains, calculates coupling scores |

### Handles Three Codebase Patterns

**Feature-organized** (the easy case):
```
src/auth/        → auth domain (96% confidence)
src/billing/     → billing domain (94% confidence)
src/email/       → email domain (99% confidence)
```

**Layer-organized** (the hard case):
```
controllers/auth.controller.ts  ┐
services/auth.service.ts        ├→ auth domain (74% confidence)
routes/auth.routes.ts           │
middleware/auth.middleware.ts    ┘
```

**Mixed / Next.js** (the real-world case):
```
lib/services/journal/       ┐
components/journals/        ├→ journals domain (52 files)
hooks/use-manual-journals   │
app/api/journals/           ┘

lib/services/bank-accounts/ ┐
components/bank-accounts/   ├→ bank-accounts domain (59 files)
hooks/use-bank-*            │
app/api/bank-accounts/      ┘
```

## Health Checks

```bash
domain-agents health ./my-app
```

Detects:
- **New files** not covered by any domain agent
- **High coupling** between domains (> 30%)
- **Boundary violations** — cross-domain imports that bypass interfaces
- **Stale agent files** — domains that have changed since last discovery

### CI Integration

Use `--ci` to fail the build when domains are stale or have boundary violations. Use `--json` for machine-readable output.

```bash
# Fail the build if agents are stale
domain-agents health --ci ./my-app

# JSON output for custom tooling
domain-agents health --json ./my-app
```

Add this to your GitHub Actions workflow to catch domain drift on every PR:

```yaml
# .github/workflows/domain-health.yml
name: Domain Health

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npx domain-agents health --ci .
```

## Commands

| Command | Description |
|---------|-------------|
| `domain-agents discover <path>` | Analyze codebase and propose domains |
| `domain-agents show <path>` | Visual overview of the proposal |
| `domain-agents init <path> [--enrich]` | Generate agent files and AGENTS.md |
| `domain-agents setup` | Configure API key for LLM enrichment |
| `domain-agents health <path> [--ci] [--json]` | Check domain boundaries and staleness |
| `domain-agents hooks claude <path>` | Install Claude Code integration (auto-activating rules + MCP) |
| `domain-agents hooks cursor <path>` | Generate Cursor rule files |

## Key Design Principles

**Observability is the most important input.** Agent files have a strong preference for gathering data. Scaling decisions should be driven by metrics, not speculation.

**Tech debt informs feature consensus.** When a feature spans multiple domains, each domain's tech debt register is consulted.

**Start consolidated, split when needed.** You don't need a domain agent per micro-concern from day one. Start with broad agents covering multiple areas.

**The operator resolves conflicts.** Agents own their domains, but cross-domain decisions are surfaced for human judgment.

## Development

```bash
npm install
npm test            # Run all 180 tests
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation
```

### Test Fixtures

Three realistic TypeScript codebases in `tests/fixtures/`:
- `feature-organized/` — 17 files, directory-per-feature SaaS app
- `layer-organized/` — 20 files, traditional MVC Express app
- `mixed/` — 17 files, real-world messy codebase with coupling hotspots

## Releasing

Releases are published to npm via GitHub Actions with [Sigstore provenance attestation](https://docs.npmjs.com/generating-provenance-statements).

### Cutting a release

```bash
# 1. Bump the version (updates package.json and creates a v* tag)
npm version patch   # or: minor | major

# 2. Push the tag
git push --follow-tags

# 3. Create a GitHub Release for the tag (UI or CLI)
gh release create v$(jq -r .version package.json) --generate-notes
```

The `Publish to npm` workflow triggers on the release, waits for your approval in the `npm-publish` environment, verifies the tag matches `package.json`, runs tests and build, then publishes with `--provenance`.


## Author

Built by [John Gregoriadis](https://jonno.nz) — engineering, AI, and the bits in between.

## License

[MIT](./LICENSE)
