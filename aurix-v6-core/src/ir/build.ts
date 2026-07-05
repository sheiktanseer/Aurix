/**
 * Builds the typed AURIX IR from an expanded DOM (data-* annotations already
 * applied by the expander). This is where scraped text becomes typed values and
 * where every action gains the agent-safety trio.
 */

import type { CheerioAPI } from "cheerio";
import { deriveNodeId, structuralPath, canonicalizeGraph } from "../core/canonical";
import { coerceValue, type FieldType } from "./values";
import { resolveFieldType, loadVocab, type VocabConfig } from "./vocab";
import {
  deriveSideEffects,
  derivePreconditions,
  deriveOutputSchema,
  type ActionAttrs,
} from "./safety";
import type {
  ActionContract,
  ActionContractKind,
  IrAction,
  IrField,
  IrGraph,
  IrNode,
  TrustLevel,
} from "./types";

export type BuildIrOptions = {
  vocab?: VocabConfig;
  version?: string;
  /** Emit the structural `debug.path` locator on each node (debug mode only). */
  includeDebug?: boolean;
};

const VALID_FIELD_TYPES = new Set<FieldType>(["text", "money", "date", "enum", "url", "number", "boolean"]);

function readFieldType(raw: string | undefined): FieldType | undefined {
  if (raw && VALID_FIELD_TYPES.has(raw as FieldType)) return raw as FieldType;
  return undefined;
}

function normalizeTrust(raw: string | undefined): TrustLevel | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return v === "low" || v === "ugc" || v === "untrusted" ? "low" : undefined;
}

function buildField($: CheerioAPI, f: any, vocab: VocabConfig): IrField | null {
  const $f = $(f);
  const name = $f.attr("data-field");
  if (!name) return null;

  // Raw text: explicit data-value wins, then <img src>, then element text.
  let raw = $f.text().trim();
  if ($f.is("img")) raw = $f.attr("src") || "";
  if ($f.attr("data-value") != null) raw = $f.attr("data-value") as string;

  const resolved = resolveFieldType(name, vocab, {
    type: readFieldType($f.attr("data-field-type")),
    schema: $f.attr("data-schema") || undefined,
  });

  const typed = coerceValue(resolved.type, raw, {
    currency: resolved.currency,
    options: resolved.options,
  });

  const field: IrField = {
    name,
    source: $f.attr("data-source") || "server",
    type: typed.type,
    value: typed.value,
    display: typed.display,
    ...(resolved.schema ? { schema: resolved.schema } : {}),
  };
  if ("currency" in typed && typed.currency) field.currency = typed.currency;
  if ("options" in typed && typed.options) field.options = typed.options;
  const trust = normalizeTrust($f.attr("data-trust"));
  if (trust) field.trust = trust;
  return field;
}

function buildAction($: CheerioAPI, a: any): IrAction | null {
  const $a = $(a);
  const name = $a.attr("data-action");
  if (!name) return null;

  const attrs: ActionAttrs = {
    endpoint: $a.attr("data-endpoint") || undefined,
    method: $a.attr("data-method") || undefined,
    handler: $a.attr("data-handler") || undefined,
    sideEffect: $a.attr("data-side-effect") || undefined,
    auth: $a.attr("data-auth") || undefined,
    requires: $a.attr("data-requires") || undefined,
    output: $a.attr("data-output") || undefined,
  };

  const kind = ($a.attr("data-contract") as ActionContractKind) ||
    (attrs.endpoint && attrs.method ? "http" : attrs.handler ? "handler" : "form");
  const contract: ActionContract = {
    kind,
    ...(attrs.endpoint ? { endpoint: attrs.endpoint } : {}),
    ...(attrs.method ? { method: attrs.method } : {}),
    ...(attrs.handler ? { handler: attrs.handler } : {}),
  };

  const sideEffects = deriveSideEffects(contract, attrs);
  const preconditions = derivePreconditions(sideEffects, attrs);
  const outputSchema = deriveOutputSchema(attrs);

  return {
    name,
    contract,
    // Flat backward-compatible fields (existing graph consumers rely on these).
    method: contract.method || "click",
    endpoint: contract.endpoint,
    requires: preconditions.requires,
    auth: preconditions.auth,
    // Agent-safety trio.
    sideEffects,
    preconditions,
    outputSchema,
  };
}

/**
 * Builds the canonical, typed IR graph from an expanded DOM.
 *
 * - Only `[data-entity]` elements become nodes.
 * - Fields/actions are claimed by their nearest enclosing entity (no leakage).
 * - Field values are typed via the vocab; actions carry the safety trio.
 * - Node ids use author-assigned ids when present; a structurally-derived id is
 *   emitted as a fallback but flagged (`authoredId: false`) for the linter.
 */
export function buildIr($: CheerioAPI, options: BuildIrOptions = {}): IrGraph {
  const vocab = options.vocab ?? loadVocab();
  const version = options.version ?? "6.0";
  const domain = $("body").attr("data-domain") || undefined;

  const nodes: IrNode[] = [];

  $("[data-entity]").each((_i, el) => {
    const $el = $(el);
    const entity = $el.attr("data-entity")!;
    const type = $el.attr("data-type");
    const dataId = $el.attr("data-id");
    const path = structuralPath(el, $);
    const id = deriveNodeId(entity, type, dataId, path);

    const fields: Record<string, IrField> = {};
    $el.find("[data-field]").each((_j, f) => {
      if ($(f).closest("[data-entity]").get(0) !== el) return;
      if ($(f).attr("data-action")) return; // defense in depth: actions never become fields
      const field = buildField($, f, vocab);
      if (field) fields[field.name] = field;
    });

    const actions: Record<string, IrAction> = {};
    $el.find("[data-action]").each((_j, a) => {
      if ($(a).closest("[data-entity]").get(0) !== el) return;
      const action = buildAction($, a);
      if (action) actions[action.name] = action;
    });

    const node: IrNode = {
      id,
      type: type ?? undefined,
      entity,
      authoredId: !!dataId,
      source: $el.attr("data-source") || "server",
      fields,
      actions,
    };
    const trust = normalizeTrust($el.attr("data-trust"));
    if (trust) node.trust = trust;
    if (options.includeDebug && path) node.debug = { path };

    nodes.push(node);
  });

  return canonicalizeGraph({ aurix: { version, ...(domain ? { domain } : {}) }, nodes }) as IrGraph;
}
