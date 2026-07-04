import express from "express";
import fs from "fs";
import path from "path";
import { expandHtmlServerSide, generateGraphFromDom } from "../../core/expander";
import { signGraphDetached } from "../../server/signature";
import { load } from "cheerio";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/product/:sku", async (_req, res) => {
  const template = fs.readFileSync(path.join(__dirname, "templates/product.html"), "utf-8");
  // Use canonical mode (default) — strips ix* authoring attrs from shipped HTML.
  const { html: expanded } = expandHtmlServerSide(template, { version: "6.0" });
  // Re-parse to obtain the canonical graph for detached signing.
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
