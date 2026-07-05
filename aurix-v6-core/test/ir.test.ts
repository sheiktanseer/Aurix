/**
 * @jest-environment node
 *
 * Tests for the typed IR: typed values (money/date/url/enum), the agent-safety
 * trio on actions, vocab resolution, and the lint layer (mandatory ids).
 */
import { expandHtmlServerSide, generateGraphFromDom } from "../src/core/expander";
import { load } from "cheerio";
import { coerceValue, parseMoney, parseUrl, parseDate } from "../src/ir/values";
import { resolveFieldType, loadVocab } from "../src/ir/vocab";
import { deriveSideEffects, derivePreconditions } from "../src/ir/safety";
import { lintIr } from "../src/ir/lint";
import type { IrGraph } from "../src/ir/types";

// ---------------------------------------------------------------------------
// Typed value parsing
// ---------------------------------------------------------------------------
describe("typed values", () => {
  test("money: $1,299 -> { value: 1299, currency: USD }", () => {
    expect(parseMoney("$1,299")).toEqual({ value: 1299, currency: "USD" });
  });
  test("money: European format 1.234,56 € -> EUR 1234.56", () => {
    expect(parseMoney("1.234,56 €")).toEqual({ value: 1234.56, currency: "EUR" });
  });
  test("money: ISO code 1299 GBP", () => {
    expect(parseMoney("1299 GBP")).toEqual({ value: 1299, currency: "GBP" });
  });
  test("coerceValue money keeps display but numeric value", () => {
    const v = coerceValue("money", "$1,299");
    expect(v).toEqual({ type: "money", value: 1299, currency: "USD", display: "$1,299" });
  });
  test("url rejects javascript: scheme (falls back to text)", () => {
    expect(parseUrl("javascript:alert(1)")).toBeNull();
    expect(coerceValue("url", "javascript:alert(1)").type).toBe("text");
  });
  test("url accepts relative path and https", () => {
    expect(parseUrl("/p/widget")).toBe("/p/widget");
    expect(parseUrl("https://x.test/a")).toBe("https://x.test/a");
  });
  test("date -> ISO", () => {
    expect(parseDate("2026-07-05")).toBe("2026-07-05T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Vocab resolution
// ---------------------------------------------------------------------------
describe("vocab", () => {
  const vocab = loadVocab();
  test("price -> money + schema.org", () => {
    expect(resolveFieldType("product.price", vocab)).toMatchObject({ type: "money", schema: "https://schema.org/price" });
  });
  test("ix-type override wins", () => {
    expect(resolveFieldType("product.foo", vocab, { type: "url" }).type).toBe("url");
  });
  test("unknown field -> text", () => {
    expect(resolveFieldType("product.whatever", vocab).type).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// Typed fields flow through the IR
// ---------------------------------------------------------------------------
describe("IR typed fields", () => {
  const HTML = `<body>
    <section ix="productDetails.product#SKU1">
      <h1 ix="name">Widget</h1>
      <span ix="price">$1,299</span>
    </section>
  </body>`;

  test("price field is a structured money value, not scraped text", () => {
    const { html: out } = expandHtmlServerSide(HTML);
    const graph = generateGraphFromDom(load(out));
    const product = graph.nodes.find((n) => n.entity === "product")!;
    const price = product.fields["product.price"];
    expect(price.type).toBe("money");
    expect(price.value).toBe(1299);
    expect(price.currency).toBe("USD");
    expect(price.display).toBe("$1,299");
    expect(price.schema).toBe("https://schema.org/price");
  });
});

// ---------------------------------------------------------------------------
// Agent-safety trio
// ---------------------------------------------------------------------------
describe("agent-safety trio", () => {
  test("deriveSideEffects: DELETE -> destructive", () => {
    expect(deriveSideEffects({ kind: "http", method: "DELETE", endpoint: "/x" }, {})).toBe("destructive");
  });
  test("deriveSideEffects: checkout endpoint -> payment", () => {
    expect(deriveSideEffects({ kind: "http", method: "POST", endpoint: "/checkout" }, {})).toBe("payment");
  });
  test("deriveSideEffects: POST -> write", () => {
    expect(deriveSideEffects({ kind: "http", method: "POST", endpoint: "/cart/add" }, {})).toBe("write");
  });
  test("deriveSideEffects: GET -> none", () => {
    expect(deriveSideEffects({ kind: "http", method: "GET", endpoint: "/search" }, {})).toBe("none");
  });
  test("derivePreconditions: write defaults to auth required", () => {
    expect(derivePreconditions("write", {}).auth).toBe("required");
  });
  test("derivePreconditions: none defaults to auth optional", () => {
    expect(derivePreconditions("none", {}).auth).toBe("optional");
  });

  test("action in IR carries sideEffects, preconditions, outputSchema", () => {
    const HTML = `<body>
      <section ix="productDetails.product#P1">
        <button ix="addToCart" ix-endpoint="/cart/add" ix-method="POST" ix-requires="in-stock">Add</button>
      </section>
    </body>`;
    const { html: out } = expandHtmlServerSide(HTML);
    const graph = generateGraphFromDom(load(out));
    const product = graph.nodes.find((n) => n.entity === "product")!;
    const act = product.actions.addToCart;
    expect(act.sideEffects).toBe("write");
    expect(act.preconditions.auth).toBe("required");
    expect(act.preconditions.requires).toContain("in-stock");
    expect(act.outputSchema.error.required).toContain("code");
    expect(act.outputSchema.error.properties.retriable.type).toBe("boolean");
  });

  test("explicit ix-side-effect=payment overrides derivation", () => {
    const HTML = `<body>
      <section ix="orderDetails.order#O1">
        <button ix="confirm" ix-endpoint="/confirm" ix-method="POST" ix-side-effect="payment">Confirm</button>
      </section>
    </body>`;
    const { html: out } = expandHtmlServerSide(HTML);
    const graph = generateGraphFromDom(load(out));
    const order = graph.nodes.find((n) => n.entity === "order")!;
    expect(order.actions.confirm.sideEffects).toBe("payment");
  });
});

// ---------------------------------------------------------------------------
// Lint: mandatory author-assigned ids
// ---------------------------------------------------------------------------
describe("lint", () => {
  test("entity without author id -> E_MISSING_ID error", () => {
    const HTML = `<body><section ix="productDetails.product"><h1 ix="name">W</h1></section></body>`;
    const graph = generateGraphFromDom(load(expandHtmlServerSide(HTML).html));
    const result = lintIr(graph);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "E_MISSING_ID")).toBe(true);
  });

  test("entity with author id -> no E_MISSING_ID", () => {
    const HTML = `<body><section ix="productDetails.product#SKU1"><h1 ix="name">W</h1></section></body>`;
    const graph = generateGraphFromDom(load(expandHtmlServerSide(HTML).html));
    const result = lintIr(graph);
    expect(result.errors.some((e) => e.code === "E_MISSING_ID")).toBe(false);
  });

  test("authoredId flag reflects presence of #id", () => {
    const withId: IrGraph = generateGraphFromDom(load(expandHtmlServerSide(
      `<body><section ix="a.product#P1"></section></body>`).html));
    const noId: IrGraph = generateGraphFromDom(load(expandHtmlServerSide(
      `<body><section ix="a.product"></section></body>`).html));
    expect(withId.nodes[0].authoredId).toBe(true);
    expect(noId.nodes[0].authoredId).toBe(false);
  });
});
