import { parseHtmlToIxAst } from "../src/core/parser";

test("parse simple ix", () => {
  const html = `<body><section ix="productDetails.product#SKU"><h1 ix="name">X</h1><p ix="price">$10</p></section></body>`;
  const { nodes } = parseHtmlToIxAst(html);
  expect(nodes.length).toBeGreaterThan(0);
});
