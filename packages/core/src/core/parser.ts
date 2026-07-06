import { load } from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import { randomUUID } from "node:crypto";

export type IxNode = {
  id: string;
  tag: string;
  ix?: string;
  ixField?: string;
  ixValue?: string;
  ixGroup?: string;
  ixAuto?: string;
  ixMode?: string;
  attrs: Record<string, string | undefined>;
  text?: string;
  children: IxNode[];
  parentId?: string | null;
  dataset?: Record<string, string>;
};

export function parseHtmlToIxAst(html: string): { root: IxNode; nodes: IxNode[] } {
  const $ = load(html, { xmlMode: false });
  const nodes: IxNode[] = [];

  function walk(el: AnyNode | undefined, parentId: string | null): IxNode | undefined {
    if (!el) return;
    const isText = el.type === "text";
    if (isText && !((el as Text).data && (el as Text).data.trim())) return;
    const tag = isText ? "#text" : ((el as Element).tagName ? (el as Element).tagName.toLowerCase() : "#text");
    const id = randomUUID();
    const attribs = (el as Element).attribs || {};
    const ix = attribs["ix"] || attribs["ix-field"] || null;
    const ixField = attribs["ix-field"] || null;
    const ixValue = attribs["ix-value"] || null;
    const ixGroup = attribs["ix-group"] || null;
    const ixAuto = attribs["ix-auto"] || null;
    const ixMode = attribs["ix-mode"] || null;

    const node: IxNode = {
      id,
      tag,
      ix: ix || undefined,
      ixField: ixField || undefined,
      ixValue: ixValue || undefined,
      ixGroup: ixGroup || undefined,
      ixAuto: ixAuto || undefined,
      ixMode: ixMode || undefined,
      attrs: attribs,
      text: isText ? ((el as Text).data || "") : undefined,
      children: [],
      parentId
    };

    nodes.push(node);

    const children = (el as Element).children || [];
    for (const ch of children) {
      const childNode = walk(ch, id);
      if (childNode) node.children.push(childNode);
    }
    return node;
  }

  const body = $("body").get(0) || $.root().get(0);
  const root = walk(body as AnyNode, null)!;
  return { root, nodes };
}
