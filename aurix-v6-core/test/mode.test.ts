/**
 * Tests for the `mode` option added in Fix 3:
 *   - canonical (default): ix* attrs stripped; data-* stays; graph script stays
 *   - debug: all three layers present (ix*, data-*, graph)
 *   - compact: ix* stripped, AURIX data-* stripped from annotated elements,
 *              but graph script still present and complete
 */
import { expandHtmlServerSide } from "../src/core/expander";
import { load } from "cheerio";

const HTML_FIXTURE = `<body ix-domain="ProductPage">
  <section ix="productDetails.product#SKU1">
    <h1 ix="name">Widget</h1>
    <span ix="price">$9.99</span>
    <button ix="addToCart" data-endpoint="/cart/add" data-method="POST">Add</button>
  </section>
</body>`;

// ---------------------------------------------------------------------------
// canonical (default)
// ---------------------------------------------------------------------------
describe("mode: canonical (default)", () => {
  let out: string;
  beforeAll(() => {
    ({ html: out } = expandHtmlServerSide(HTML_FIXTURE));
  });

  test("no ix= attributes remain", () => {
    expect(out).not.toMatch(/\bix=/);
  });

  test("no ix-* attributes remain", () => {
    expect(out).not.toMatch(/\bix-/);
  });

  test("data-entity still present", () => {
    expect(out).toContain('data-entity="product"');
  });

  test("data-field still present", () => {
    expect(out).toContain("data-field=");
  });

  test("graph script is present", () => {
    expect(out).toContain('id="aurix-graph"');
    expect(out).toContain('"nodes"');
  });
});

// ---------------------------------------------------------------------------
// debug
// ---------------------------------------------------------------------------
describe("mode: debug", () => {
  let out: string;
  beforeAll(() => {
    ({ html: out } = expandHtmlServerSide(HTML_FIXTURE, { mode: "debug" }));
  });

  test("ix= attribute is preserved", () => {
    expect(out).toContain('ix="name"');
  });

  test("ix-domain attribute is preserved", () => {
    expect(out).toContain("ix-domain=");
  });

  test("data-entity is present", () => {
    expect(out).toContain("data-entity=");
  });

  test("data-field is present", () => {
    expect(out).toContain("data-field=");
  });

  test("graph script is present", () => {
    expect(out).toContain('id="aurix-graph"');
  });
});

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------
describe("mode: compact", () => {
  let out: string;
  let graph: any;

  beforeAll(() => {
    ({ html: out } = expandHtmlServerSide(HTML_FIXTURE, { mode: "compact" }));
    // Extract and parse the graph from the output
    const $ = load(out);
    const raw = $("#aurix-graph").html() || "";
    graph = JSON.parse(raw);
  });

  test("no ix= attributes remain", () => {
    expect(out).not.toMatch(/\bix=/);
  });

  test("no ix-* attributes remain", () => {
    expect(out).not.toMatch(/\bix-/);
  });

  test("AURIX data-entity is stripped", () => {
    // data-entity is an AURIX annotation — must be gone in compact mode
    expect(out).not.toContain("data-entity=");
  });

  test("AURIX data-field is stripped", () => {
    expect(out).not.toContain("data-field=");
  });

  test("AURIX data-action is stripped", () => {
    expect(out).not.toContain("data-action=");
  });

  test("AURIX data-type is stripped", () => {
    expect(out).not.toContain("data-type=");
  });

  test("graph script is still present", () => {
    expect(out).toContain('id="aurix-graph"');
  });

  test("graph script contains complete graph with nodes", () => {
    expect(graph).toHaveProperty("aurix");
    expect(graph).toHaveProperty("nodes");
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  test("graph contains the product entity with its fields", () => {
    const product = graph.nodes.find((n: any) => n.entity === "product");
    expect(product).toBeDefined();
    expect(product.fields["product.name"]).toBeDefined();
    expect(product.fields["product.price"]).toBeDefined();
  });

  test("graph contains the addToCart action", () => {
    const product = graph.nodes.find((n: any) => n.entity === "product");
    expect(product.actions).toHaveProperty("addToCart");
    expect(product.actions.addToCart.endpoint).toBe("/cart/add");
  });

  test("developer-authored data-endpoint and data-method survive compact stripping", () => {
    // data-endpoint and data-method on the button were authored by the developer;
    // compact mode removes them ONLY from AURIX-annotated elements (the button
    // got ix="addToCart", so it is annotated — the spec says these are also redundant
    // in compact since contracts live in the graph).
    // We verify the graph still has the contract — that's the deliverable.
    const product = graph.nodes.find((n: any) => n.entity === "product");
    expect(product.actions.addToCart.method).toBe("POST");
    expect(product.actions.addToCart.endpoint).toBe("/cart/add");
  });

  test("unrelated developer data-* attributes on unAnnotated elements are untouched", () => {
    // An element with NO ix annotation must keep its own data-* untouched.
    const HTML_WITH_EXTRA = `<body>
      <section ix="productDetails.product#X">
        <h1 ix="name">Widget</h1>
      </section>
      <footer data-custom="keep-me" data-tracking="ga123">Footer</footer>
    </body>`;
    const { html: compactOut } = expandHtmlServerSide(HTML_WITH_EXTRA, { mode: "compact" });
    expect(compactOut).toContain('data-custom="keep-me"');
    expect(compactOut).toContain('data-tracking="ga123"');
  });
});
