// Pure, DOM-free AURIX classification rules shared by the server-side (cheerio)
// and client-side (DOM) expanders. Keeping these here guarantees SSR/CSR parity:
// there is exactly one source of truth for how an `ix` token becomes data-*.

export type IxClassification =
  | { kind: "entity"; type: string; entity: string; id?: string }
  | { kind: "action"; action: string }
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
 * Classifies a non-dotted ("short") ix token as either an action or a field.
 *
 * An element is an action when it is a button (tag or role) OR its ix starts
 * with one of the action verbs; otherwise it is a field.
 *
 * KNOWN FLAW (encoded deliberately, covered by a documenting test): the prefix
 * heuristic misclassifies field names that merely begin with an action verb —
 * e.g. ix="address" starts with "add" and is therefore treated as an action.
 * TODO(aurix): replace verb-prefix guessing with an explicit `ix-action`
 * attribute so authors declare intent instead of relying on string prefixes.
 */
export function classifyShortIx(
  ix: string,
  ctx: { tagName: string; role: string | null; parentEntity: string | null }
): IxClassification {
  const isButton = ctx.tagName.toLowerCase() === "button" || ctx.role === "button";
  const hasActionPrefix = ix.startsWith("add") || ix.startsWith("buy") || ix.startsWith("export");
  if (isButton || hasActionPrefix) {
    return { kind: "action", action: ix };
  }
  return { kind: "field", field: fullFieldName(ix, ctx.parentEntity) };
}
