export function expandClientSide(root: Document = document) {
  const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  while(walker.nextNode()) nodes.push(walker.currentNode as Element);
  const body = document.body;
  const domain = body.getAttribute("ix-domain");
  const version = body.getAttribute("ix-version") || "6.0";
  if (domain) body.setAttribute("data-domain", domain);
  body.setAttribute("data-aurix", version);

  for (const el of nodes) {
    const ix = el.getAttribute("ix");
    const ixField = el.getAttribute("ix-field");
    const ixAuto = el.getAttribute("ix-auto");
    const ixValue = el.getAttribute("ix-value");
    const ixGroup = el.getAttribute("ix-group");
    const ixMode = el.getAttribute("ix-mode");
    if (ix) {
      if (ix.includes(".")) {
        // Keep parity with the server expander: everything after the first dot
        // is the entity[#id] part, so "a.b.c" must not drop "c".
        const parts = ix.split(".");
        const section = parts[0];
        const rest = parts.slice(1).join(".");
        const [entity, id] = rest.split("#");
        el.setAttribute("data-type", section);
        el.setAttribute("data-entity", entity);
        if (id) el.setAttribute("data-id", id);
      } else {
        const parentEntity = (el.closest("[data-entity]") as Element | null)?.getAttribute("data-entity");
        const full = parentEntity ? `${parentEntity}.${ix}` : ix;
        if (el.tagName.toLowerCase() === "button" || el.getAttribute("role") === "button" || ix.startsWith("add") || ix.startsWith("buy") || ix.startsWith("export")) {
          el.setAttribute("data-action", ix);
          if (parentEntity) el.setAttribute("data-field", parentEntity);
        } else {
          el.setAttribute("data-field", full);
        }
      }
    }
    if (ixField) {
      const parentEntity = (el.closest("[data-entity]") as Element | null)?.getAttribute("data-entity");
      const full = parentEntity ? `${parentEntity}.${ixField}` : ixField;
      el.setAttribute("data-field", full);
    }
    if (ixAuto) el.setAttribute("data-auto", ixAuto);
    if (ixValue) el.setAttribute("data-value", ixValue);
    if (ixGroup) el.setAttribute("data-group", ixGroup);
    if (ixMode) el.setAttribute("data-mode", ixMode);
  }
  document.dispatchEvent(new CustomEvent("aurix:expanded", { detail: { source: "client" } }));
}
