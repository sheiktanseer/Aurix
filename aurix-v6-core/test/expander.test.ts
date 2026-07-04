import { expandHtmlServerSide, generateGraphFromDom } from "../src/core/expander";
import { load } from "cheerio";

test("expands ix to data- attributes", () => {
  const html = `<body ix-domain="ProductPage"><section ix="productDetails.product#SKU"><h1 ix="name">X</h1></section></body>`;
  const { html: out } = expandHtmlServerSide(html);
  expect(out).toContain('data-domain="ProductPage"');
  expect(out).toContain('data-entity="product"');
  expect(out).toContain('data-field="product.name"');
});

test("nested entity fields do not leak into the parent entity's node", () => {
  const html = `<body>
    <section ix="orderDetails.order#O1">
      <span ix="total">100</span>
      <div ix="lineItem.product#P1">
        <span ix="name">Widget</span>
      </div>
    </section>
  </body>`;
  const { html: out } = expandHtmlServerSide(html);
  const $ = load(out);
  const graph = generateGraphFromDom($);
  const order = graph.nodes.find((n: any) => n.entity === "order");
  const product = graph.nodes.find((n: any) => n.entity === "product");
  // The child product's "name" must belong to the product node, not the order node.
  expect(Object.keys(order.fields)).toContain("order.total");
  expect(Object.keys(order.fields)).not.toContain("product.name");
  expect(Object.keys(product.fields)).toContain("product.name");
});
