import { expandHtmlServerSide, serializeGraphJson } from "../src/core/expander";

test("graph serialization escapes script-context breakout characters", () => {
  const out = serializeGraphJson({ evil: "</script><img src=x onerror=alert(1)>" });
  expect(out).not.toContain("</script>");
  expect(out).not.toContain("<img");
  expect(out).toContain("\\u003c");
});

test("malicious field text cannot break out of the aurix-graph script tag", () => {
  const html = `<body><section ix="productDetails.product#SKU"><h1 ix="name">evil</script><img src=x onerror=alert(1)>rest</h1></section></body>`;
  const { html: out } = expandHtmlServerSide(html);
  // Isolate the graph script's inner JSON.
  const open = out.indexOf('type="application/aurix+json">') + 'type="application/aurix+json">'.length;
  const close = out.indexOf("</script>", open);
  const graphJson = out.slice(open, close);
  // No raw angle brackets may survive inside the script body — all escaped to \\u003c / \\u003e.
  expect(graphJson).not.toMatch(/[<>]/);
  // And it must still be valid JSON (escapes are legal JSON string content).
  expect(() => JSON.parse(graphJson)).not.toThrow();
});
