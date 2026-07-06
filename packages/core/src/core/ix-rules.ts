// Pure, DOM-free AURIX classification rules shared by the server-side (cheerio)
// and client-side (DOM) expanders. Keeping these here guarantees SSR/CSR parity:
// there is exactly one source of truth for how an `ix` token becomes data-*.

import type { ActionContract } from "@aurix/ir";

export type IxClassification =
  | { kind: "entity"; type: string; entity: string; id?: string }
  | { kind: "action"; action: string; contract: ActionContract }
  | { kind: "field"; field: string };

/**
 * Parses a dotted entity ix token.
 *   "productDetails.product#SKU123" -> { type: "productDetails", entity: "product", id: "SKU123" }
 * Everything after the FIRST dot is the entity[#id] part, so:
 *   "a.b.c#X" -> { type: "a", entity: "b.c", id: "X" }
 * A token with no dot is not an entity token -> null.
 */
export function parseEntityIx(ix: string): { type: string; entity: string; id?: string } | null {
  if (!ix.includes(".")) return null;
  const parts = ix.split(".");
  const type = parts[0];
  const rest = parts.slice(1).join(".");
  const [entity, id] = rest.split("#");
  return { type, entity, id: id || undefined };
}

/** Prefixes a bare field name with its owning entity, when there is one. */
export function fullFieldName(field: string, parentEntity: string | null): string {
  return parentEntity ? `${parentEntity}.${field}` : field;
}

/**
 * Signals, read off a single element, that may add up to an action contract.
 * These come from authoring attributes (`ix-endpoint`, `ix-method`,
 * `ix-handler`, `ix-action`) or their `data-*` passthrough equivalents, plus a
 * structural `isForm` flag computed by the expander (element is a <form> or a
 * submit control bound to one).
 */
export type ContractSignals = {
  endpoint?: string | null;
  method?: string | null;
  handler?: string | null;
  isForm?: boolean;
  /** Explicit `ix-action` value — names the action but does NOT by itself create one. */
  explicitAction?: string | null;
};

/**
 * Detects whether an element declares an action *contract*.
 *
 * A contract — and therefore an action — exists only when the element declares
 * a concrete way to be invoked:
 *   - endpoint + method (an HTTP contract), or
 *   - a code handler (`ix-handler`), or
 *   - a form (the element is a <form> / submit control bound to a form).
 *
 * `ix-action` alone is NOT a contract: it only supplies the action's name. This
 * is what kills the phantom-tool class — a plain `<button ix="address">` or
 * `<p ix="address">` can never become an exposed tool, because it declares no
 * way to be invoked.
 */
export function detectContract(signals: ContractSignals): ActionContract | null {
  const endpoint = signals.endpoint || undefined;
  const method = signals.method || undefined;
  const handler = signals.handler || undefined;

  if (endpoint && method) return { kind: "http", endpoint, method };
  if (handler) return { kind: "handler", handler };
  if (signals.isForm) return { kind: "form", ...(endpoint ? { endpoint } : {}), ...(method ? { method } : {}) };
  return null;
}

/**
 * Classifies a non-dotted ("short") ix token as either an action or a field.
 *
 * The rule is contract-driven, not verb-driven:
 *   - If the element declares a contract, it is an action whose name is the
 *     explicit `ix-action` value (if any) or the ix token itself.
 *   - Otherwise it is a field.
 *
 * There is deliberately NO string-prefix guessing. The old `startsWith("add")`
 * heuristic misclassified data fields like "address" as tools; removing it is
 * the point.
 */
export function classifyShortIx(
  ix: string,
  ctx: {
    tagName: string;
    role: string | null;
    parentEntity: string | null;
    contract?: ActionContract | null;
    explicitAction?: string | null;
  }
): IxClassification {
  if (ctx.contract) {
    return { kind: "action", action: ctx.explicitAction || ix, contract: ctx.contract };
  }
  return { kind: "field", field: fullFieldName(ix, ctx.parentEntity) };
}
