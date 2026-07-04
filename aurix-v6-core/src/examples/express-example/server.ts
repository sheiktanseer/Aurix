import express from "express";
import fs from "fs";
import path from "path";
import { expandHtmlServerSide } from "../../core/expander";
import { signGraphJws } from "../../server/signature";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/product/:sku", async (_req, res) => {
  const template = fs.readFileSync(path.join(__dirname, "templates/product.html"), "utf-8");
  const { html: expanded, graphScript } = expandHtmlServerSide(template, { version: "6.0" });
  const graphJson = JSON.parse(graphScript.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
  const jws = await signGraphJws(graphJson);
  const signed = expanded.replace("</body>", `<script id="aurix-sig" type="application/aurix+signature">${JSON.stringify({ jws })}</script></body>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(signed);
});

app.listen(4000, () => console.log("Aurix example server listening on 4000"));
