/**
 * Canonical graph utilities for AURIX v6.
 *
 * Provides:
 * - Stable, content-addressed node IDs that don't drift when unrelated
 *   siblings are inserted after a node.
 * - Deterministic graph serialization (sorted keys, sorted nodes).
 * - RFC 8785-style canonical JSON for digest computation.
 */

import { createHash } from "node:crypto";
import type { CheerioAPI } from "cheerio";

// ---------------------------------------------------------------------------
// Structural path
// ---------------------------------------------------------------------------

/**
 * Computes the structural path from `<body>` to `el` as a slash-joined string
 * of `tagName[siblingIndex]` segments, e.g. `"section[2]/div[0]"`.
 *
 * Rules:
 * - Counting is among *element* siblings only (text / comment nodes ignored).
 * - The `<body>` element itself is not included in the path.
 * - Inserting a sibling AFTER a node does not change that node's index (the
 *   index counts only previous siblings).
 *
 * Residual limitation: inserting a sibling BEFORE shifts all later derived
 * ids.  Use an explicit `data-id` / `#id` to get a stable, layout-independent
 * identifier in that scenario.
 */
export function structuralPath(el: any, $: CheerioAPI): string {
  const segments: string[] = [];
  let current = el;

  while (current) {
    const parent = (current as any).parent;
    if (!parent) break;
    // Stop when we reach body (don't include body in the path).
    if (parent.type === "tag" && parent.name === "body") break;
    // Stop at document root.
    if (parent.type === "root") break;

    // Count element-type previous siblings only.
    let idx = 0;
    let sib = (current as any).prev;
    while (sib) {
      if (sib.type === "tag") idx++;
      sib = sib.prev;
    }

    const tag = (current as any).name || "unknown";
    segments.unshift(`${tag}[${idx}]`);
    current = parent;
  }

  return segments.join("/");
}

// ---------------------------------------------------------------------------
// Stable node ID derivation
// ---------------------------------------------------------------------------

/**
 * Derives a stable ID for a graph node.
 *
 * - If `data-id` is present: `"${entity}#${dataId}"` (author-assigned, always stable).
 * - Otherwise: `"${entity}@${first12hexOfSha256}"` where the hash input is
 *   `entity + ":" + type + ":" + structuralPath`.
 *
 * The 12-hex-char prefix gives 48 bits of collision resistance — sufficient
 * for page-level graphs (thousands of nodes).
 */
export function deriveNodeId(entity: string, type: string | undefined, dataId: string | undefined, path: string): string {
  if (dataId) {
    return `${entity}#${dataId}`;
  }
  const input = `${entity}:${type ?? ""}:${path}`;
  const hash = createHash("sha256").update(input, "utf8").digest("hex");
  return `${entity}@${hash.slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Recursively sorts the keys of every plain object (not arrays) in `obj`.
 * Arrays are preserved in their original order; their elements are recursively
 * sorted.
 *
 * Returns a new object — does not mutate the input.
 */
export function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Returns a canonical representation of `graph`:
 * - `nodes` array sorted ascending by `id`.
 * - All object keys (recursively) sorted lexicographically.
 *
 * This makes the serialized form deterministic regardless of insertion order.
 */
export function canonicalizeGraph(graph: { aurix: object; nodes: any[] }): { aurix: object; nodes: any[] } {
  const sortedNodes = [...graph.nodes].sort((a, b) => {
    const idA = String(a.id ?? "");
    const idB = String(b.id ?? "");
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  return sortKeys({ aurix: graph.aurix, nodes: sortedNodes }) as { aurix: object; nodes: any[] };
}

/**
 * Produces a canonical JSON string for digest purposes.
 *
 * This is an RFC 8785-inspired approach: recursively sort all object keys,
 * then call `JSON.stringify`.  This shortcut is safe here because AURIX graph
 * values are strings and plain numbers (no `undefined`, `BigInt`, circular
 * references, or special float values).  If the schema ever gains those types
 * this function must be upgraded to a full RFC 8785 implementation.
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}
