# AURIX v6 Core Runtime

This repository contains a production-ready AURIX v6 core runtime: SSR expander, CSR expand loader,
canonical JSON graph generator, JWS signing helpers, validator CLI, and examples for Next.js and Express.

## Quick start (example)

1. Install dependencies
```bash
npm install
```

2. Build
```bash
npm run build
```

3. Run Express example
```bash
npm run start:example:express
```

4. Validate an expanded HTML
```bash
npm run validate ./dist/examples/express-example/templates/product.html
```

---

## Expansion modes (`mode` option)

`expandHtmlServerSide(html, { mode })` accepts three modes controlling how much annotation survives into the shipped HTML:

| Mode | ix* attrs | AURIX data-* | Graph `<script>` |
|---|---|---|---|
| `canonical` **(default)** | ❌ stripped | ✅ kept | ✅ kept |
| `debug` | ✅ kept | ✅ kept | ✅ kept |
| `compact` | ❌ stripped | ❌ stripped (annotated elements only) | ✅ kept |

- **canonical**: Removes all `ix`, `ix-field`, `ix-auto`, `ix-group`, `ix-value`, `ix-mode`, `ix-domain`, `ix-version` attributes after expansion. `data-*` annotations stay (needed for CSR updates and test selectors).
- **debug**: Keeps all three layers — authoring attributes, data-* annotations, and the graph script. Equivalent to pre-6.0.1 behaviour.
- **compact**: Strips ix* authoring attributes AND all AURIX data-* annotations (`data-type`, `data-entity`, `data-id`, `data-field`, `data-action`, `data-auto`, `data-group`, `data-value`, `data-mode`, `data-domain`, `data-aurix`) from every element that received AURIX annotations during expansion. Developer-authored `data-*` on unrelated elements are never touched. Ships clean HTML + graph script only.

> **Note:** The graph `<script id="aurix-graph">` is always present in all modes. The `compact` graph is generated *before* stripping, so its contents are complete.

```ts
const { html } = expandHtmlServerSide(template, { mode: "canonical" }); // default
const { html } = expandHtmlServerSide(template, { mode: "compact" });   // minimal HTML
const { html } = expandHtmlServerSide(template, { mode: "debug" });     // inspect all layers
```

---

## Key configuration (`AURIX_SIGNING_KEY`)

Set the `AURIX_SIGNING_KEY` environment variable to configure signing. Two formats are supported — the system **fails loudly** on misconfiguration; there is no silent downgrade.

### Option A — JWK JSON (recommended)

```bash
AURIX_SIGNING_KEY='{"kty":"oct","k":"<base64url-encoded-secret>"}'
AURIX_SIGNING_KEY='{"kty":"OKP","crv":"Ed25519","d":"<private>","x":"<public>"}' # EdDSA
AURIX_SIGNING_KEY='{"kty":"RSA",...}'  # RS256
```

The algorithm is auto-detected from `kty` and `crv`:
- `kty: "oct"` → HS256
- `kty` with `crv` → EdDSA
- other → RS256

**Errors thrown immediately (no silent fallback):**
- Invalid JSON → `"AURIX_SIGNING_KEY looks like a JWK but is not valid JSON: ..."`
- Missing `kty` → `"AURIX_SIGNING_KEY JWK missing required field 'kty'"`

### Option B — Plain HMAC secret (≥32 characters)

```bash
AURIX_SIGNING_KEY="my-secret-that-is-at-least-32-chars-long"
```

- Shorter than 32 characters → `"AURIX_SIGNING_KEY HMAC secret must be at least 32 characters (got N)"`
- Encoded as **base64url** (not base64) per RFC 7515 §6.4.

---

## Detached graph signing

Full-payload signing (`signGraphJws`) embeds a second copy of the graph in the JWS token. Detached signing embeds only the SHA-256 digest of the canonical graph JSON:

```ts
import { signGraphDetached, verifyGraphDetached } from "aurix-v6-core";

// Sign — payload: { g: "<sha256hex>", v: "6.0", iat: <unix> }
const jws = await signGraphDetached(graph);

// Verify — recomputes digest and compares; throws on mismatch or bad sig
await verifyGraphDetached(jws, graph);
```

`signGraphJws` and `verifyGraphJws` are kept for backward-compatibility but are **deprecated**.

---

## Canonical graph

`generateGraphFromDom` now returns a **canonical** graph:

- **Stable node IDs**: `data-id` present → `entity#id`; absent → `entity@<first 12 hex chars of SHA-256(entity:type:structuralPath)>`. Inserting a sibling *after* a node does not change that node's derived ID. Inserting *before* does shift later IDs — use explicit `data-id` to avoid this.
- **Sorted nodes**: The `nodes` array is sorted ascending by `id`.
- **Sorted keys**: All object keys are sorted lexicographically (recursive).
- **`canonicalJson(obj)`**: Key-sorted `JSON.stringify` for digest computation (RFC 8785-inspired; sufficient for AURIX graph values which are strings and plain numbers).

---

## 6.0.1-alpha — Behavioral changes

### Fix 1 — Shared expansion logic (`src/core/ix-rules.ts`)
The ix-classification rules (`parseEntityIx`, `classifyShortIx`, `fullFieldName`) are extracted into a single, DOM-free module imported by both the server-side (cheerio) and client-side (DOM) expanders. SSR/CSR output is now provably identical for the same markup.

**Known flaw (documented, not fixed):** `ix="address"` is classified as an action because it starts with `"add"`. Future fix: add an explicit `ix-action` attribute so authors declare intent.

### Fix 2 — No fake field from action buttons
Action elements receive `data-action` only. The old `data-field = parentEntity` branch that injected e.g. `fields["product"] = { value: "Add to cart" }` into the graph is removed. A defense-in-depth guard in `generateGraphFromDom` also skips any `[data-field]` element carrying `data-action`.

### Fix 3 — `mode` option (canonical / debug / compact)
`expandHtmlServerSide` now accepts `mode?: "canonical" | "debug" | "compact"`. Default changes from keeping all attributes to **canonical** (strips ix* attrs). Add `mode: "debug"` to restore the old behavior.

### Fix 4 — Fail-loud signing key handling
`resolveKeyConfig` replaces the old try/catch-with-silent-fallback logic. Every failure path throws with an actionable message. Plain HMAC secrets now use `base64url` encoding (not `base64`) per RFC 7515 §6.4.

### Fix 5 — Canonical, deterministic graph + detached signing
- Node IDs are now content-addressed (structural-path SHA-256) instead of index-based.
- Graph output is canonical (sorted nodes + sorted keys).
- `signGraphDetached` / `verifyGraphDetached` sign only the SHA-256 digest of the canonical graph — the full graph is never embedded in the token.
- Old `signGraphJws` / `verifyGraphJws` are marked `@deprecated`.
