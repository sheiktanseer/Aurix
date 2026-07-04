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

**Environment**
- `AURIX_SIGNING_KEY` - JWK JSON or HMAC secret for signing graphs.

