/**
 * @jest-environment node
 *
 * C-1 regression suite. sideEffects is author-declared, validated at IR
 * construction, never derived and never defaulted — in strict OR loose mode.
 * The heuristic proposer is fenced to the scanner.
 */
import fs from "fs";
import path from "path";
import { load } from "cheerio";
import { expandHtmlServerSide, generateGraphFromDom } from "../src/core/expander";
import { lintIr } from "../src/ir/lint";
import { AurixValidationError } from "../src/ir/errors";

/** Expanded DOM (data-* set) for one entity with one action, sideEffects optional. */
function actionDom(opts: { action: string; method: string; sideEffect?: string }) {
  const se = opts.sideEffect ? ` data-side-effect="${opts.sideEffect}"` : "";
  return load(
    `<body><section data-entity="product" data-type="productDetails" data-id="P1">` +
      `<button data-action="${opts.action}" data-endpoint="/x" data-method="${opts.method}" data-contract="http"${se}>Go</button>` +
      `</section></body>`
  );
}

function caught(fn: () => unknown): AurixValidationError | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e as AurixValidationError;
  }
}

describe("sideEffects", () => {
  test("missing-throws", () => {
    // Full pipeline: an action with no declared sideEffects fails IR construction.
    const html = `<body><section ix="productDetails.product#P1">` +
      `<button ix="addToCart" ix-endpoint="/cart/add" ix-method="POST">Add</button></section></body>`;
    const err = caught(() => expandHtmlServerSide(html));
    expect(err).toBeInstanceOf(AurixValidationError);
    expect(err!.code).toBe("E_SIDE_EFFECTS_MISSING");
  });

  test("unknown-verb-no-default", () => {
    // "frobnicate" is not a known verb; POST contract; nothing declared.
    // It must THROW rather than silently defaulting to any value (esp. "none").
    const $ = actionDom({ action: "frobnicate", method: "POST" });
    const err = caught(() => generateGraphFromDom($));
    expect(err).toBeInstanceOf(AurixValidationError);
    expect(err!.code).toBe("E_SIDE_EFFECTS_MISSING");
    // Prove no value was produced (no silent "none").
    expect(err!.message).not.toMatch(/"none"/);
  });

  test("loose-mode-still-fails", () => {
    const $ = actionDom({ action: "frobnicate", method: "POST" });
    const err = caught(() => generateGraphFromDom($, { strict: false }));
    expect(err).toBeInstanceOf(AurixValidationError);
    expect(err!.code).toBe("E_SIDE_EFFECTS_MISSING");
  });

  test("none-on-mutating-method-warns", () => {
    // Declared "none" on a POST is a WARNING, not an error: build passes.
    const $ = actionDom({ action: "peek", method: "POST", sideEffect: "none" });
    const graph = generateGraphFromDom($); // must not throw
    const result = lintIr(graph);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "W_SIDE_EFFECTS_SUSPICIOUS")).toBe(true);
  });

  test("no-derivation-import", () => {
    // Core and IR must never import the scanner-only proposal module.
    const roots = [path.resolve(__dirname, "../src/core"), path.resolve(__dirname, "../src/ir")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".ts")) {
          const src = fs.readFileSync(p, "utf8");
          if (/from\s+["'][^"']*scanner\/propose["']/.test(src) || /\bproposeSideEffects\b/.test(src)) {
            offenders.push(p);
          }
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
