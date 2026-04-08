# domain-agents

A CLI tool that discovers business domains in TypeScript/Node codebases and generates AI agent files for evolutionary architecture.

## The Problem

AI has collapsed the cost of building software. MVPs are cheap. But when the product takes off, the codebase hits a wall — AI-generated code optimizes for *now*, not for scale.

The traditional answer is "rewrite it properly." The better answer is **evolutionary architecture**: structure the system so each domain can evolve independently when the data says it's time.

## The Approach

`domain-agents` analyzes your codebase using static analysis (TypeScript compiler API, import graph analysis, naming patterns, dependency mapping) and identifies natural business domains. It then generates:

1. **Agent files** (`agents/<domain>.md`) — per-domain context including interfaces, tech debt, observability specs, and scaling paths
2. **System map** (`AGENTS.md`) — the dependency graph, cross-domain contracts, and architecture rules
3. **Editor hooks** — automatic domain context loading for Claude Code and Cursor

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

# 2. Review the proposal at .domain-agents/proposal.json, then generate files
domain-agents init ./my-app

# 3. Install editor integration
domain-agents hooks claude ./my-app    # CLAUDE.md per domain directory
domain-agents hooks cursor ./my-app    # .cursor/rules per domain

# 4. Check domain health over time
domain-agents health ./my-app
```

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

**Mixed** (the real-world case):
```
src/auth/           → auth (99% confidence, clean directory)
services/payment.ts → payment (74%, merged with stripe-client + invoice)
api/admin-handler   → unassigned (coupling hotspot, imports 3+ domains)
```

## Generated Agent File

Each domain gets an agent file with structured sections:

```markdown
# Billing Agent

## Purpose
What this domain does in business terms.

## Ownership
Files, routes, config owned by this domain.

## Interfaces
### Exposed (other domains call these)
### Consumed (this domain calls these)

## Scaling Stage
Current: Inline → Evolution path to async → queued → service

## Technical Debt
- [ ] Known issues that inform feature development

## Observability
### Current Metrics
### Gaps — what data is missing for scaling decisions
### Scaling Triggers — metric thresholds that signal evolution

## Domain Rules
## Context for AI Agents
```

## Editor Integration

### Claude Code

```bash
domain-agents hooks claude ./my-app
```

Generates `CLAUDE.md` in each domain's directory. Claude Code automatically reads these when working in that directory — the right agent context is always present without manual intervention.

For layer-organized codebases (where domains span directories), generates a single `src/CLAUDE.md` with file-to-domain mapping.

### Cursor

```bash
domain-agents hooks cursor ./my-app
```

Generates `.cursor/rules/<domain>.mdc` files with glob-based activation. Cursor automatically loads the relevant domain rules when editing matching files.

## Health Checks

```bash
domain-agents health ./my-app
```

Detects:
- **New files** not covered by any domain agent
- **High coupling** between domains (> 30%)
- **Boundary violations** — cross-domain imports that bypass interfaces
- **Stale agent files** — domains that have changed since last discovery

## Key Design Principles

**Observability is the most important input.** Agent files have a strong preference for gathering data. Scaling decisions should be driven by metrics, not speculation. Every new code path is an opportunity to add instrumentation.

**Tech debt informs feature consensus.** When a feature spans multiple domains, each domain's tech debt register is consulted. If the email domain has no retry logic and the feature increases email volume, the agent surfaces this during planning.

**Start consolidated, split when needed.** You don't need a domain agent per micro-concern from day one. Start with broad agents covering multiple areas. Split when a domain gets complex enough to warrant its own context.

**The operator resolves conflicts.** Agents own their domains, but cross-domain decisions are surfaced for human judgment — like an engineering manager resolving disagreements between teams.

## Development

```bash
npm install
npm test            # Run all 146 tests
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation
```

### Test Fixtures

Three realistic TypeScript codebases in `tests/fixtures/`:
- `feature-organized/` — 17 files, directory-per-feature SaaS app
- `layer-organized/` — 20 files, traditional MVC Express app
- `mixed/` — 17 files, real-world messy codebase with coupling hotspots

## License

ISC
