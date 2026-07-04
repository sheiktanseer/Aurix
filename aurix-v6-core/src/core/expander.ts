import { CheerioAPI, load } from "cheerio";

type ExpandOptions = {
  vocab?: Record<string, string>;
  defaultDomain?: string;
  version?: string;
};

export function expandHtmlServerSide(html: string, opts: ExpandOptions = {}): { html: string; graphScript: string } {
  const $ = load(html, { xmlMode: false });
  const body = $("body");
  const version = opts.version || "6.0";

  const ixDomain = body.attr("ix-domain") || opts.defaultDomain;
  if (ixDomain) {
    body.attr("data-domain", ixDomain);
  }
  body.attr("data-aurix", version);

  function applyExpansion(el: CheerioAPI | any) {
    const node = $(el);
    const ix = node.attr("ix");
    const ixField = node.attr("ix-field");
    const ixAuto = node.attr("ix-auto");
    const ixGroup = node.attr("ix-group");
    const ixValue = node.attr("ix-value");
    const ixMode = node.attr("ix-mode");

    if (ix && ix.includes(".")) {
      const parts = ix.split(".");
      const section = parts[0];
      const rest = parts.slice(1).join(".");
      const [entityPart, idPart] = rest.split("#");
      node.attr("data-type", section);
      node.attr("data-entity", entityPart);
      if (idPart) node.attr("data-id", idPart);
    }

    if (ixField) {
      const parentEntity = node.parents("[data-entity]").first().attr("data-entity");
      const full = parentEntity ? `${parentEntity}.${ixField}` : ixField;
      node.attr("data-field", full);
    } else if (ix && !ix.includes(".")) {
      const parentEntity = node.parents("[data-entity]").first().attr("data-entity");
      const full = parentEntity ? `${parentEntity}.${ix}` : ix;
      if (node.is("button") || node.is("[role=button]") || ix.startsWith("add") || ix.startsWith("buy") || ix.startsWith("export")) {
        node.attr("data-action", ix);
        if (parentEntity) node.attr("data-field", parentEntity);
      } else {
        node.attr("data-field", full);
      }
    }

    if (ixAuto) {
      node.attr("data-auto", ixAuto);
    }
    if (ixGroup) node.attr("data-group", ixGroup);
    if (ixValue) node.attr("data-value", ixValue);
    if (ixMode) node.attr("data-mode", ixMode);
  }

  $("*").each((i, el) => {
    applyExpansion(el);
  });

  const graph = generateGraphFromDom($);
  const graphScript = `<script id="aurix-graph" type="application/aurix+json">${serializeGraphJson(graph)}</script>`;
  body.prepend(graphScript);

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
    const id = $el.attr("data-id") || `${entity}:${i}`;
    const fields: Record<string, any> = {};

    $el.find("[data-field]").each((j, f) => {
      const $f = $(f);
      // Only claim fields whose nearest entity ancestor is this node; otherwise
      // fields belonging to a nested entity would leak into (and overwrite) the parent.
      if ($f.closest("[data-entity]").get(0) !== el) return;
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

  return { aurix: { version: "6.0" }, nodes };
}
