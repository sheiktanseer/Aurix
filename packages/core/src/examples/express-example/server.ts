import express from "express";
import fs from "fs";
import path from "path";
import { expandHtmlServerSide, generateGraphFromDom } from "../../core/expander";
import { signGraphDetached } from "../../server/signature";
import { load } from "cheerio";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// v7 (Phase 1 / SCOPE.md): per-request SSR expansion is NO LONGER the default.
// Static structure is compiled at build time; the runtime serves the compiled
// artifact. On-request transform survives only as a dev fallback, gated behind
// AURIX_DEV_TRANSFORM=1.
const DEV_TRANSFORM = process.env.AURIX_DEV_TRANSFORM === "1";

app.get("/product/:sku", async (_req, res) => {
  const compiledPath = path.join(__dirname, "templates/product.compiled.html");

  if (!DEV_TRANSFORM) {
    // Default path: serve the build-time compiled artifact.
    if (fs.existsSync(compiledPath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(fs.readFileSync(compiledPath, "utf-8"));
      return;
    }
    res
      .status(501)
      .send(
        "No build-time compiled artifact found. Run the AURIX build-time compiler, " +
          "or set AURIX_DEV_TRANSFORM=1 to enable the dev-only on-request transform."
      );
    return;
  }

  // --- Dev-only on-request transform (AURIX_DEV_TRANSFORM=1) ---
  const template = fs.readFileSync(path.join(__dirname, "templates/product.html"), "utf-8");
  // Use canonical mode (default) — strips ix* authoring attrs from shipped HTML.
  const { html: expanded } = expandHtmlServerSide(template, { version: "6.0" });
  const $ = load(expanded);
  const graph = generateGraphFromDom($);
  // Detached signing: the JWS payload contains only the SHA-256 digest of the
  // canonical graph — the full graph is NOT embedded in the token.
  const jws = await signGraphDetached(graph);
  const signed = expanded.replace(
    "</body>",
    `<script id="aurix-sig" type="application/aurix+signature">${JSON.stringify({ jws })}</script></body>`
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(signed);
});

app.listen(4000, () => console.log("Aurix example server listening on 4000"));
