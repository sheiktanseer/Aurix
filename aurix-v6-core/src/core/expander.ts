import { CheerioAPI, load } from "cheerio";
import { parseEntityIx, classifyShortIx, fullFieldName } from "./ix-rules";
import { structuralPath, deriveNodeId, canonicalizeGraph } from "./canonical";

/** All ix* attribute names that AURIX uses during authoring. */
const IX_ATTRS = ["ix", "ix-field", "ix-auto", "ix-group", "ix-value", "ix-mode", "ix-domain", "ix-version"] as const;

/** All data-* attribute names that AURIX writes during expansion. */
const AURIX_DATA_ATTRS = [
  "data-type", "data-entity", "data-id", "data-field", "data-action",
  "data-auto", "data-group", "data-value", "data-mode", "data-domain",
  "data-aurix",
] as const;

export type ExpandMode = "canonical" | "debug" | "compact";

export type ExpandOptions = {
  vocab?: Record<string, string>;
  defaultDomain?: string;
  version?: string;
  /**
   * Controls how much of the AURIX annotation is shipped in the final HTML.
   *
   * - **canonical** (default): strips all `ix*` authoring attributes after
   *   expansion + graph generation. `data-*` annotations stay (needed for CSR
   *   updates and test selectors). The graph `<script>` stays.
   * - **debug**: keeps everything — ix* attrs, data-* attrs, and graph script.
   *   Equivalent to the old behavior.
   * - **compact**: additionally strips the AURIX `data-*` annotations from
   *   every element that received AURIX annotations during this expansion.
   *   Developer-authored `data-*` on unrelated elements are never touched.
   *   Ships clean HTML + the graph `<script>` only.
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

  // In compact mode we track which elements were annotated by AURIX so we
  // only strip AURIX data-* from those elements (never touch unrelated ones).
  const aurixAnnotated = new Set<any>();

  function applyExpansion(el: CheerioAPI | any) {
    const node = $(el);
    const ix = node.attr("ix");
    const ixField = node.attr("ix-field");
    const ixAuto = node.attr("ix-auto");
    const ixGroup = node.attr("ix-group");
    const ixValue = node.attr("ix-value");
    const ixMode = node.attr("ix-mode");

    let annotated = false;

    const entity = ix ? parseEntityIx(ix) : null;
    if (entity) {
      node.attr("data-type", entity.type);
      node.attr("data-entity", entity.entity);
      if (entity.id) node.attr("data-id", entity.id);
      annotated = true;
    }

    const parentEntityOf = () => node.parents("[data-entity]").first().attr("data-entity") || null;

    if (ixField) {
      node.attr("data-field", fullFieldName(ixField, parentEntityOf()));
      annotated = true;
    } else if (ix && !entity) {
      const cls = classifyShortIx(ix, {
        tagName: String((el as any).name || (el as any).tagName || ""),
        role: node.attr("role") || null,
        parentEntity: parentEntityOf()
      });
      // Fix 2: action elements carry data-action ONLY. The previous
      // `data-field = parentEntity` branch injected a fake field into the graph.
      if (cls.kind === "action") node.attr("data-action", cls.action);
      else if (cls.kind === "field") node.attr("data-field", cls.field);
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

  // The body itself gets data-domain / data-aurix — always mark it.
  const bodyEl = body.get(0);
  if (bodyEl) aurixAnnotated.add(bodyEl);

  // Generate graph BEFORE any stripping (compact mode needs the data-* intact).
  const graph = generateGraphFromDom($);
  const graphScript = `<script id="aurix-graph" type="application/aurix+json">${serializeGraphJson(graph)}</script>`;
  body.prepend(graphScript);

  // --- Mode: attribute stripping ---
  if (mode === "canonical" || mode === "compact") {
    // Remove all ix* authoring attributes from every element.
    $("*").each((_i, el) => {
      const node = $(el);
      for (const attr of IX_ATTRS) {
        node.removeAttr(attr);
      }
    });
  }

  if (mode === "compact") {
    // Remove AURIX data-* annotations from elements AURIX annotated during
    // this expansion pass. Never touch data-* on elements we didn't annotate.
    for (const el of aurixAnnotated) {
      const node = $(el);
      for (const attr of AURIX_DATA_ATTRS) {
        node.removeAttr(attr);
      }
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

export function generateGraphFromDom($: CheerioAPI) {
  const nodes: any[] = [];
  $("[data-entity]").each((i, el) => {
    const $el = $(el);
    const entity = $el.attr("data-entity");
    const type = $el.attr("data-type");
    const dataId = $el.attr("data-id");
    // Fix 5: stable, content-addressed ID so inserting a later sibling never
    // shifts earlier nodes' IDs. See canonical.ts for the derivation rules.
    const id = deriveNodeId(entity!, type, dataId, structuralPath(el, $));
    const fields: Record<string, any> = {};

    $el.find("[data-field]").each((j, f) => {
      const $f = $(f);
      // Only claim fields whose nearest entity ancestor is this node; otherwise
      // fields belonging to a nested entity would leak into (and overwrite) the parent.
      if ($f.closest("[data-entity]").get(0) !== el) return;
      // Defense in depth: action elements must never produce field entries. The
      // classification layer (ix-rules) already ensures actions get data-action
      // only; this guard is a safety net against future classification drift.
      if ($f.attr("data-action")) return;
      const field = $f.attr("data-field");
      if (!field) return;
      let value: any = $f.text().trim();
      if ($f.is("img")) value = $f.attr("src");
      if ($f.attr("data-value")) value = $f.attr("data-value");
      fields[field] = { value, source: $f.attr("data-source") || "server" };
    });

    const actions: Record<string, any> = {};
    $el.find("[data-action]").each((j, a) => {
      const $a = $(a);
      if ($a.closest("[data-entity]").get(0) !== el) return;
      const act = $a.attr("data-action");
      if (!act) return;
      actions[act] = {
        method: $a.attr("data-method") || "click",
        endpoint: $a.attr("data-endpoint"),
        requires: $a.attr("data-requires")?.split(",").map((s: string) => s.trim()) || [],
        auth: $a.attr("data-auth") || "optional"
      };
    });

    nodes.push({ id, type, entity, fields, actions, source: $el.attr("data-source") || "server" });
  });

  // Fix 5: canonicalize before returning (sorted nodes + sorted keys).
  return canonicalizeGraph({ aurix: { version: "6.0" }, nodes });
}
