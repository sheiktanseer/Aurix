/**
 * @jest-environment node
 *
 * Unit tests for src/core/ix-rules.ts — the shared, DOM-free classification
 * layer that guarantees SSR/CSR parity. Post-T1.1 the classifier is
 * CONTRACT-driven: an action exists only when a contract is declared. There is
 * no verb-prefix guessing.
 */
import { parseEntityIx, classifyShortIx, fullFieldName, detectContract } from "../src/core/ix-rules";
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
    expect(parseEntityIx("a.b.c#X")).toEqual({ type: "a", entity: "b.c", id: "X" });
  });

  test("no dot returns null (not an entity token)", () => {
    expect(parseEntityIx("name")).toBeNull();
    expect(parseEntityIx("addToCart")).toBeNull();
  });

  test("empty string returns null", () => {
    expect(parseEntityIx("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectContract — the gate that makes something an action
// ---------------------------------------------------------------------------
describe("detectContract", () => {
  test("endpoint + method -> http contract", () => {
    expect(detectContract({ endpoint: "/cart/add", method: "POST" })).toEqual({
      kind: "http",
      endpoint: "/cart/add",
      method: "POST",
    });
  });

  test("handler -> handler contract", () => {
    expect(detectContract({ handler: "onAddToCart" })).toEqual({ kind: "handler", handler: "onAddToCart" });
  });

  test("form flag -> form contract", () => {
    expect(detectContract({ isForm: true })).toEqual({ kind: "form" });
  });

  test("endpoint WITHOUT method is NOT a contract", () => {
    expect(detectContract({ endpoint: "/cart/add" })).toBeNull();
  });

  test("ix-action alone (no endpoint/method/handler/form) is NOT a contract", () => {
    expect(detectContract({ explicitAction: "addToCart" })).toBeNull();
  });

  test("nothing declared -> null", () => {
    expect(detectContract({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyShortIx — action only with a contract, field otherwise
// ---------------------------------------------------------------------------
describe("classifyShortIx", () => {
  test("with contract -> action carrying that contract", () => {
    const contract = { kind: "http" as const, endpoint: "/cart/add", method: "POST" };
    expect(
      classifyShortIx("addToCart", { tagName: "button", role: null, parentEntity: "product", contract })
    ).toEqual({ kind: "action", action: "addToCart", contract });
  });

  test("explicit ix-action name overrides the ix token for the action name", () => {
    const contract = { kind: "form" as const };
    expect(
      classifyShortIx("btn", { tagName: "button", role: null, parentEntity: null, contract, explicitAction: "search" })
    ).toEqual({ kind: "action", action: "search", contract });
  });

  test("NO contract on a button -> field (classifier does not guess actions)", () => {
    expect(
      classifyShortIx("addToCart", { tagName: "button", role: null, parentEntity: "product", contract: null })
    ).toEqual({ kind: "field", field: "product.addToCart" });
  });

  test("plain data field with parent entity -> prefixed field", () => {
    expect(
      classifyShortIx("name", { tagName: "h1", role: null, parentEntity: "product", contract: null })
    ).toEqual({ kind: "field", field: "product.name" });
  });

  /**
   * PHANTOM-TOOL FIX: "address" no longer becomes an action. With no contract it
   * is a field. (The old verb-prefix heuristic misclassified it because it began
   * with "add".)
   */
  test("'address' is a field, not an action (no verb-prefix guessing)", () => {
    expect(
      classifyShortIx("address", { tagName: "p", role: null, parentEntity: "customer", contract: null })
    ).toEqual({ kind: "field", field: "customer.address" });
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
// Phantom-tool behavior at the expander level
// ---------------------------------------------------------------------------
describe("phantom-tool suppression (expander)", () => {
  test("a contract-less button is dropped: no action, no field", () => {
    const html = `<body>
      <section ix="productDetails.product#P1">
        <button ix="addToCart">Add</button>
      </section>
    </body>`;
    const { html: out } = expandHtmlServerSide(html, { mode: "debug" });
    const $ = load(out);
    const btn = $("button");
    expect(btn.attr("data-action")).toBeUndefined();
    expect(btn.attr("data-field")).toBeUndefined();
  });

  test("a button WITH a contract becomes an action", () => {
    const html = `<body>
      <section ix="productDetails.product#P1">
        <button ix="addToCart" ix-endpoint="/cart/add" ix-method="POST">Add</button>
      </section>
    </body>`;
    const { html: out } = expandHtmlServerSide(html, { mode: "debug" });
    const $ = load(out);
    expect($("button").attr("data-action")).toBe("addToCart");
  });

  test("a non-control 'address' field is data, never a tool", () => {
    const html = `<body>
      <section ix="customerDetails.customer#C1">
        <p ix="address">1 Main St</p>
      </section>
    </body>`;
    const { html: out } = expandHtmlServerSide(html, { mode: "debug" });
    const $ = load(out);
    expect($("p").attr("data-field")).toBe("customer.address");
    expect($("p").attr("data-action")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SSR / CSR parity — same ix-rules, byte-identical data-* on both paths
// ---------------------------------------------------------------------------
describe("SSR/CSR parity", () => {
  // Cheerio simulation of the CSR expander (src/client/aurix-expand.ts): it uses
  // the exact same shared rules and the same phantom-drop policy.
  function expandClientSideViaCheerio(html: string): string {
    const { parseEntityIx, classifyShortIx, fullFieldName, detectContract } = require("../src/core/ix-rules");
    const { load } = require("cheerio");
    const $ = load(html, { xmlMode: false });
    const body = $("body");
    const domain = body.attr("ix-domain");
    const version = body.attr("ix-version") || "6.0";
    if (domain) body.attr("data-domain", domain);
    body.attr("data-aurix", version);

    $("*").each((_i: number, el: any) => {
      const node = $(el);
      const mapAttr = (ixName: string, dataName: string) => {
        const v = node.attr(ixName);
        if (v != null && node.attr(dataName) == null) node.attr(dataName, v);
      };
      mapAttr("ix-endpoint", "data-endpoint");
      mapAttr("ix-method", "data-method");
      mapAttr("ix-handler", "data-handler");

      const ix = node.attr("ix");
      const ixField = node.attr("ix-field");
      const entity = ix ? parseEntityIx(ix) : null;
      if (entity) {
        node.attr("data-type", entity.type);
        node.attr("data-entity", entity.entity);
        if (entity.id) node.attr("data-id", entity.id);
      }
      const parentEntityOf = () => node.parents("[data-entity]").first().attr("data-entity") || null;
      const tagName = String((el as any).name || "").toLowerCase();
      const role = node.attr("role") || null;
      const withinForm = tagName === "form" ||
        ((tagName === "button" || tagName === "input" || role === "button") && node.closest("form").length > 0);
      const explicitAction = node.attr("ix-action") || null;
      const contract = detectContract({
        endpoint: node.attr("data-endpoint") || null,
        method: node.attr("data-method") || null,
        handler: node.attr("data-handler") || null,
        isForm: withinForm,
        explicitAction,
      });
      const shortIx = ix && !entity ? ix : null;
      const actionName = explicitAction || shortIx;
      const controlLike = tagName === "button" || role === "button";
      const declaredActionIntent = !!explicitAction || (!!shortIx && controlLike);

      if (ixField) {
        node.attr("data-field", fullFieldName(ixField, parentEntityOf()));
      } else if (actionName && contract) {
        const cls = classifyShortIx(actionName, { tagName, role, parentEntity: parentEntityOf(), contract, explicitAction });
        if (cls.kind === "action") { node.attr("data-action", cls.action); node.attr("data-contract", cls.contract.kind); }
      } else if (declaredActionIntent) {
        // phantom drop
      } else if (shortIx) {
        const cls = classifyShortIx(shortIx, { tagName, role, parentEntity: parentEntityOf(), contract: null });
        if (cls.kind === "field") node.attr("data-field", cls.field);
      }
    });
    return $.html();
  }

  const HTML_FIXTURE = `<body ix-domain="ProductPage">
    <section ix="productDetails.product#SKU123">
      <h1 ix="name">Widget</h1>
      <span ix="price">$9.99</span>
      <button ix="addToCart" ix-endpoint="/cart/add" ix-method="POST">Add</button>
      <button ix="phantom">Phantom</button>
    </section>
  </body>`;

  test("SSR and CSR produce identical data-* attributes", () => {
    const { html: ssrHtml } = expandHtmlServerSide(HTML_FIXTURE, { mode: "debug" });
    const $ssr = load(ssrHtml);
    $ssr("#aurix-graph").remove();
    const $csr = load(expandClientSideViaCheerio(HTML_FIXTURE));

    expect($ssr("section").attr("data-entity")).toBe($csr("section").attr("data-entity"));
    expect($ssr("section").attr("data-id")).toBe($csr("section").attr("data-id"));
    expect($ssr("h1").attr("data-field")).toBe($csr("h1").attr("data-field"));
    expect($ssr("span").attr("data-field")).toBe($csr("span").attr("data-field"));

    const ssrButtons = $ssr("button");
    const csrButtons = $csr("button");
    // First button (with contract) -> action on both paths.
    expect($ssr(ssrButtons[0]).attr("data-action")).toBe("addToCart");
    expect($csr(csrButtons[0]).attr("data-action")).toBe("addToCart");
    // Second button (phantom) -> dropped on both paths.
    expect($ssr(ssrButtons[1]).attr("data-action")).toBeUndefined();
    expect($ssr(ssrButtons[1]).attr("data-field")).toBeUndefined();
    expect($csr(csrButtons[1]).attr("data-action")).toBeUndefined();
    expect($csr(csrButtons[1]).attr("data-field")).toBeUndefined();
  });
});
