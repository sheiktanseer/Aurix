import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { load } from "cheerio";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schema = {
  type: "object",
  properties: {
    aurix: { type: "object", properties: { version: { type: "string" }, domain: { type: "string" } }, required: ["version"] },
    nodes: { type: "array" }
  },
  required: ["aurix"]
};

const validate = ajv.compile(schema);

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: validate <file.html>");
    process.exit(2);
  }
  const html = fs.readFileSync(path.resolve(file), "utf-8");
  const $ = load(html);
  const graphScript = $("#aurix-graph").html();
  if (!graphScript) {
    console.error("No aurix graph found. Run SSR expansion first.");
    process.exit(3);
  }
  const graph: any = JSON.parse(graphScript);
  const ok = validate(graph);
  if (!ok) {
    console.error("Validation errors:", validate.errors);
    process.exit(4);
  }
  const domain = $("body").attr("data-domain") || $("body").attr("ix-domain");
  if (domain === "ProductPage") {
    const nodes = (graph as any).nodes;
    const hasProduct = Array.isArray(nodes) && nodes.some((n: any) => n.entity === "product");
    if (!hasProduct) {
      console.warn("Warning: ProductPage but no product nodes.");
    }
  }
  console.log("AURIX graph validated OK.");
}
if (require.main === module) main();
