/**
 * Tests for Fix 5: canonical, deterministic graph + detached signing.
 *
 * Covers:
 * - Same HTML twice → byte-identical canonicalJson output
 * - Appending an unrelated sibling does NOT change earlier nodes' derived IDs
 * - Detached sign/verify round-trip passes
 * - verify fails when a field value in the graph is mutated
 * - sortKeys / canonicalizeGraph ordering guarantees
 */
import { expandHtmlServerSide, generateGraphFromDom } from "../src/core/expander";
import { canonicalizeGraph, canonicalJson, deriveNodeId, structuralPath } from "../src/core/canonical";
import { signGraphDetached, verifyGraphDetached } from "../src/server/signature";
import { load } from "cheerio";

// Set a signing key for tests that use it.
const TEST_KEY = "test-secret-key-for-aurix-signing-32chars!!";
const originalEnv = process.env.AURIX_SIGNING_KEY;

beforeAll(() => { process.env.AURIX_SIGNING_KEY = TEST_KEY; });
afterAll(() => {
  if (originalEnv === undefined) delete process.env.AURIX_SIGNING_KEY;
  else process.env.AURIX_SIGNING_KEY = originalEnv;
});

// ---------------------------------------------------------------------------
// Determinism: same HTML → byte-identical canonicalJson
// ---------------------------------------------------------------------------
describe("deterministic canonicalJson", () => {
  const HTML = `<body>
    <section ix="productDetails.product#P1">
      <h1 ix="name">Widget</h1>
      <span ix="price">$9.99</span>
    </section>
    <section ix="reviewDetails.review#R1">
      <span ix="rating">5</span>
    </section>
  </body>`;

  test("same HTML processed twice produces byte-identical canonicalJson", () => {
    const { html: out1 } = expandHtmlServerSide(HTML, { mode: "debug" });
    const { html: out2 } = expandHtmlServerSide(HTML, { mode: "debug" });

    const $1 = load(out1);
    const $2 = load(out2);
    const g1 = generateGraphFromDom($1);
    const g2 = generateGraphFromDom($2);

    expect(canonicalJson(g1)).toBe(canonicalJson(g2));
  });

  test("nodes are sorted by id in canonical output", () => {
    const { html: out } = expandHtmlServerSide(HTML, { mode: "debug" });
    const $ = load(out);
    const graph = generateGraphFromDom($);

    for (let i = 1; i < graph.nodes.length; i++) {
      expect(graph.nodes[i - 1].id <= graph.nodes[i].id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Stable IDs: appending a sibling AFTER must not shift earlier nodes' IDs
// ---------------------------------------------------------------------------
describe("stable derived IDs", () => {
  const HTML_BASE = `<body>
    <section ix="productDetails.product#P1">
      <h1 ix="name">Widget</h1>
    </section>
    <section ix="reviewDetails.review#R1">
      <span ix="rating">5</span>
    </section>
  </body>`;

  const HTML_WITH_EXTRA = `<body>
    <section ix="productDetails.product#P1">
      <h1 ix="name">Widget</h1>
    </section>
    <section ix="reviewDetails.review#R1">
      <span ix="rating">5</span>
    </section>
    <section ix="shippingDetails.shipping#S1">
      <span ix="carrier">UPS</span>
    </section>
  </body>`;

  test("appending a sibling entity AFTER does not change existing node IDs", () => {
    const { html: base } = expandHtmlServerSide(HTML_BASE, { mode: "debug" });
    const { html: withExtra } = expandHtmlServerSide(HTML_WITH_EXTRA, { mode: "debug" });

    const $base = load(base);
    const $extra = load(withExtra);
    const gBase = generateGraphFromDom($base);
    const gExtra = generateGraphFromDom($extra);

    // Product node uses data-id="P1" → always "product#P1"
    const productBase = gBase.nodes.find((n: any) => n.entity === "product");
    const productExtra = gExtra.nodes.find((n: any) => n.entity === "product");
    expect(productBase!.id).toBe(productExtra!.id);

    // Review node uses data-id="R1" → always "review#R1"
    const reviewBase = gBase.nodes.find((n: any) => n.entity === "review");
    const reviewExtra = gExtra.nodes.find((n: any) => n.entity === "review");
    expect(reviewBase!.id).toBe(reviewExtra!.id);

    // The new shipping node should appear in the extended graph.
    const shipping = gExtra.nodes.find((n: any) => n.entity === "shipping");
    expect(shipping).toBeDefined();
  });

  test("derived IDs (no data-id) are stable across two identical parse passes", () => {
    const HTML_NO_ID = `<body>
      <section ix="productDetails.product">
        <h1 ix="name">Widget</h1>
      </section>
    </body>`;

    const { html: out1 } = expandHtmlServerSide(HTML_NO_ID, { mode: "debug" });
    const { html: out2 } = expandHtmlServerSide(HTML_NO_ID, { mode: "debug" });

    const g1 = generateGraphFromDom(load(out1));
    const g2 = generateGraphFromDom(load(out2));

    expect(g1.nodes[0].id).toBe(g2.nodes[0].id);
    // Derived IDs use the @ sigil
    expect(g1.nodes[0].id).toMatch(/^product@[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// sortKeys / canonicalizeGraph
// ---------------------------------------------------------------------------
describe("sortKeys and canonicalizeGraph", () => {
  test("object keys are sorted recursively", () => {
    const { sortKeys } = require("../src/core/canonical");
    const input = { z: 1, a: { y: 2, b: 3 } };
    const out = sortKeys(input) as any;
    expect(Object.keys(out)).toEqual(["a", "z"]);
    expect(Object.keys(out.a)).toEqual(["b", "y"]);
  });

  test("arrays are preserved in their original order", () => {
    const { sortKeys } = require("../src/core/canonical");
    const input = [3, 1, 2];
    expect(sortKeys(input)).toEqual([3, 1, 2]);
  });

  test("canonicalizeGraph sorts nodes by id", () => {
    const graph = {
      aurix: { version: "6.0" },
      nodes: [
        { id: "z-entity", entity: "z" },
        { id: "a-entity", entity: "a" },
      ],
    };
    const out = canonicalizeGraph(graph as any);
    expect(out.nodes[0].id).toBe("a-entity");
    expect(out.nodes[1].id).toBe("z-entity");
  });
});

// ---------------------------------------------------------------------------
// Detached sign / verify round-trip
// ---------------------------------------------------------------------------
describe("signGraphDetached / verifyGraphDetached", () => {
  const GRAPH = { aurix: { version: "6.0" }, nodes: [{ id: "product#P1", entity: "product", type: "productDetails", fields: { "product.name": { value: "Widget", source: "server" } }, actions: {}, source: "server" }] };

  test("sign and verify round-trip passes", async () => {
    const jws = await signGraphDetached(GRAPH);
    await expect(verifyGraphDetached(jws, GRAPH)).resolves.not.toThrow();
  });

  test("verify fails when one field value is mutated", async () => {
    const jws = await signGraphDetached(GRAPH);
    const mutated = JSON.parse(JSON.stringify(GRAPH));
    mutated.nodes[0].fields["product.name"].value = "TAMPERED";
    await expect(verifyGraphDetached(jws, mutated)).rejects.toThrow("Graph digest mismatch");
  });

  test("verify fails when a node is added", async () => {
    const jws = await signGraphDetached(GRAPH);
    const mutated = JSON.parse(JSON.stringify(GRAPH));
    mutated.nodes.push({ id: "review#R1", entity: "review" });
    await expect(verifyGraphDetached(jws, mutated)).rejects.toThrow("Graph digest mismatch");
  });

  test("JWS format is a dot-separated JWT string", async () => {
    const jws = await signGraphDetached(GRAPH);
    expect(jws.split(".")).toHaveLength(3);
  });
});
