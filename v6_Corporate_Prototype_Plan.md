# AURIX v6 – Corporate Prototype Deployment Plan

## Purpose
This document defines the corporate‑ready rollout plan for deploying AURIX v6 into production environments. It targets enterprise engineering teams, CTOs, AI system integrators, and solution architects.

---

## 1. Goals
- Deploy AURIX as the AI-interoperable semantic layer  
- Enable seamless AI automation across products  
- Create the foundation for AURIX‑powered AI agents  
- Introduce semantic normalization across apps  
- Ensure long‑term governance and enterprise compliance  

---

## 2. Prototype Phases

### Phase 1 — Internal Sandbox
- Integrate AURIX-Core into a small Next.js app  
- Test SSR expansion  
- Enable CSR expansion  
- Validate canonical graph correctness  
- Run Lighthouse + Puppeteer benchmarks  

### Phase 2 — Department Onboarding
Departments:
- Ecommerce / Product pages  
- Dashboard teams  
- Internal business tools  
- Customer support systems  

Goals:
- Provide templates  
- Train developers  
- Validate flows & action contracts  

### Phase 3 — Cross-Product Integration
Unify:
- Headers  
- Footers  
- Product objects  
- Graph metadata  
- Shared vocabularies via AVR  
> REMOVED in v7 — see SCOPE.md (replaced by local vocab.config.ts)

### Phase 4 — Enterprise Integration
- Sign truth‑critical graphs (product, checkout, pricing)  
- Add security, privacy, compliance metadata  
- Introduce rate-limiting  
- Provide AI policies  

---

## 3. Organizational Model
> REMOVED in v7 — see SCOPE.md (six-role model collapsed to 2 engineers + 1 product)
Roles:
- AURIX Architect  
- AURIX Core Engineer  
- AURIX DevOps  
- AURIX QA/Validator  
- AURIX Agent Developer  
- Corporate AI Product Lead  

---

## 4. Tools Needed
- AURIX-Core  
- AURIX-CSR  
- AURIX-SSR  
- AURIX-AEO  
> REMOVED in v7 — see SCOPE.md
- AURIX-USHE  
- AURIX Validator  
- AURIX Inspector  
- AURIX Graph Dashboard  

---

## 5. Deployment Checklist
- [ ] SSR enabled  
- [ ] Canonical output validated  
- [ ] AEO policies set  <!-- REMOVED in v7 — see SCOPE.md; replaced by: sideEffects gating verified -->
> REMOVED in v7 — see SCOPE.md (replace with "sideEffects gating verified")
- [ ] Graph signing integrated  
- [ ] AI policy declared (allow/deny/limited)  
- [ ] Performance baseline established  
- [ ] CI validation active  

---

## 6. Enterprise KPIs
- % pages with AURIX  
- Graph correctness score  
- Agent success rate  
- Checkout action reliability  
- Time to integrate new flows  
