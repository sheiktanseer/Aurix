import { parseEntityIx, classifyShortIx, fullFieldName } from "../core/ix-rules";

// Client-side (DOM) expander. All classification decisions are delegated to the
// shared, DOM-free rules in ../core/ix-rules so that CSR output is byte-identical
// to the server-side expander for the same markup.
export function expandClientSide(root: Document = document) {
  const body = root.body;
  const domain = body.getAttribute("ix-domain");
  const version = body.getAttribute("ix-version") || "6.0";
  if (domain) body.setAttribute("data-domain", domain);
  body.setAttribute("data-aurix", version);

  const walker = root.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Element);

  for (const el of nodes) {
    const ix = el.getAttribute("ix");
    const ixField = el.getAttribute("ix-field");
    const ixAuto = el.getAttribute("ix-auto");
    const ixValue = el.getAttribute("ix-value");
    const ixGroup = el.getAttribute("ix-group");
    const ixMode = el.getAttribute("ix-mode");

    const entity = ix ? parseEntityIx(ix) : null;
    if (entity) {
      el.setAttribute("data-type", entity.type);
      el.setAttribute("data-entity", entity.entity);
      if (entity.id) el.setAttribute("data-id", entity.id);
    }

    const parentEntityOf = () =>
      (el.closest("[data-entity]") as Element | null)?.getAttribute("data-entity") || null;

    if (ixField) {
      el.setAttribute("data-field", fullFieldName(ixField, parentEntityOf()));
    } else if (ix && !entity) {
      const cls = classifyShortIx(ix, {
        tagName: el.tagName,
        role: el.getAttribute("role"),
        parentEntity: parentEntityOf()
      });
      // Fix 2: actions carry data-action ONLY (no fake data-field leak).
      if (cls.kind === "action") el.setAttribute("data-action", cls.action);
      else if (cls.kind === "field") el.setAttribute("data-field", cls.field);
    }

    if (ixAuto) el.setAttribute("data-auto", ixAuto);
    if (ixValue) el.setAttribute("data-value", ixValue);
    if (ixGroup) el.setAttribute("data-group", ixGroup);
    if (ixMode) el.setAttribute("data-mode", ixMode);
  }

  root.dispatchEvent(new CustomEvent("aurix:expanded", { detail: { source: "client" } }));
}
