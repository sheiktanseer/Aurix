# AURIX v6 – Core Development Guide

## Purpose
This document provides a deep technical explanation of how to extend, maintain, and evolve the AURIX v6 core architecture. It is intended for AI agents, human developers, DevOps teams, and engineering leads working on long‑term evolution of the protocol and implementation.

---

## 1. AURIX Core Philosophy
AURIX v6 transforms HTML into a machine‑interpretable layer for AI systems.  
The core implementation must:

- Maintain deterministic expansion rules  
- Produce canonical JSON graph representations  
- Survive React/Next.js hydration  
- Enable safe execution of actions  
- Support dynamic updates  
- Integrate with SPA, SSR, CSR, and Canvas UIs  
> REMOVED in v7 — see SCOPE.md (Canvas dropped)
- Maintain cross‑version schema compatibility  

AURIX-Core is the foundational engine behind all of this.

---

## 2. Core System Architecture

### 2.1 Major Subsystems
- **Parser** (ix → AST)  
- **Expander** (AST → Canonical HTML)  
- **Graph Engine** (Canonical HTML → JSON Graph)  
- **Signature Engine** (JWS/HMAC signing)  
- **Auto-Inference Engine** (controlled auto rules)  
- **Dynamic Update Layer** (`aurix:update` events)  
- **Schema + Vocab Loader** (AVR integration)
> REMOVED in v7 — see SCOPE.md (AVR replaced by local vocab.config.ts)

---

## 3. Parsing Logic
Input:
```html
<section ix="productDetails.product#SKU123">
```

Parser extracts:
- Section type  
- Entity  
- Entity ID  
- Field or action tokens  

AST fields:
```json
{
  "node": "section",
  "ix": "productDetails.product#SKU123",
  "meta": { ... }
}
```

---

## 4. Canonical Expansion Rules
AURIX must ALWAYS generate deterministic output:

```html
<section data-type="productDetails" data-entity="product" data-id="SKU123">
```

Rules include:
- Token normalization  
- Attribute inheritance  
- Pattern detection  
- Field typing  
- Conversion of actions into action contracts  

---

## 5. Graph Building
Graph must be:
- Stable  
- Sorted  
- ID deterministic  
- Version‑tagged  
- Fully typed  

AI uses this graph for semantic reasoning.

---

## 6. Signature Strategy
Graph signing ensures trust.

Support:
- HMAC (baseline)
- JWS (recommended)
- Ed25519 (enterprise)

Graph example:
```json
{
  "aurix": { "version": "6.0" },
  "signature": "<hash>"
}
```

---

## 7. Dynamic Updates
JS dispatch example:
```js
dispatchEvent(new CustomEvent("aurix:update", {
  detail: { field: "product.price", value: 899 }
}));
```

Graph patches accordingly.

---

## 8. Error Handling
Core must provide:
- Strict mode  
- Loose mode  
- Recoverable parsing  
- Partial graph fallback  
- Logging hooks  

---

## 9. Core Testing
Tests include:
- Parser tests  
- Hydration tests  
- SSR vs CSR equivalence tests  
- Graph comparison tests  
- Security tests  

---

## 10. Extension Strategy
AURIX-Core must support plugins:
- Vocab extension  
- Action DSL extension  
- Auto inference extension  
- UI mode extension  
- Domain-specific modules  
