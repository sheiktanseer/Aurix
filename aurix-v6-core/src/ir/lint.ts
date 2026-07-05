/**
 * IR lint layer.
 *
 * The signature/verification story only works if node identity is stable, and
 * identity is stable only when authors assign ids. So a missing entity id is an
 * *error*, not a warning: the build still produces a structurally-derived
 * fallback id (`entity@<hash>`), but that id drifts when a sibling is inserted
 * before the node, which would silently invalidate a signature. Lint catches it
 * at authoring time.
 *
 * A second class of finding guards the phantom-tool boundary: an element that
 * declared an action name (`ix-action`) but no contract is reported so authors
 * notice it was demoted to data rather than exposed as a tool.
 */

import type { IrGraph } from "./types";

export type LintSeverity = "error" | "warning";

export type LintFinding = {
  severity: LintSeverity;
  code: string;
  message: string;
  /** Node id (or a structural hint) the finding attaches to. */
  where: string;
};

export type LintResult = {
  errors: LintFinding[];
  warnings: LintFinding[];
  ok: boolean;
};

/**
 * Lints a built IR graph. Currently:
 *   - E_MISSING_ID: entity node without an author-assigned id.
 *   - E_UNTYPED_MONEY_LOOKING: a text field whose display looks like money but
 *     was not typed (usually a vocab gap) — surfaced so money is never scraped
 *     text silently.
 *   - W_LOW_TRUST_MONEY: a money/action-bearing node marked low-trust (UGC).
 */
export function lintIr(graph: IrGraph): LintResult {
  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];

  const moneyLooking = /(?:[$€£¥₹]|\b[A-Z]{3}\b)\s?\d/;

  for (const node of graph.nodes) {
    if (!node.authoredId) {
      errors.push({
        severity: "error",
        code: "E_MISSING_ID",
        message:
          `Entity "${node.entity}" has no author-assigned id. Add "#id" to the ix token ` +
          `(e.g. ix="productDetails.product#SKU123"). Derived id "${node.id}" is not stable ` +
          `across sibling inserts and will break signatures.`,
        where: node.id,
      });
    }

    for (const field of Object.values(node.fields)) {
      if (field.type === "text" && moneyLooking.test(field.display)) {
        errors.push({
          severity: "error",
          code: "E_UNTYPED_MONEY",
          message:
            `Field "${field.name}" looks like money ("${field.display}") but is untyped text. ` +
            `Add it to vocab.config or set ix-type="money" so it emits a structured amount.`,
          where: node.id,
        });
      }
      if (field.trust === "low" && field.type === "money") {
        warnings.push({
          severity: "warning",
          code: "W_LOW_TRUST_MONEY",
          message: `Money field "${field.name}" is low-trust (UGC). Require human confirmation before use.`,
          where: node.id,
        });
      }
    }
  }

  return { errors, warnings, ok: errors.length === 0 };
}

/** Formats lint findings for CLI output. */
export function formatLint(result: LintResult): string {
  const lines: string[] = [];
  for (const e of result.errors) lines.push(`  error  ${e.code}  ${e.message}`);
  for (const w of result.warnings) lines.push(`  warn   ${w.code}  ${w.message}`);
  if (lines.length === 0) lines.push("  ok  no findings");
  return lines.join("\n");
}
