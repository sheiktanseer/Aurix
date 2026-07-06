# AURIX v6 → v7 Migration — Phase 0 Audit

_Generated for `CLAUDE_CODE_TASK_aurix-v7-migration.md`. No code changed in this phase._

Repo root: `D:\Claude\aurix_v6_detailed_docs` (a git repo).
Remote: `origin → https://github.com/sheiktanseer/Aurix.git`. Branch: `main`.
Test baseline: **92 tests / 7 suites green** (`npx jest`). TypeScript strict build clean.

---

## 0. Headline findings (read before planning any phase)

1. **This is not a monorepo.** The repo contains exactly one flat package,
   `aurix-v6-core`, plus four untracked design docs. The many `@aurix/*`
   packages and services the spec's Phase 1 tells us to *delete*
   (`@aurix/aeo`, AVR service, Agent Interface Service, PHP/Laravel injector,
   Canvas mapper, Portal UI) **do not exist as code** — they appear only in
   `v6_All_Packages_and_Services.md`. Phase 1 is therefore mostly a
   **docs/scope deletion**, not a code deletion. See §3.
2. **Phase 2 is already partially implemented and committed.** During an
   earlier "Tier 1" request in this session, a typed IR layer, contract-based
   action classification, mandatory-ID lint, and an agent-safety trio were
   built and committed at HEAD (`59c4c37 "Another commit"`). This *pre-empts*
   the spec's phase ordering (which wants Phase 1 deletions first) and, in one
   place (§4, item C-1), **conflicts with the spec**. Per ground rules 5–6 I
   stopped rather than reconcile. **Decision needed** (§5, D-1).
3. **The four design docs are untracked** (`?? v6_*.md`) — never committed.
   Phase 6 renames them `v7_*`.
4. **No Next.js sample store exists** — `src/examples/nextjs-example/` is a
   98-byte README stub. The Definition of Done demo needs a real one (§5, D-2).
5. **Signing (2.6) and USHE→scanner (2.5) are untouched** — still the v6
   design (canonical-JSON detached JWS; `randomUUID` node IDs).

---

## 1. Package inventory

| Item | Reality |
|---|---|
| Layout | Single package `aurix-v6-core` (not `packages/*`). `private: true`, name `aurix-v6-core`, `main: dist/index.js`. |
| Entry point | `src/index.ts` (barrel). CLI-ish: `src/validator/validate.ts` (`npm run validate`). Example server: `src/examples/express-example/server.ts`. |
| Build | `tsc -p .` + `scripts/copy-assets.mjs` (postbuild). |
| Deps | `cheerio`, `domhandler`, `express`, `jose@^4`, `ajv`, `ajv-formats`. |
| Tests | 7 Jest suites, 92 tests, all green. Coverage tooling present (`coverage/`, `jest --coverage`). |
| postinstall scripts | **None** in `aurix-v6-core/package.json` (good; Phase 5 CI check still to add). |

### Source tree (`aurix-v6-core/src`)
```
core/parser.ts        HTML → ix AST (uses randomUUID for transient AST ids)
core/expander.ts      cheerio DOM transform; ix* → data-*; builds IR graph script
core/ix-rules.ts      classification (CONTRACT-based post-Tier1; see §3/§4)
core/canonical.ts     structuralPath, deriveNodeId, sortKeys, canonicalJson (pseudo-RFC-8785)
core/ushe.ts          heuristic inference engine (uses randomUUID)  ← Phase 2.5 target
ir/types.ts           IR type defs (Entity/Field/Action, safety trio)   ← new (committed)
ir/values.ts          typed value parsing (money/date/url/enum/…)       ← new (committed)
ir/vocab.ts           DEFAULT_VOCAB + resolveFieldType (in-code, not a file) ← new
ir/safety.ts          deriveSideEffects/preconditions/outputSchema       ← new (see C-1)
ir/build.ts           buildIr($): DOM → typed IR                          ← new
ir/lint.ts            lintIr: E_MISSING_ID, E_UNTYPED_MONEY, …            ← new
server/signature.ts   HMAC/JWS + detached JWS over canonical JSON (AURIX_SIGNING_KEY) ← Phase 2.6 target
client/aurix-expand.ts CSR runtime; dispatches `aurix:expanded` (NOT `aurix:update`)
validator/validate.ts  ajv graph validator (the "aurix-cli" seed)
examples/express-example/  working demo server
examples/nextjs-example/   README stub only (no app)               ← DoD gap
```

---

## 2. Test coverage per area (current)

| Suite | Covers |
|---|---|
| `parser.test.ts` | ix AST parse (1 test). |
| `expander.test.ts` | ix→data-*, nested-entity no-leak, action button no-fake-field. |
| `ix-rules.test.ts` | contract classification, phantom-tool suppression, `address` regression, SSR/CSR parity. |
| `mode.test.ts` | canonical/debug/compact stripping. |
| `canonical.test.ts` | deterministic canonicalJson, stable derived IDs (insert-**after**), detached sign/verify. |
| `security.test.ts` | script-breakout escaping, `resolveKeyConfig` fail-loud, sign/verify round-trips, alg pinning. |
| `ir.test.ts` (uncommitted) | typed values, vocab, safety-trio derivation, lint E_MISSING_ID. |

**Gaps vs spec:** no golden-snapshot emitter tests (none exist yet); no
sibling-insert-**before** ID-stability test (spec 2.2); no JWKS/ttl/expiry
tests; no parity/drift tests; no description-linter tests.

---

## 3. Content-location map — Phases 1–5 → actual paths

### Phase 1 — Deletions
| Spec target | Found at | Action |
|---|---|---|
| `@aurix/aeo` executor | **absent in code** (doc §4 only) | Delete doc section; nothing to remove in code. |
| AVR registry service | **absent in code** (doc §Services-1); superseded by `ir/vocab.ts` | Delete doc; promote vocab to a `vocab.config` file (2.3). |
| Agent Interface Service | **absent in code** (doc §Services-3) | Delete doc; replace with signed-graph endpoint + JWKS (2.6/3.3). |
| PHP/Laravel injector | **absent** | none in code. |
| Canvas protocol mapper | **absent** | none in code. |
| Portal UI | **absent in code** (doc §Portal) | Delete doc. |
| Per-request SSR as default | `core/expander.ts` `expandHtmlServerSide` (the express example calls it per-request) | Rework: build-time compile default; keep on-request behind dev flag. |

### Phase 2 — Core fixes
| Spec item | Location | Status |
|---|---|---|
| 2.1 kill verb-prefix heuristic | `core/ix-rules.ts` `classifyShortIx` / `detectContract` | **Done (committed).** Verb-prefix deleted; contract-gated; `address` regression test present. |
| 2.2 mandatory stable IDs | `core/canonical.ts` `deriveNodeId`; `ir/lint.ts` `E_MISSING_ID`; `ir/build.ts` `authoredId` | **Partial.** Author `#id` mandatory via lint *error*; structural path demoted to debug-only. Missing: strict-mode **build failure** gate; insert-**before** stability *test*. |
| 2.3 typed IR + vocab.config | `ir/*` | **Partial.** IR + typed money/date/url/enum/number/bool/text done. Missing: `vocab.config.(ts\|json)` **file**; code-first `defineEntity/defineAction` + **Zod**; distinct `quantity` type; scanner frontend. |
| 2.4 action safety trio | `ir/safety.ts`, `ir/types.ts` | **Partial + CONFLICT (C-1).** Trio present but `sideEffects` is *derived with a default*; spec requires *author-required, no default, missing = lint error*. |
| 2.5 USHE → scanner | `core/ushe.ts` (`randomUUID`) | **Not started.** No deterministic IDs, no `aurix scan` CLI, no IR-diff, no UGC `trust:"low"` tagging by scanner. |
| 2.6 signing overhaul | `server/signature.ts`, `core/canonical.ts` `canonicalJson` | **Not started.** Still canonical-JSON detached JWS; HMAC not demoted to `internal`; no Ed25519-default enforcement, no JWKS/`.well-known`, no RFC 7638 `kid`, no `iat`+`ttl` expiry. |

### Phase 3 — Emitters
| Emitter | Seed present? |
|---|---|
| `@aurix/emit-jsonld` | none (vocab has schema.org URIs to build from). |
| `@aurix/emit-webmcp` | none (`registerTool`/`modelContext` absent). |
| `@aurix/emit-manifest` (+JWKS, pinning) | none. |
| `@aurix/mcp-server` | none. |
| data-* HTML emitter (#5) | **exists** as `expander.ts` output + `serializeGraphJson` (keep XSS-safe path as-is). |

### Phase 4 — Trust layer
| Item | Seed |
|---|---|
| `@aurix/verify` (authenticFor only) | none. `verifyGraphDetached` exists but is graph-digest, not domain-bound JWKS. |
| `aurix parity` monitor | none. |
| description linter | none (`ir/lint.ts` is a start-point pattern). |

### Phase 5 — Supply chain
| Item | State |
|---|---|
| npm provenance / 2FA / zero postinstall | no postinstall present; no CI gate yet; `private:true` today. |
| dep audit (cheerio, jose trees) | not documented; jose is `^4` (v5 is current — decide upgrade). |
| reproducible builds | not configured. |

---

## 4. Contradictions with the spec (ground rule 5 — reported, not reconciled)

- **C-1 (blocking, security-relevant): `sideEffects` default vs. required.**
  Spec 2.4: "`sideEffects` … **required**, no default. Missing = lint error."
  Committed `ir/safety.ts` `deriveSideEffects()` instead *infers* a value
  (DELETE→destructive, checkout→payment, POST→write, else none). This is a
  convenience default the spec forbids. It is also arguably a *weak default*
  (an unrecognized mutating verb could fall to `none`). **Plan:** in Phase 2,
  make author-declared `sideEffects` mandatory, keep derivation only as a
  *lint suggestion*, and add `E_MISSING_SIDE_EFFECTS`. Needs sign-off (D-1).
- **C-2: vocab is in-code, spec wants a file.** `ir/vocab.ts` `DEFAULT_VOCAB`
  works but the spec wants `vocab.config.(ts|json)` as the AVR replacement.
  Low risk; convert in Phase 2.3.
- **C-3: no Zod.** Spec 2.3/2.4 name Zod for field/action/output schemas;
  current IR uses hand-rolled TS types + a JSON-schema-ish error contract.
  Adds a dependency; confirm before introducing (D-3).
- **C-4: `outputSchema` shape.** Spec error contract is
  `{ error: string, code: string }` union; committed code emits
  `{ code, message, retriable }`. Align in Phase 2.4.
- **C-5: phase discipline already broken.** Phase 2 code was committed to
  `main` before Phase 0/1, with no `archive/v6-full` branch and no per-phase
  PR. Ground rule 1 wants branch+PR per phase. **Decision D-1.**
- **C-6: CSR event name.** Spec assumes an `aurix:update` bus; code dispatches
  `aurix:expanded` and has **no dynamic-value patch runtime**. Phase 1's
  "runtime only patches dynamic values and re-registers tools" is greenfield,
  not a modification.
- **C-7: `parser.ts` also uses `randomUUID`.** Spec 2.5 only names USHE, but
  the parser's transient AST ids are nondeterministic too. Harmless today
  (not used for identity/signature) — note, don't over-fix.

---

## 5. Open decisions to report (spec: "Report back to the human")

- **D-1 — Reconcile the already-committed Phase 2 work + phase discipline.**
  Options: (a) **Keep** the committed IR/classification/lint as the Phase 2
  baseline and proceed forward-only, retro-creating `archive/v6-full` from a
  pre-`59c4c37` commit; or (b) **revert** `59c4c37` and redo Phase 1→2 clean
  with branch/PR per phase. Also: is a real GitHub PR flow wanted (needs
  `gh`/push auth), or local branches only? _Recommendation: (a)_ — the work is
  sound and tests are green; wasting it to satisfy ordering is poor value. But
  fix C-1 before calling 2.4 done.
- **D-2 — Monorepo restructure.** Phase 3/4 assume `@aurix/ir`, `@aurix/emit-*`,
  `@aurix/verify`, `@aurix/mcp-server` as separate packages. Convert
  `aurix-v6-core` into a workspace (`packages/*` via npm/pnpm workspaces)? This
  is the single biggest structural change and gates Phase 3. _Recommendation:
  pnpm workspaces, `packages/core` + one package per emitter/verifier._
- **D-3 — Dependencies:** adopt **Zod** (C-3)? upgrade **jose ^4 → ^5**?
  minimize **cheerio** (its htmlparser2/domhandler tree) — keep or replace with
  a lighter parser for build-time compile?
- **D-4 — DoD sample store.** Provide/scaffold a real Next.js store under
  `examples/` (DoD requires it). Design-partner/site name still open.
- **D-5 — KMS/HSM provider** for Phase 2.6 production key path (AWS KMS?
  GCP KMS? Vault?). Dev stays env-var.

---

## 6. Recommended phase order from here (not executed — awaiting go-ahead)

0. ✅ Audit (this file).
1. Docs/scope deletions + create `archive/v6-full`; decide D-1/D-2.
2. Finish core fixes: **fix C-1 first**, then 2.5 (scanner) and 2.6 (signing),
   then vocab.config file + Zod (2.3) if D-3 approves.
3. Emitters (needs D-2 monorepo decision).
4. Trust layer (`@aurix/verify`, `parity`, description linter).
5. Supply-chain hardening + CI gates.
6. Docs rewrite `v6_* → v7_*`.

_Stopping here per "Stop after each phase and report before continuing."_

---

## 7. Batch 2 progress log (living audit trail)

### Step 3.3 — killed-scope grep sweep (code paths only)
Command:
`grep -rniE "aeo|\bavr\b|agent.?interface|portal|laravel|canvas"` over
`aurix-v6-core/src`, `package.json`, `README.md`, `tsconfig.json`,
`jest.config.js` (excluding node_modules/dist/coverage and the v6 docs/spec).
**Result: zero hits.** Confirms the Phase-0 "killed scope is docs-only"
finding — no code paths reference AEO/AVR/Agent-Interface/Portal/Laravel/Canvas.
The Step-4 workspace split proceeds as planned.

### Environment note — auto-committer
The working tree is auto-committed on a timer to the checked-out branch and
pushed to origin. Mitigations landed in Step 3: root `.gitignore` secret rules,
gitleaks CI + pre-push, `docs/git-hygiene.md`. Provenance blur (generic "Another
commit" commits interleaved with intentional ones) is accepted everywhere except
`phase-2/signing`, which is opened fresh and rebased clean before its PR.

### Phase-5-relevant dependency answers
- `jose`: currently `^4.15.9`; **upgrade to `^5` is scheduled in Step 6** (jose
  v5 dependency-tree note to be recorded here after the upgrade).
- `cheerio` tree: to be justified in the Phase-5 pass (not yet done).

### Deviations
- Step 1.2 two-logical-commit split for parked work was moot: the auto-committer
  had already squashed index.ts + values.ts + ir.test.ts into `839f6e3` before
  `phase-2/core-fixes` branched. Work is preserved in-branch, not as two commits.
