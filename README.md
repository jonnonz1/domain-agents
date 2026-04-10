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

# 4. Connect to Claude Code via MCP
claude mcp add domain-agents -- domain-agents-mcp /path/to/my-app

# 5. Check domain health over time
domain-agents health ./my-app
```

## MCP Server (Claude Code Integration)

The MCP server gives Claude Code live access to domain context — no generated files to maintain.

```bash
# Add the MCP server to your project
claude mcp add domain-agents -- domain-agents-mcp /path/to/my-app
```

This exposes 4 tools to Claude Code:

| Tool | What it does |
|------|-------------|
| `domain_lookup` | Look up which domain a file belongs to, returns full agent context |
| `list_domains` | List all discovered domains with file counts and confidence |
| `domain_context` | Get the full agent file for a specific domain |
| `domain_files` | List all files belonging to a domain |

Claude Code will use these automatically when working in your codebase — asking "what domain does this file belong to?" or getting context before making changes.

### Cursor Integration

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

## Commands

| Command | Description |
|---------|-------------|
| `domain-agents discover <path>` | Analyze codebase and propose domains |
| `domain-agents show <path>` | Visual overview of the proposal |
| `domain-agents init <path> [--enrich]` | Generate agent files and AGENTS.md |
| `domain-agents setup` | Configure API key for LLM enrichment |
| `domain-agents health <path>` | Check domain boundaries and staleness |
| `domain-agents hooks cursor <path>` | Generate Cursor rule files |

## Key Design Principles

**Observability is the most important input.** Agent files have a strong preference for gathering data. Scaling decisions should be driven by metrics, not speculation.

**Tech debt informs feature consensus.** When a feature spans multiple domains, each domain's tech debt register is consulted.

**Start consolidated, split when needed.** You don't need a domain agent per micro-concern from day one. Start with broad agents covering multiple areas.

**The operator resolves conflicts.** Agents own their domains, but cross-domain decisions are surfaced for human judgment.

## Development

```bash
npm install
npm test            # Run all 170 tests
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation
```

### Test Fixtures

Three realistic TypeScript codebases in `tests/fixtures/`:
- `feature-organized/` — 17 files, directory-per-feature SaaS app
- `layer-organized/` — 20 files, traditional MVC Express app
- `mixed/` — 17 files, real-world messy codebase with coupling hotspots

## Releasing

This package publishes to npm via GitHub Actions. Every published tarball carries a [Sigstore provenance attestation](https://docs.npmjs.com/generating-provenance-statements) that cryptographically links it to the source commit and workflow run, even with token-based auth.

### One-time setup

1. **Create a granular npm access token** at `https://www.npmjs.com/settings/<your-username>/tokens/new`:
   - **Type:** Granular access token
   - **Expiration:** 90 days (rotate on schedule)
   - **Packages and scopes:** _Only_ `domain-agents` — never grant account-wide access
   - **Permissions:** Read and write
   - **Allow publishing with 2FA:** **Yes / bypass 2FA** (required — CI cannot respond to OTP prompts)

   Copy the token once — you can't view it again.

2. **Store the token as a GitHub secret**:
   - GitHub → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: paste the token from step 1
   - **Never commit this token, paste it into a chat, or put it in `.env` files.**

3. **Create the GitHub environment** for a manual approval gate:
   - GitHub → Settings → Environments → **New environment** → `npm-publish`
   - Add yourself as a **Required reviewer** so every release requires manual approval in the Actions tab before the publish step runs.
   - Scope the `NPM_TOKEN` secret to this environment if you want belt-and-braces (Environment secrets override repository secrets).

4. **First publish** — publish `0.1.0` manually once so the package exists on npm. You can either use the same granular token locally (set `//registry.npmjs.org/:_authToken=<token>` in `~/.npmrc`) or run `npm login` and respond to the 2FA prompt:

   ```bash
   npm login
   npm run build
   npm publish --access public
   ```

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

### Security posture

- **Least-privilege token** — `NPM_TOKEN` is a granular access token scoped to `domain-agents` only, with an expiration date. Rotate on schedule.
- **Environment gate** — the `npm-publish` environment requires a human reviewer to approve each release before the job can read the secret or publish.
- **Provenance attestation** — even with token-based auth, every published tarball is signed via GitHub's OIDC and Sigstore, linking it to the exact commit and workflow run. Verifiable on npmjs.com.
- **Pinned action SHAs** — third-party actions are pinned to commit hashes, not mutable tags, so a tag hijack on `actions/checkout` can't affect this pipeline.
- **Least-privilege permissions** — workflows declare `contents: read` by default; the publish job adds `id-token: write` only for Sigstore provenance, not npm auth.
- **Tag/version mismatch check** — a release tagged `v1.2.3` must match `package.json` or the publish fails.
- **`files` allowlist** — only `dist/`, `README.md`, and `LICENSE` ship. Source, tests, and fixtures never reach npm.
- **`publishConfig.provenance` removed from `package.json`** — local publishes work without `--no-provenance`. The workflow passes `--provenance` explicitly so CI publishes always attest.

## Author

Built by [John Gregoriadis](https://jonno.nz) — engineering, AI, and the bits in between.

## License

[MIT](./LICENSE)
