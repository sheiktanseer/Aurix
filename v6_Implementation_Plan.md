# AURIX v6 – Implementation Plan (Full Technical)

## 1. Overview
This plan defines the engineering tasks required to fully implement and maintain AURIX v6 in production.  

---

## 2. Milestones

### Milestone A — Core
- Implement parser  
- Implement canonical expander  
- Implement graph builder  
- Implement signer (HMAC + JWS)  
- Add auto inference engine  

### Milestone B — Runtime
- Implement CSR library  
- Implement dynamic update system  
- Implement AEO execution engine  
> REMOVED in v7 — see SCOPE.md (no agent-side executor)
- Implement fallback USHE engine  

### Milestone C — Integrations
- Next.js SSR transformer  
- Express SSR middleware  
- PHP/Laravel semantic injector  
> REMOVED in v7 — see SCOPE.md
- Canvas protocol mapper  
> REMOVED in v7 — see SCOPE.md

### Milestone D — Tooling
- AURIX CLI  
- VSCode extension  
- Chrome Inspector  
- Graph visualizer  
- Benchmark runner  

### Milestone E — Governance
- AVR registry  
> REMOVED in v7 — see SCOPE.md (replaced by local vocab.config.ts)
- Vocab schema  
- Conformance test suite  
- Versioning policy  

---

## 3. Development Workflow
- Monorepo managed by pnpm  
- Unit tests via Jest  
- Integration tests via Playwright  
- Benchmarks via Puppeteer  
- Linting + type checking  

---

## 4. Release Strategy
- Tags: v6.x.x  
- Semantic versioning  
- LTS branches  
- Internal validation before public push  

---

## 5. Security
- Graph signing  
- Action contract validation  
- Trust flags  
- PII protection  
- AI-policy enforcement  

---

## 6. Performance Targets
- SSR expansion < 20ms  
- CSR expansion < 25ms on mobile  
- Graph generation < 12ms  
- Dynamic update handling < 5ms  

