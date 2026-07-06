# AURIX v6 → v7 Migration — Claude Code Task Spec

> **Amendments (Batch 2, post-Phase-0):** §2.4 error contract, §2.4 C-1
> addendum, §2.3 vocab surface, and Phase 3 emitter #2 have been reconciled
> with the Phase-0 audit (C-1, C-2, C-4, C-6). Amended passages are marked
> `[AMENDED B2]`.

Paste this file into the repo root (or point Claude Code at it) and instruct:
"Execute CLAUDE_CODE_TASK_aurix-v7-migration.md phase by phase. Stop after each
phase and report before continuing."

---

## Context (read first, do not skip)

AURIX pivots from "proprietary semantic protocol agents adopt" to
**"compiler + trust layer that emits the standards agents already consume."**

New architecture in one line: a typed Intermediate Representation (IR) is the
single source of truth; DOM data-* attributes, Schema.org JSON-LD, WebMCP
tools, /.well-known manifests, an MCP server, and a detached signature are all
**emitted projections** of that IR. The paid product is parity/drift
monitoring; the moat is site→agent attestation (signature proves origin for a
domain — never "safe" or "trusted").

## Ground rules

1. Work phase by phase. One branch + PR per phase. Conventional commits.
2. Locate modules by content (grep for function/symbol names given below),
   not by assumed paths. If a named module does not exist, create it.
3. Tests before refactors: for every behavior you change, first pin current
   behavior with a failing/passing test, then change.
4. Never weaken a security default to make a test pass.
5. If a task conflicts with something you find in the repo, stop and report —
   do not silently reconcile.
6. Do not add scope beyond this file. Non-goals listed at the end are binding.

---

## Phase 0 — Audit (no code changes)

- Inventory the monorepo: packages, entry points, test coverage per package.
- Locate by content: ix classification rules (verb-prefix action heuristic),
  expander (cheerio/DOM transform), canonical JSON serializer, signature
  module (HMAC/JWS, env key like `AURIX_SIGNING_KEY`), USHE heuristic engine
  (look for `randomUUID`), CSR runtime (`aurix:update` listener), AEO package.
- Output: `MIGRATION_AUDIT.md` mapping each item in Phases 1–5 to actual
  file paths, plus anything that contradicts this spec.

## Phase 1 — Deletions (subtraction before addition)

Create an `archive/v6-full` branch first, then on the migration branch remove:

- `@aurix/aeo` (agent-side action executor) — agents execute via
  WebMCP/browser mediation; we do not ship an executor.
- AVR registry service code — replaced by local `vocab.config` (Phase 2).
- Agent Interface Service — replaced by one signed graph endpoint + JWKS.
- PHP/Laravel injector, Canvas protocol mapper, Portal UI.
- Remove per-request SSR expansion as the default path: static structure is
  compiled at build time; runtime only patches dynamic values and
  re-registers tools. Keep a dev-mode on-request transform behind a flag.

Update workspace configs, CI, and docs references so the build is green with
these gone.

## Phase 2 — Core fixes (order matters)

### 2.1 Kill the action heuristic
In the ix classification rules: delete verb-prefix guessing (the class of bug
where `address` classifies as an action). New rule: **an action exists only if
it declares a contract** — an associated `<form>`, an explicit
endpoint+method, or a code-registered handler. No contract → classified as a
field, plus a lint warning. Add regression test: `ix="address"` on a plain
element must NOT produce an action or tool.

### 2.2 Mandatory stable IDs
Entity identity = author-assigned ID (`#SKU123` style) — required. Missing ID
on an entity = lint **error** (build fails in strict mode). Structural DOM
paths are demoted to debug locators only; they must not feed IDs, hashes, or
signatures. Regression test: inserting a sibling element before an entity
must not change any entity ID or the graph signature.

### 2.3 Typed IR + vocab.config
Introduce the IR package (e.g. `@aurix/ir`):
- Node kinds: Entity, Field, Action. All typed; no `any` in public types.
- Field type bindings: `money`, `quantity`, `date`, `enum`, `url`, `text`.
  Money fields serialize as `{ value: number, currency: string, display:
  string }` — never scraped display text as the value.
- `[AMENDED B2]` Vocabulary surface = **one exported, serializable
  `vocab.config.ts`** module (the local mapping of AURIX terms → Schema.org
  types and properties). In-code definition is fine; the requirement is a
  single module boundary. This **replaces AVR** entirely.
- IR is canonical: sorted keys, stable ordering, versioned envelope.
- Three ingestion frontends normalize into the same IR:
  (a) existing ix-attribute parser, (b) code-first API
  `defineEntity()/defineAction()` with Zod schemas, (c) the scanner (2.5).

### 2.4 Action safety trio (highest-value change in the migration)
Every IR Action gets:
- `sideEffects: "none" | "write" | "payment" | "destructive"` — **required**,
  no default. Missing = validation error at IR construction.
- `preconditions`: `{ auth?: boolean, requires?: string[] }`.
- `outputSchema` (Zod/JSON Schema) + structured error contract.
  `[AMENDED B2]` (C-4) Error contract shape is **`{ code, message,
  retriable }`** (repo shape wins over the earlier `{ error, code }`).

`[AMENDED B2]` **C-1 rule (verbatim, binding):**
> "sideEffects derivation is FORBIDDEN in core, IR construction, and all
> emitters. Heuristic derivation may exist only in the scanner as a
> *proposal* a human confirms. No compile-time or runtime default exists."

Emitters consume these in Phase 3.

### 2.5 USHE → onboarding scanner
- Replace `randomUUID()` node IDs with deterministic content-derived IDs
  (hash of entity type + key fields). Same input → same output, always.
- Repackage as CLI command `aurix scan`: reads existing markup (forms,
  Schema.org microdata/JSON-LD, data-*), outputs a **proposed IR diff** for
  human confirmation — it never writes IR directly.
- Tag content from UGC regions (reviews, comments) as `trust: "low"`;
  money and action fields always require explicit per-field confirmation.

### 2.6 Signing overhaul
- Sign the **exact bytes of each emitted artifact** (sidesteps the
  pseudo-RFC-8785 canonical JSON problem). Detached JWS.
- Default algorithm **Ed25519**; ES256/P-256 supported. HMAC demoted to
  `internal` mode behind an explicit `trust: "internal"` config — never valid
  for public verification; document why (shared symmetric key = any verifier
  can forge).
- Publish JWKS at `/.well-known/` with `kid` = RFC 7638 thumbprint. Key
  rotation: removing a key from JWKS invalidates its signatures.
- Every signed envelope carries `iat`; every IR node may carry `ttl`.
  Verifier rejects expired.
- Key sourcing: env var path stays for dev; document KMS/HSM as the
  production path; never log key material.

## Phase 3 — Emitters (each version-pinned, golden-snapshot tested)

Shared emitter interface in `@aurix/core`; one package per target. Golden
tests: fixture IR in → committed expected artifact out; any diff fails CI.

1. `@aurix/emit-jsonld` — Schema.org JSON-LD from IR via vocab.config.
   Products emit as Product/Offer with numeric price + priceCurrency.
2. `@aurix/emit-webmcp` —
   - Imperative: `navigator.modelContext.registerTool(tool, { signal })`
     with AbortSignal lifecycle tied to route/component unmount.
   - `annotations.readOnlyHint = (sideEffects === "none")`.
   - Tools for `payment`/`destructive` actions must route through the
     user-interaction gate (`client.requestUserInteraction()` pattern).
   - Wrap with `@mcp-b/global` polyfill; step aside when native exists.
   - Declarative form attributes: emit only behind `unstable_declarative`
     flag (spec section is TODO upstream). Pin to the spec draft in the
     webmachinelearning/webmcp repo — track the repo, not blog posts.
   - `[AMENDED B2]` (C-6) Includes the `aurix:update` patch runtime: updates
     drive value patching and tool re-registration via AbortSignal.
   - `[AMENDED B2]` **Safety metadata (sideEffects, preconditions) is immutable
     post-attestation; `aurix:update` may patch values only, never safety
     fields; any runtime safety-field delta is a parity alarm, not an update.**
     (Rationale: once the patch runtime exists, live DOM attributes are
     attacker-writable surface — an XSS flipping `destructive`→`none` must be
     detected, not honored.)
3. `@aurix/emit-manifest` — /.well-known outputs: capability manifest,
   JWKS, and an **attestation-pinning policy** (`{"signs": "always",
   "max-age": <seconds>}`): verifiers that have seen it treat a missing
   signature as an alarm, not a fallback (HSTS analogy).
4. `@aurix/mcp-server` — same tool definitions served over MCP for headless
   agents. Thin; reuse Action contracts; no new business logic.
5. Existing data-* HTML output becomes emitter #5 (keep XSS-safe script
   serialization exactly as is).

## Phase 4 — Trust layer

1. `@aurix/verify` (OSS): verifies signatures against domain-bound JWKS.
   - Public API returns **only** `{ authenticFor: "<origin>" } | { failure }`.
     There must be no boolean named `trusted`/`safe` anywhere in the API.
   - Hard caps: max graph bytes, max node count, max depth — reject over-cap
     before parsing fully (hash-bomb defense).
   - Optional DOM spot-check: sample N signed fields against rendered DOM;
     report divergence ("two-faces" detection).
2. `aurix parity` (CLI + CI): compares IR ↔ emitted JSON-LD ↔ registered
   tools ↔ live DOM values. Exit non-zero on drift. Detects: changed tool
   descriptions post-attestation (rug-pull class), unattested extra
   registered tools (XSS `registerTool` injection), value divergence.
3. Description linter (compile-time, on by default): reject imperative/
   instruction-shaped text, hidden Unicode (zero-width, bidi controls,
   confusables), and length over cap in tool names/descriptions.

## Phase 5 — Supply-chain hardening

- npm publish with provenance (`--provenance`), 2FA required, **zero**
  postinstall scripts in any package (CI check that fails if one appears).
- Dependency audit: minimize; justify cheerio and jose transitive trees in
  `MIGRATION_AUDIT.md`; pin versions; enable lockfile-only installs in CI.
- Reproducible builds where the toolchain allows; document gaps.

## Phase 6 — Documentation rewrite

Rewrite the four docs as v7 (rename `v6_*` → `v7_*`), enforcing:

- **Core Development Guide**: architecture section = IR-centric (inputs →
  IR → emitters → verification); signing section = Ed25519 default / JWKS /
  iat+ttl / HMAC internal-only; add two philosophy lines: "emitted standards
  over proprietary consumption" and "signatures prove origin, never safety";
  remove Canvas; document the action safety trio.
- **Implementation Plan**: milestones = Phases 1–5 of this file; add verifier
  SDK + parity monitor milestones; replace per-request perf targets with
  build-time compilation + runtime patch/re-register budgets.
- **Packages and Services**: remove @aurix/aeo, AVR, Agent Interface, Portal;
  add @aurix/ir, emit-jsonld, emit-webmcp, emit-manifest, mcp-server, verify;
  Observatory re-described as the commercial parity/drift monitor.
- **Corporate/Go-to-market Plan**: goal reworded to "make existing agents
  (Gemini, Copilot, Atlas, Claude) succeed on our surfaces"; roles collapsed
  to 2 engineers + 1 product; KPIs add parity-drift incidents caught,
  signature verification rate, Agent Readiness Score delta; checklist swaps
  "AEO policies set" for "sideEffects gating verified" and adds "JWKS
  published / pinning policy live".

## Definition of Done (the demo)

On a sample Next.js store in the repo:
1. Product page emits JSON-LD + registered WebMCP tools compiled from IR.
2. `checkout` action carries `sideEffects: "payment"` and is gated;
   `readOnlyHint` correct on read tools.
3. Graph + artifacts signed; `@aurix/verify` validates against local JWKS
   and reports `authenticFor` the dev origin.
4. A deliberately seeded drift (edit one tool description post-build) makes
   `aurix parity` exit non-zero and name the changed field.
5. All golden tests green; `ix="address"` regression test green; sibling-
   insertion ID-stability test green; no package has postinstall scripts.

## Non-goals (binding)

- No public vocabulary registry, no agent-side executor, no Portal UI,
  no Laravel/Canvas integrations.
- No API, flag, badge, or doc language implying signed = safe/trusted.
- No new protocol features not listed here.

## Report back to the human

After Phase 0 and after DoD: file paths changed, tests added, anything in the
repo that contradicted this spec, and open decisions (KMS provider, design-
partner site, monorepo layout changes).
