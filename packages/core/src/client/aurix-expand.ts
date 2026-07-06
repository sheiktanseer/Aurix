import { parseEntityIx, classifyShortIx, fullFieldName, detectContract } from "../core/ix-rules";

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
    // Mirror the SSR ix-* -> data-* mapping so contracts/types resolve identically.
    const mapAttr = (ixName: string, dataName: string) => {
      const v = el.getAttribute(ixName);
      if (v != null && el.getAttribute(dataName) == null) el.setAttribute(dataName, v);
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

    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const withinForm = tagName === "form" ||
      ((tagName === "button" || tagName === "input" || role === "button") && !!el.closest("form"));
    const explicitAction = el.getAttribute("ix-action");
    const contract = detectContract({
      endpoint: el.getAttribute("data-endpoint"),
      method: el.getAttribute("data-method"),
      handler: el.getAttribute("data-handler"),
      isForm: withinForm,
      explicitAction,
    });
    const shortIx = ix && !entity ? ix : null;
    const actionName = explicitAction || shortIx;
    const controlLike = tagName === "button" || role === "button" ||
      (tagName === "input" && ["submit", "button"].includes((el.getAttribute("type") || "").toLowerCase()));
    const declaredActionIntent = !!explicitAction || (!!shortIx && controlLike);

    if (ixField) {
      el.setAttribute("data-field", fullFieldName(ixField, parentEntityOf()));
    } else if (actionName && contract) {
      const cls = classifyShortIx(actionName, {
        tagName, role, parentEntity: parentEntityOf(), contract, explicitAction,
      });
      if (cls.kind === "action") {
        el.setAttribute("data-action", cls.action);
        el.setAttribute("data-contract", cls.contract.kind);
      }
    } else if (declaredActionIntent) {
      // Phantom action (declared without a contract): intentionally drop.
    } else if (shortIx) {
      const cls = classifyShortIx(shortIx, {
        tagName, role, parentEntity: parentEntityOf(), contract: null, explicitAction: null,
      });
      if (cls.kind === "field") el.setAttribute("data-field", cls.field);
    }

    if (ixAuto) el.setAttribute("data-auto", ixAuto);
    if (ixValue) el.setAttribute("data-value", ixValue);
    if (ixGroup) el.setAttribute("data-group", ixGroup);
    if (ixMode) el.setAttribute("data-mode", ixMode);
  }

  root.dispatchEvent(new CustomEvent("aurix:expanded", { detail: { source: "client" } }));
}
