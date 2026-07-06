# AURIX v7 — Scope & Non-Goals (binding)

These non-goals are binding for all v7 work. They are reproduced verbatim from
the migration spec (`CLAUDE_CODE_TASK_aurix-v7-migration.md`, "Non-goals") and
extended with the Phase-1 kill list. Anything here is out of scope; do not
reintroduce it without amending the spec.

## Non-goals (verbatim)

- No public vocabulary registry, no agent-side executor, no Portal UI,
  no Laravel/Canvas integrations.
- No API, flag, badge, or doc language implying signed = safe/trusted.
- No new protocol features not listed in the migration spec.

## Killed subsystems (Phase 1)

| Killed | Replaced by |
|---|---|
| `@aurix/aeo` (agent-side action executor) | Agents execute via WebMCP/browser mediation; AURIX ships no executor. |
| AURIX AVR (Vocabulary Registry Service) | Local, serializable `vocab.config.ts` (Phase 2.3). |
| AURIX Agent Interface Service | One signed graph endpoint + JWKS at `/.well-known` (Phase 2.6 / 3.3). |
| AURIX Portal UI | (dropped) |
| PHP/Laravel semantic injector | (dropped) |
| Canvas protocol mapper | (dropped) |
| Per-request SSR expansion **as default** | Build-time compilation; runtime patches values + re-registers tools only. A dev-mode on-request transform stays behind `AURIX_DEV_TRANSFORM=1`. |
| Six-role org model | Collapsed to 2 engineers + 1 product (Phase 6 go-to-market). |

## Trust-language rule

The signature proves **origin for a domain** — `authenticFor: "<origin>"`. It
never asserts "safe" or "trusted". No API boolean named `trusted`/`safe`, no
"signed = safe" badge, no doc language implying it. See the verifier contract
(Phase 4).

## Safety-metadata rule (post-C-1)

`sideEffects` and `preconditions` are author-declared at build time and
**immutable post-attestation**. The `aurix:update` runtime may patch values
only, never safety fields; any runtime safety-field delta is a parity alarm,
not an update.
