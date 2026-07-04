/**
 * @jest-environment node
 *
 * Unit tests for src/core/ix-rules.ts — the shared, DOM-free classification
 * layer that guarantees SSR/CSR parity.
 */
import { parseEntityIx, classifyShortIx, fullFieldName } from "../src/core/ix-rules";
import { expandHtmlServerSide } from "../src/core/expander";
import { load } from "cheerio";

// ---------------------------------------------------------------------------
// parseEntityIx
// ---------------------------------------------------------------------------
describe("parseEntityIx", () => {
  test("simple entity with id", () => {
    expect(parseEntityIx("productDetails.product#SKU123")).toEqual({
      type: "productDetails",
      entity: "product",
      id: "SKU123",
    });
  });

  test("simple entity without id", () => {
    expect(parseEntityIx("orderDetails.order")).toEqual({
      type: "orderDetails",
      entity: "order",
      id: undefined,
    });
  });

  test("multi-dot: everything after first dot is entity[#id]", () => {
    // "a.b.c#X" -> type="a", entity="b.c", id="X"
    expect(parseEntityIx("a.b.c#X")).toEqual({
      type: "a",
      entity: "b.c",
      id: "X",
    });
  });

  test("multi-dot without id", () => {
    expect(parseEntityIx("a.b.c")).toEqual({
      type: "a",
      entity: "b.c",
      id: undefined,
    });
  });

  test("no dot returns null (not an entity token)", () => {
    expect(parseEntityIx("name")).toBeNull();
    expect(parseEntityIx("addToCart")).toBeNull();
    expect(parseEntityIx("price")).toBeNull();
  });

  test("empty string returns null", () => {
    expect(parseEntityIx("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyShortIx
// ---------------------------------------------------------------------------
describe("classifyShortIx", () => {
  test("button tagName -> action", () => {
    const result = classifyShortIx("addToCart", {
      tagName: "button",
      role: null,
      parentEntity: "product",
    });
    expect(result).toEqual({ kind: "action", action: "addToCart" });
  });

  test("role=button -> action", () => {
    const result = classifyShortIx("buyNow", {
      tagName: "div",
      role: "button",
      parentEntity: "product",
    });
    expect(result).toEqual({ kind: "action", action: "buyNow" });
  });

  test("'add' prefix -> action", () => {
    const result = classifyShortIx("addItem", {
      tagName: "span",
      role: null,
      parentEntity: null,
    });
    expect(result).toEqual({ kind: "action", action: "addItem" });
  });

  test("'buy' prefix -> action", () => {
    const result = classifyShortIx("buyNow", {
      tagName: "a",
      role: null,
      parentEntity: null,
    });
    expect(result).toEqual({ kind: "action", action: "buyNow" });
  });

  test("'export' prefix -> action", () => {
    const result = classifyShortIx("exportCsv", {
      tagName: "a",
      role: null,
      parentEntity: null,
    });
    expect(result).toEqual({ kind: "action", action: "exportCsv" });
  });

  test("plain field without parent entity", () => {
    const result = classifyShortIx("name", {
      tagName: "h1",
      role: null,
      parentEntity: null,
    });
    expect(result).toEqual({ kind: "field", field: "name" });
  });

  test("plain field with parent entity -> prefixed", () => {
    const result = classifyShortIx("name", {
      tagName: "h1",
      role: null,
      parentEntity: "product",
    });
    expect(result).toEqual({ kind: "field", field: "product.name" });
  });

  test("price field with parent entity -> prefixed", () => {
    const result = classifyShortIx("price", {
      tagName: "span",
      role: null,
      parentEntity: "product",
    });
    expect(result).toEqual({ kind: "field", field: "product.price" });
  });

  /**
   * DOCUMENTING TEST — known flaw: "address" starts with "add" so the
   * verb-prefix heuristic misclassifies it as an action.
   *
   * TODO(aurix): replace verb-prefix guessing with an explicit `ix-action`
   * attribute so authors declare intent rather than relying on string prefixes.
   */
  test("KNOWN FLAW: 'address' misclassified as action because it starts with 'add'", () => {
    const result = classifyShortIx("address", {
      tagName: "p",
      role: null,
      parentEntity: "customer",
    });
    // This is WRONG semantically but documents the current behavior.
    expect(result).toEqual({ kind: "action", action: "address" });
    // A future fix will make this return { kind: "field", field: "customer.address" }.
  });
});

// ---------------------------------------------------------------------------
// fullFieldName
// ---------------------------------------------------------------------------
describe("fullFieldName", () => {
  test("with parent entity -> prefixed", () => {
    expect(fullFieldName("name", "product")).toBe("product.name");
  });

  test("without parent entity -> bare field name", () => {
    expect(fullFieldName("name", null)).toBe("name");
  });
});

// ---------------------------------------------------------------------------
// SSR / CSR parity test
// Simulate expandClientSide using cheerio to verify both paths produce
// identical data-* attributes for the same markup.
// ---------------------------------------------------------------------------
describe("SSR/CSR parity", () => {
  /**
   * Simulate the CSR expander (aurix-expand.ts) using cheerio so we can run
   * this parity test in Node without a real DOM.  The logic mirrors
   * expandClientSide exactly: same ix-rules functions, same attribute
   * read/write order.
   */
  function expandClientSideViaCheerio(html: string): string {
    const { parseEntityIx, classifyShortIx, fullFieldName } = require("../src/core/ix-rules");
    const { load } = require("cheerio");
    const $ = load(html, { xmlMode: false });
    const body = $("body");
    const domain = body.attr("ix-domain");
    const version = body.attr("ix-version") || "6.0";
    if (domain) body.attr("data-domain", domain);
    body.attr("data-aurix", version);

    $("*").each((_i: number, el: any) => {
      const node = $(el);
      const ix = node.attr("ix");
      const ixField = node.attr("ix-field");
      const ixAuto = node.attr("ix-auto");
      const ixValue = node.attr("ix-value");
      const ixGroup = node.attr("ix-group");
      const ixMode = node.attr("ix-mode");

      const entity = ix ? parseEntityIx(ix) : null;
      if (entity) {
        node.attr("data-type", entity.type);
        node.attr("data-entity", entity.entity);
        if (entity.id) node.attr("data-id", entity.id);
      }

      const parentEntityOf = () =>
        node.parents("[data-entity]").first().attr("data-entity") || null;

      if (ixField) {
        node.attr("data-field", fullFieldName(ixField, parentEntityOf()));
      } else if (ix && !entity) {
        const cls = classifyShortIx(ix, {
          tagName: String((el as any).name || ""),
          role: node.attr("role") || null,
          parentEntity: parentEntityOf(),
        });
        if (cls.kind === "action") node.attr("data-action", cls.action);
        else if (cls.kind === "field") node.attr("data-field", cls.field);
      }

      if (ixAuto) node.attr("data-auto", ixAuto);
      if (ixValue) node.attr("data-value", ixValue);
      if (ixGroup) node.attr("data-group", ixGroup);
      if (ixMode) node.attr("data-mode", ixMode);
    });

    return $.html();
  }

  const HTML_FIXTURE = `<body ix-domain="ProductPage">
    <section ix="productDetails.product#SKU123">
      <h1 ix="name">Widget</h1>
      <span ix="price">$9.99</span>
      <button ix="addToCart">Add</button>
    </section>
  </body>`;

  test("SSR and CSR produce identical data-* attributes", () => {
    // SSR path (expandHtmlServerSide) — strip the injected graph script for comparison
    const { html: ssrHtml } = expandHtmlServerSide(HTML_FIXTURE);
    const $ssr = load(ssrHtml);
    // Remove the injected graph script before comparing markup
    $ssr("#aurix-graph").remove();
    const ssrClean = $ssr.html();

    // CSR simulation path
    const csrHtml = expandClientSideViaCheerio(HTML_FIXTURE);
    const $csr = load(csrHtml);
    const csrClean = $csr.html();

    // Both should have the same data-* attributes on every annotated element
    const $s = load(ssrClean);
    const $c = load(csrClean);

    // Check entity element
    expect($s("section").attr("data-entity")).toBe($c("section").attr("data-entity"));
    expect($s("section").attr("data-type")).toBe($c("section").attr("data-type"));
    expect($s("section").attr("data-id")).toBe($c("section").attr("data-id"));

    // Check field elements
    expect($s("h1").attr("data-field")).toBe($c("h1").attr("data-field"));
    expect($s("span").attr("data-field")).toBe($c("span").attr("data-field"));

    // Check action element
    expect($s("button").attr("data-action")).toBe($c("button").attr("data-action"));
    expect($s("button").attr("data-field")).toBeUndefined();
    expect($c("button").attr("data-field")).toBeUndefined();
  });
});
