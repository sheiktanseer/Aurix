import { CheerioAPI, load } from "cheerio";
import { parseEntityIx, classifyShortIx, fullFieldName, detectContract } from "./ix-rules";
import { structuralPath } from "./canonical";
import { buildIr, type BuildIrOptions } from "../ir/build";
import { loadVocab } from "../ir/vocab";
import type { IrGraph } from "../ir/types";

/** All ix* authoring attribute names that AURIX reads and then strips. */
const IX_ATTRS = [
  "ix", "ix-field", "ix-auto", "ix-group", "ix-value", "ix-mode", "ix-domain", "ix-version",
  // Action-contract + typing authoring attributes.
  "ix-action", "ix-endpoint", "ix-method", "ix-handler", "ix-side-effect",
  "ix-auth", "ix-requires", "ix-output", "ix-type", "ix-schema", "ix-trust",
] as const;

/** All data-* attribute names that AURIX writes during expansion. */
const AURIX_DATA_ATTRS = [
  "data-type", "data-entity", "data-id", "data-field", "data-action",
  "data-auto", "data-group", "data-value", "data-mode", "data-domain",
  "data-aurix",
  // Contract + typing annotations.
  "data-endpoint", "data-method", "data-handler", "data-side-effect",
  "data-auth", "data-requires", "data-output", "data-field-type", "data-schema", "data-trust",
  "data-contract",
] as const;

export type ExpandMode = "canonical" | "debug" | "compact";

export type ExpandOptions = {
  vocab?: Record<string, import("../ir/vocab").VocabEntry>;
  defaultDomain?: string;
  version?: string;
  /**
   * Controls how much of the AURIX annotation is shipped in the final HTML.
   *
   * - **canonical** (default): strips all `ix*` authoring attributes after
   *   expansion + graph generation. `data-*` annotations stay (needed for CSR
   *   updates and test selectors). The graph `<script>` stays.
   * - **debug**: keeps everything — ix* attrs, data-* attrs, and graph script.
   * - **compact**: additionally strips the AURIX `data-*` annotations from
   *   every element that received AURIX annotations during this expansion.
   *
   * In all modes the graph `<script id="aurix-graph">` is always present.
   */
  mode?: ExpandMode;
};

export function expandHtmlServerSide(html: string, opts: ExpandOptions = {}): { html: string; graphScript: string } {
  const $ = load(html, { xmlMode: false });
  const body = $("body");
  const version = opts.version || "6.0";
  const mode: ExpandMode = opts.mode ?? "canonical";

  const ixDomain = body.attr("ix-domain") || opts.defaultDomain;
  if (ixDomain) {
    body.attr("data-domain", ixDomain);
  }
  body.attr("data-aurix", version);

  const aurixAnnotated = new Set<any>();

  function applyExpansion(el: CheerioAPI | any) {
    const node = $(el);
    const ix = node.attr("ix");
    const ixField = node.attr("ix-field");
    const ixAuto = node.attr("ix-auto");
    const ixGroup = node.attr("ix-group");
    const ixValue = node.attr("ix-value");
    const ixMode = node.attr("ix-mode");

    // Map ix-* contract/typing authoring attrs onto their data-* equivalents so
    // both the graph builder and the CSR expander read one consistent surface.
    const mapAttr = (ixName: string, dataName: string) => {
      const v = node.attr(ixName);
      if (v != null && node.attr(dataName) == null) node.attr(dataName, v);
    };
    mapAttr("ix-endpoint", "data-endpoint");
    mapAttr("ix-method", "data-method");
    mapAttr("ix-handler", "data-handler");
    mapAttr("ix-side-effect", "data-side-effect");
    mapAttr("ix-auth", "data-auth");
    mapAttr("ix-requires", "data-requires");
    mapAttr("ix-output", "data-output");
    mapAttr("ix-type", "data-field-type");
    mapAttr("ix-schema", "data-schema");
    mapAttr("ix-trust", "data-trust");

    let annotated = false;

    const entity = ix ? parseEntityIx(ix) : null;
    if (entity) {
      node.attr("data-type", entity.type);
      node.attr("data-entity", entity.entity);
      if (entity.id) node.attr("data-id", entity.id);
      annotated = true;
    }

    const parentEntityOf = () => node.parents("[data-entity]").first().attr("data-entity") || null;

    // Compute action-contract signals for this element.
    const tagName = String((el as any).name || (el as any).tagName || "").toLowerCase();
    const role = node.attr("role") || null;
    const withinForm = tagName === "form" ||
      ((tagName === "button" || tagName === "input" || role === "button") && node.closest("form").length > 0);
    const contract = detectContract({
      endpoint: node.attr("data-endpoint") || null,
      method: node.attr("data-method") || null,
      handler: node.attr("data-handler") || null,
      isForm: withinForm,
      explicitAction: node.attr("ix-action") || null,
    });
    const explicitAction = node.attr("ix-action") || null;
    const shortIx = ix && !entity ? ix : null;
    const actionName = explicitAction || shortIx;
    const controlLike = tagName === "button" || role === "button" ||
      (tagName === "input" && ["submit", "button"].includes((node.attr("type") || "").toLowerCase()));
    // A control (or explicit ix-action) that names an action but declares no
    // contract is a phantom: it cannot be invoked, so it is dropped entirely —
    // never promoted to a tool and never demoted to a junk data field.
    const declaredActionIntent = !!explicitAction || (!!shortIx && controlLike);

    if (ixField) {
      node.attr("data-field", fullFieldName(ixField, parentEntityOf()));
      annotated = true;
    } else if (actionName && contract) {
      const cls = classifyShortIx(actionName, {
        tagName, role, parentEntity: parentEntityOf(), contract, explicitAction,
      });
      if (cls.kind === "action") {
        node.attr("data-action", cls.action);
        node.attr("data-contract", cls.contract.kind);
      }
      annotated = true;
    } else if (declaredActionIntent) {
      // Phantom action (declared without a contract): intentionally drop.
    } else if (shortIx) {
      // Non-control short token with no contract is data (the "address" case).
      const cls = classifyShortIx(shortIx, {
        tagName, role, parentEntity: parentEntityOf(), contract: null, explicitAction: null,
      });
      if (cls.kind === "field") node.attr("data-field", cls.field);
      annotated = true;
    }

    if (ixAuto) { node.attr("data-auto", ixAuto); annotated = true; }
    if (ixGroup) { node.attr("data-group", ixGroup); annotated = true; }
    if (ixValue) { node.attr("data-value", ixValue); annotated = true; }
    if (ixMode) { node.attr("data-mode", ixMode); annotated = true; }

    if (annotated) aurixAnnotated.add(el);
  }

  $("*").each((i, el) => {
    applyExpansion(el);
  });

  const bodyEl = body.get(0);
  if (bodyEl) aurixAnnotated.add(bodyEl);

  // Generate the typed IR (graph) BEFORE any stripping.
  const graph = generateGraphFromDom($, { vocab: loadVocab(opts.vocab), version, includeDebug: mode === "debug" });
  const graphScript = `<script id="aurix-graph" type="application/aurix+json">${serializeGraphJson(graph)}</script>`;
  body.prepend(graphScript);

  // --- Mode: attribute stripping ---
  if (mode === "canonical" || mode === "compact") {
    $("*").each((_i, el) => {
      const node = $(el);
      for (const attr of IX_ATTRS) node.removeAttr(attr);
    });
  }

  if (mode === "compact") {
    for (const el of aurixAnnotated) {
      const node = $(el);
      for (const attr of AURIX_DATA_ATTRS) node.removeAttr(attr);
    }
  }

  return { html: $.html(), graphScript };
}

// Characters that can break out of an HTML <script> context. Built from a string
// (not a regex literal) because U+2028/U+2029 are ECMAScript line terminators and
// cannot appear literally inside a regex literal. JSON.stringify leaves all of
// these unescaped, so "</script>", "<!--", etc. would otherwise enable XSS.
const SCRIPT_BREAKOUT = new RegExp("[<>&\\u2028\\u2029]", "g");

// Serializes graph JSON for safe embedding inside an HTML <script> element.
export function serializeGraphJson(graph: unknown): string {
  return JSON.stringify(graph).replace(SCRIPT_BREAKOUT, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

/**
 * Builds the typed AURIX IR from an expanded DOM. Delegates to {@link buildIr}
 * (src/ir/build.ts) which owns typed values, the agent-safety trio, and stable
 * ids. `opts` is optional so legacy callers `generateGraphFromDom($)` keep
 * working with the default vocab.
 */
export function generateGraphFromDom($: CheerioAPI, opts?: BuildIrOptions): IrGraph {
  return buildIr($, { vocab: opts?.vocab ?? loadVocab(), version: opts?.version ?? "6.0" });
}

// Re-export so existing imports of structuralPath via expander keep resolving.
export { structuralPath };
