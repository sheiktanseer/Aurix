import cheerio from "cheerio";
import { randomUUID as uuid } from "node:crypto";

export type InferredNode = {
  id: string;
  entity?: string;
  fields: Record<string, any>;
  confidence: number;
};

export function inferGraphFromHtml(html: string): { nodes: InferredNode[]; domain?: string } {
  const $ = cheerio.load(html);
  const candidates: InferredNode[] = [];

  const priceRegex = /(?:\$|€|£)\s?\d{1,3}(?:[.,]\d{2})?/;
  $("*").each((i, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    if (priceRegex.test(text) && $(el).find("img").length === 0) {
      const title = $(el).closest("section,article,.product,.card").find("h1,h2,h3").first().text().trim();
      const node: InferredNode = {
        id: uuid(),
        entity: "product",
        fields: {
          name: title || undefined,
          price: text
        },
        confidence: 0.6
      };
      candidates.push(node);
    }
  });

  $("img").each((i, img) => {
    const src = $(img).attr("src");
    const card = $(img).closest(".product, .card, li, article, .item");
    if (card.length) {
      const title = card.find("h1,h2,h3").first().text().trim();
      const node: InferredNode = {
        id: uuid(),
        entity: "product",
        fields: {
          name: title,
          images: [src]
        },
        confidence: 0.5
      };
      candidates.push(node);
    }
  });

  return { nodes: candidates, domain: undefined };
}
