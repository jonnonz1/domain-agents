# Domain Agents — Working Document

> A CLI tool that discovers business domains in a codebase, generates domain-specific AI agent files, and maintains a system map (AGENTS.md) — enabling evolutionary architecture powered by AI agents that own, evolve, and scale their respective areas of the system.

---

## 1. Thesis

Software engineering is undergoing a fundamental shift. AI has collapsed the cost of building MVPs to near-zero. The bottleneck is no longer "can we build it?" — it's "can it survive success?"

AI-generated code optimizes for *now*: it works, it ships, it solves the immediate problem. But it doesn't plan for 10x load, doesn't anticipate domain complexity, doesn't structure itself for independent evolution. This is fine — velocity is always prioritized by the business, and it should be.

The answer is **evolutionary architecture**: build for now, but structure the system so each part can evolve independently when the time comes. The key mechanisms are:

1. **Loose coupling via interfaces** — domains communicate through contracts, not implementations
2. **Domain-specific AI agents** — each area of the system has an agent that holds deep context about that domain, its tech debt, its scaling stage, and its evolution path
3. **Observability as the decision engine** — usage data, not speculation, drives when and how domains evolve
4. **The operator as architect** — humans resolve cross-domain conflicts and make strategic decisions that agents surface but cannot make alone

This mirrors how successful engineering organizations scale: teams own domains, communicate through APIs, and make independent decisions within their boundaries. Domain agents replicate this organizational pattern for AI-assisted development.

---

## 2. Core Concepts

### 2.1 Domains

A **domain** is a cohesive area of business logic within the codebase. Examples:
- Email/notifications
- Authentication/authorization  
- Billing/payments
- User management
- Content/media
- Search
- Analytics/reporting

Domains are identified by analyzing code structure, import graphs, naming patterns, and framework conventions. They are *not* technical layers (controller/service/model) — they are **business capabilities**.

### 2.2 Domain Agents

A **domain agent** is an AI agent file that holds the complete context for a specific domain:
- What the domain does (business context)
- What files/directories it owns (boundaries)
- What interfaces it exposes (contracts)
- What tech debt it carries (known issues)
- What observability it has (metrics, logs, alerts)
- What its evolution path looks like (scaling roadmap)
- What its current scaling stage is (inline → async → queued → service)

Domain agents are the unit of AI ownership. When a developer (or another agent) works within a domain, the agent file provides the context needed to make good decisions.

### 2.3 AGENTS.md — The System Map

`AGENTS.md` is the root-level document that:
- Lists all domains and their agent files
- Maps the dependency graph between domains
- Documents cross-domain interface contracts
- Tracks domain maturity/scaling stages
- Serves as the entry point for both Claude Code and Cursor

This file is the "org chart" of the system — it tells any agent or developer where to look and who owns what.

### 2.4 Evolutionary Scaling Stages

Each domain moves through scaling stages independently:

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────────┐
│ Inline  │ →  │  Async  │ →  │  Queued  │ →  │ Separate  │ →  │ Distributed  │
│ (sync)  │    │ (fire & │    │ (BullMQ/ │    │ Service   │    │  Service     │
│         │    │  forget) │    │  SQS)    │    │ (own DB)  │    │  (own infra) │
└─────────┘    └─────────┘    └──────────┘    └───────────┘    └──────────────┘
```

The interface stays stable across stages. The implementation behind it evolves. This is the core promise: **the interface is the architecture, the implementation is the current stage.**

### 2.5 Observability as First-Class Input

Observability data is the *most important input* to the system. Without it, evolution decisions are guesswork. Each domain agent is responsible for:

- **Instrumenting its domain** — key metrics, structured logs, traces
- **Defining scaling triggers** — "when metric X crosses threshold Y, consider evolution Z"
- **Tracking usage patterns** — which endpoints are hot, which are cold, where latency lives

When agents build features or address tech debt, they do so with observability in mind:
- New code paths get instrumented
- Feature flags include usage tracking
- Performance-sensitive paths get latency metrics

This creates a feedback loop:
```
Build → Instrument → Observe → Decide → Evolve → Build...
```

### 2.6 Tech Debt as Shared Context

Each domain agent maintains an explicit tech debt register. This serves two purposes:

1. **Feature development consensus** — when a feature spans multiple domains, the tech debt from each affected domain informs the approach. If the email domain has a known bottleneck and the feature will increase email volume, the agent surfaces this during planning.

2. **Evolution prioritization** — tech debt items are linked to scaling stages. "No retry logic" matters more when you're at the queued stage than when you're inline. The agent knows what debt matters *now* vs. what can wait.

---

## 3. Agent File Format

Agent files live in a location compatible with both Claude Code and Cursor. The format is Markdown with structured sections:

```
agents/
  email.md
  billing.md
  auth.md
  ...
AGENTS.md          # root system map
```

### 3.1 Individual Agent File Structure

```markdown
# [Domain Name] Agent

## Purpose
One paragraph: what this domain does in business terms. Why it exists.
What problem does it solve for the end user?

## Ownership
- **Files**: `src/email/**`, `src/templates/email/**`
- **Database**: `emails`, `email_templates`, `email_logs` tables
- **Routes**: `/api/email/*`, `/api/notifications/*`
- **Config**: `EMAIL_*` environment variables

## Interfaces

### Exposed (other domains call these)
- `sendEmail(to, template, data)` → `Promise<{id, status}>`
- `scheduleEmail(to, template, data, sendAt)` → `Promise<{id}>`
- `getEmailStatus(id)` → `Promise<{status, sentAt, openedAt}>`

### Consumed (this domain calls these)
- `auth.getUserEmail(userId)` → gets recipient address
- `billing.getSubscriptionTier(userId)` → determines email limits

## Scaling Stage
**Current: Async (fire-and-forget)**

Emails are dispatched via `setImmediate()` in the Node event loop.
No queue, no retry, no persistence of send attempts.

### Evolution Path
- → **Queued (BullMQ)**: When send volume > 500/min or when retry
  logic is needed. Interface stays the same. Add Redis + BullMQ worker.
- → **Separate Service**: When email logic warrants its own deployment
  unit. Extract to microservice behind same interface.

## Technical Debt
- [ ] No retry logic for transient provider failures (impact: high when volume grows)
- [ ] Templates are loaded from disk on every send, not cached (impact: low)
- [ ] No dead letter handling — failed sends are silently dropped (impact: high)
- [ ] Provider is hardcoded to SendGrid — no abstraction for switching (impact: medium)

## Observability

### Current Instrumentation
- `email.send.count` — counter, emails dispatched per minute
- `email.send.error` — counter, failed sends by error type
- `email.send.latency` — histogram, time from request to provider response

### Gaps (need to add)
- Open/click tracking metrics
- Per-template send volume breakdown
- Queue depth (when queue is introduced)

### Scaling Triggers
- `email.send.count > 500/min` → introduce BullMQ queue
- `email.send.error > 5%` → investigate provider, add retry logic
- `email.send.latency_p99 > 3s` → investigate provider performance

## Domain Rules
- All email sends MUST go through the `EmailService` interface — no direct provider calls
- Template changes must be backwards-compatible (old data shapes still render)
- New email types require an observability metric before shipping

## Context for AI Agents
When working in this domain:
- Check tech debt list before implementing features that touch email volume
- Instrument any new code paths with metrics
- Preserve the interface contract — implementation can change, signatures cannot
- Test with provider mock in unit tests, real provider in integration tests
```

### 3.2 AGENTS.md Structure

```markdown
# System Agents Map

## Overview
Brief description of the system and its business purpose.

## Domains

| Domain | Agent File | Scaling Stage | Owner |
|--------|-----------|---------------|-------|
| Email | [agents/email.md](agents/email.md) | Async | - |
| Billing | [agents/billing.md](agents/billing.md) | Inline | - |
| Auth | [agents/auth.md](agents/auth.md) | Inline | - |

## Domain Dependency Graph
```
auth ← billing
  ↑       ↑
  └── email ──→ templates
```

## Cross-Domain Contracts
List of interface contracts between domains with version/stability notes.

## Global Architecture Rules
- Domains communicate ONLY through defined interfaces
- No direct database access across domain boundaries
- Each domain instruments its public interface methods
- Tech debt in one domain that affects another must be surfaced in both agent files
```

---

## 4. Discovery Engine

The discovery engine analyzes a TypeScript/Node codebase to identify domains. It uses multiple signals, weighted and combined.

### 4.1 Analysis Passes

**Pass 1: Structure Analysis**
- Parse directory tree
- Identify top-level organizational pattern (feature-based vs. layer-based vs. mixed)
- Map `package.json` workspaces if monorepo
- Read `tsconfig.json` path aliases

**Pass 2: Import Graph**
- Use TypeScript compiler API to resolve all imports
- Build a directed graph of file dependencies
- Run community detection / clustering algorithm (e.g., Louvain) to find natural clusters
- Files that import each other heavily are likely in the same domain

**Pass 3: Naming & Convention Analysis**
- Extract common prefixes/suffixes from filenames and exports
- Identify framework patterns:
  - Express/Fastify: route files → business capabilities
  - Next.js: `app/` or `pages/` directory → feature areas
  - NestJS: modules → natural domain boundaries
- Map database models/schemas to domains

**Pass 4: Dependency Analysis**
- Analyze `package.json` dependencies for domain hints:
  - `@sendgrid/mail`, `nodemailer` → email domain
  - `stripe`, `@paddle/paddle-node-sdk` → billing domain
  - `passport`, `jsonwebtoken`, `bcrypt` → auth domain
  - `@aws-sdk/client-s3` → storage/media domain
- Map external service integrations to domains

**Pass 5: Interface Detection**
- Find exported classes/functions that are imported across clusters
- These are the natural interface points between domains
- Identify patterns: service classes, repository patterns, event emitters
- Flag tight coupling: direct class instantiation across clusters vs. dependency injection

### 4.2 Output

The discovery engine produces a **domain proposal**:

```json
{
  "domains": [
    {
      "name": "email",
      "confidence": 0.92,
      "files": ["src/email/**", "src/templates/email/**"],
      "signals": {
        "directory": "src/email/ exists as distinct directory",
        "imports": "87% of imports are internal to cluster",
        "dependencies": "uses @sendgrid/mail, nodemailer",
        "naming": "12 files with 'email' prefix"
      },
      "interfaces": [
        {
          "file": "src/email/email.service.ts",
          "exports": ["sendEmail", "scheduleEmail"],
          "importedBy": ["src/billing/invoice.service.ts", "src/auth/password-reset.ts"]
        }
      ],
      "coupling": {
        "auth": 0.15,
        "billing": 0.23,
        "users": 0.08
      }
    }
  ]
}
```

### 4.3 Clustering Strategy

Not every codebase will have clean directory-per-domain structure. The clustering algorithm handles:

- **Feature-organized codebases** (easy) — directories map to domains
- **Layer-organized codebases** (harder) — must cluster across `controllers/`, `services/`, `models/` by business capability
- **Mixed / flat codebases** (hardest) — rely heavily on import graph + naming

For layer-organized and mixed codebases, the import graph is the primary signal. The algorithm:
1. Build the file-level import graph
2. Weight edges by import frequency and type (type imports weigh less than value imports)
3. Run modularity-based clustering
4. Validate clusters against naming patterns
5. Propose domain names from the most common terms in each cluster

---

## 5. CLI Design

```
domain-agents <command> [options]

Commands:
  discover [path]     Analyze a codebase and propose domains
  init [path]         Generate agent files and AGENTS.md from a proposal  
  health [path]       Check domain boundaries, coupling, and agent file staleness
  update [domain]     Re-analyze a specific domain and update its agent file
  graph [path]        Output domain dependency graph (text, mermaid, or dot format)

Global Options:
  --format <format>   Output format: claude | cursor | both (default: both)
  --config <path>     Path to config file (default: .domain-agents.json)
  --verbose           Detailed output during analysis
```

### 5.1 `discover` Flow

```
$ domain-agents discover ./my-app

Analyzing codebase...
  ✓ Structure analysis (142 files, 3 top-level directories)
  ✓ Import graph (847 edges across 142 nodes)
  ✓ Naming analysis (found 6 naming clusters)
  ✓ Dependency analysis (found 4 external service integrations)
  ✓ Interface detection (found 8 cross-boundary interfaces)

Proposed Domains:
  1. auth        (14 files, confidence: 94%)  — authentication, sessions, password management
  2. billing     (22 files, confidence: 89%)  — subscriptions, invoices, payment processing
  3. email       (11 files, confidence: 91%)  — transactional email, templates, delivery
  4. users       (18 files, confidence: 86%)  — user profiles, preferences, teams
  5. content     (31 files, confidence: 78%)  — documents, media, storage
  6. search      (8 files, confidence: 72%)   — full-text search, indexing

  ⚠ 38 files not assigned to any domain — review manually

Save proposal? (Y/n) y
Saved to .domain-agents/proposal.json

Next: review and adjust the proposal, then run `domain-agents init`
```

### 5.2 `init` Flow

```
$ domain-agents init ./my-app

Reading proposal from .domain-agents/proposal.json...

Generating agent files:
  ✓ agents/auth.md
  ✓ agents/billing.md
  ✓ agents/email.md
  ✓ agents/users.md
  ✓ agents/content.md
  ✓ agents/search.md
  ✓ AGENTS.md (system map)

Done. Review the generated files and refine as needed.
```

### 5.3 `health` Flow

```
$ domain-agents health ./my-app

Domain Health Report:
  auth      ✓ healthy (coupling: low, tech debt: 2 items)
  billing   ⚠ coupling with users is high (0.41) — 7 direct imports bypass interface
  email     ✓ healthy (coupling: low, tech debt: 3 items)
  users     ⚠ 4 new files not covered by agent boundary
  content   ✓ healthy
  search    ✗ agent file is stale — 12 files added since last update

Recommendations:
  1. billing ↔ users: Extract shared types to a contract file
  2. users: Update agent boundary to include src/users/preferences/*
  3. search: Run `domain-agents update search` to refresh
```

---

## 6. Integration

### 6.1 Claude Code Integration

**Option A: AGENTS.md at project root (simplest)**
Claude Code reads AGENTS.md as project context. Each agent file is linked and can be referenced. When working in a domain, the developer (or a hook) tells Claude to load the relevant agent file.

**Option B: Hook-based context loading**
A Claude Code hook detects which files are being edited and automatically loads the relevant domain agent context. For example:
- Developer edits `src/email/send.ts`
- Hook matches file path to email domain
- Hook injects email agent context into the session

This is the more powerful approach — it means the right agent context is *always* present without manual intervention.

**Research needed**: Investigate how beans (and similar tools) achieve automatic agent context loading via hooks. The mechanism would be:
1. On file edit/read, match file path against domain boundaries
2. Load the matching agent file as additional context
3. If multiple domains are touched, load all relevant agents + flag cross-domain work

### 6.2 Cursor Integration

Cursor reads `.cursorrules` and project-level rule files. AGENTS.md could be:
- Directly referenced in `.cursorrules`
- Or agent files could be placed in `.cursor/rules/` with glob-based activation

### 6.3 Format Compatibility

The agent file format should be tool-agnostic Markdown that works with any AI coding tool. The `--format` flag controls where files are placed:
- `claude`: `AGENTS.md` at root + `agents/` directory
- `cursor`: `.cursor/rules/` with glob-matched rule files
- `both`: generates both formats from the same source

---

## 7. Tech Debt Consensus Protocol

When a feature spans multiple domains, the system surfaces a **consensus view** of tech debt:

```
Feature: "Add invoice email reminders"
Affected domains: billing, email

Tech debt relevant to this feature:
  billing:
    - Invoice status tracking is incomplete — no "reminder_sent" state
  email:
    - No retry logic — reminder emails could silently fail
    - No scheduling — reminders need delayed send capability
    
Recommendation:
  Address email scheduling debt as part of this feature (required).
  Add retry logic while you're in the email domain (opportunistic).
  Add "reminder_sent" invoice status (required).
```

This consensus is built by:
1. Identifying which domains the feature touches (from the description or file changes)
2. Loading each domain's tech debt register
3. Filtering to items relevant to the feature
4. Presenting the combined view with recommendations

---

## 8. Observability-Driven Evolution

The observability → evolution pipeline:

### 8.1 Metrics Collection
Each domain agent specifies what metrics it needs. The tool can generate:
- Metric definition boilerplate (OpenTelemetry, Prometheus, custom)
- Logging standards for the domain
- Trace span suggestions for key operations

### 8.2 Scaling Trigger Evaluation
Periodically (or on-demand), compare actual metrics against scaling triggers:
- If a trigger is hit, the agent recommends the next evolution step
- The recommendation includes: what to change, estimated effort, interface impact (should be none)

### 8.3 Dashboard Generation
Future: generate observability dashboard definitions (Grafana JSON, Datadog monitors) from the agent's metric specifications.

---

## 9. Agent Consolidation and Splitting

### 9.1 Starting Consolidated
For a small codebase (< 50 files), start with 2-3 broad agents:
- `core.md` — auth, users, core business logic
- `integrations.md` — email, payments, external services
- `infrastructure.md` — storage, search, caching

### 9.2 When to Split
An agent should be split when:
- Its file count exceeds ~30-40 files
- Its tech debt register has items that don't affect each other
- Different parts of the agent are at different scaling stages
- Multiple developers/agents frequently work in the domain simultaneously

### 9.3 How to Split
```
$ domain-agents split integrations --into email,billing

Analyzing integrations domain...
  Proposed split:
    email (11 files): src/email/**, src/templates/email/**
    billing (22 files): src/billing/**, src/payments/**
    
  New interfaces needed:
    - billing → email: sendInvoiceEmail (currently internal call)
    
  Generating:
    ✓ agents/email.md (split from integrations)
    ✓ agents/billing.md (split from integrations)
    ✗ agents/integrations.md (archived)
    ✓ AGENTS.md updated
```

---

## 10. Open Questions

1. **How to handle shared/utility code?** — Files like `src/utils/`, `src/lib/` don't belong to any domain. Options: assign to a "shared" pseudo-domain, or leave unowned and flag when they grow.

2. **How to version interface contracts?** — When an interface changes, all consumers need updating. Should the tool track interface versions? Or is git history sufficient?

3. **How opinionated should generated agent files be?** — Should the tool recommend specific scaling technologies (BullMQ, SQS) or stay abstract ("introduce a queue")?

4. **How to integrate real observability data?** — The agent file can *specify* metrics, but reading *actual* metric values requires connecting to Prometheus/Datadog/etc. Is this in scope for v1?

5. **Multi-repo / monorepo support?** — Should the tool handle monorepos with multiple packages? Each package could be its own domain, or domains could span packages.

6. **How to handle the "operator" role?** — When agents disagree or a cross-domain decision is needed, how is this surfaced? A special `domain-agents resolve` command? A PR comment workflow?

---

## 11. Prototype Scope (v0.1)

### In Scope
- [ ] Discovery engine: directory analysis, import graph (TS compiler API), naming patterns, dependency analysis
- [ ] Domain clustering algorithm
- [ ] Interactive proposal review (CLI prompts)
- [ ] Agent file generation (Markdown format above)
- [ ] AGENTS.md generation
- [ ] Basic coupling score between domains
- [ ] `discover`, `init`, `health` commands

### Out of Scope (v0.2+)
- Hook-based automatic context loading
- Real observability data integration
- Dashboard generation
- CI/CD integration
- Auto-splitting recommendations
- Multi-repo support
- Interface version tracking
- Cursor-specific format generation

---

## 12. Technical Stack (for the tool itself)

- **Language**: TypeScript
- **Runtime**: Node.js
- **CLI framework**: Commander.js or similar
- **TS analysis**: TypeScript Compiler API (`ts.createProgram`, `ts.createSourceFile`)
- **Graph analysis**: Custom or graphology (for clustering)
- **CLI interaction**: Inquirer.js or prompts (for interactive proposal review)
- **Output**: Markdown generation, JSON for intermediate state
- **Package**: Published to npm as `domain-agents`
