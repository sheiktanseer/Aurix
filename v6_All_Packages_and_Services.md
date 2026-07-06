# AURIX v6 – All Packages and Services Overview

## Packages (Monorepo)

### 1. @aurix/core
- Parser  
- Canonical expander  
- Graph engine  
- Signer  
- Auto inference  
- Dynamic update hooks  

### 2. @aurix/ssr-next
- Next.js SSR integration  
- HTML transform  
- Document-level injection  

### 3. @aurix/csr
- Client runtime  
- ix → data-* fallback  
- aurix:update event bus  

### 4. @aurix/aeo
> REMOVED in v7 — see SCOPE.md
- Action executor  
- API caller  
- Safety validator  
- Retry system  

### 5. @aurix/ushe
- Fallback heuristic engine  
- DOM scanning  
- Probability scoring  

### 6. aurix-cli
- Validator  
- HTML transformer  
- Semantic debugger  

---

## Services

### 1. AURIX AVR (Vocabulary Registry Service)
> REMOVED in v7 — see SCOPE.md (replaced by local vocab.config.ts)
- Hosts canonical vocabularies  
- Provides schema  
- Handles versioning  
- Provides extensions  

### 2. AURIX Signing Service
- Key management  
- Graph signing  
- JWS issuing  
- Validation endpoints  

### 3. AURIX Agent Interface Service
> REMOVED in v7 — see SCOPE.md (replaced by signed graph endpoint + JWKS)
- Serves graph  
- Handles updates  
- Normalizes domain contexts  

### 4. AURIX Observatory
- Logs AURIX errors  
- Semantic drift detection  
- Performance dashboards  

### 5. AURIX Portal UI
> REMOVED in v7 — see SCOPE.md
- Devtools interface  
- Graph visualizer  
- Permission manager  
