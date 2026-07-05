/**
 * AURIX vocabulary — the local `vocab.config` that binds field names to a
 * {@link FieldType} and a Schema.org property URI.
 *
 * This is the single place that decides "the field called `price` is money and
 * maps to https://schema.org/price". Authors can:
 *   - rely on the built-in DEFAULT_VOCAB below,
 *   - pass a project `vocab.config` (merged over the defaults), or
 *   - override per-element with `ix-type="money"` / `ix-schema="..."`.
 *
 * Lookup is by the *unqualified* field name ("product.price" -> "price"), with
 * an optional fully-qualified override ("product.price") taking precedence.
 */

import type { FieldType } from "./values";

export type VocabEntry = {
  type: FieldType;
  /** Schema.org property URI, e.g. "https://schema.org/price". */
  schema?: string;
  /** Allowed values for enum fields. */
  options?: string[];
  /** Default ISO currency when a money field carries no symbol/code. */
  currency?: string;
};

export type VocabConfig = Record<string, VocabEntry>;

const S = (prop: string) => `https://schema.org/${prop}`;

/**
 * Built-in vocabulary covering the common commerce/content surface. Keys are
 * unqualified field names. Project `vocab.config` entries merge over these.
 */
export const DEFAULT_VOCAB: VocabConfig = {
  // Money
  price: { type: "money", schema: S("price") },
  salePrice: { type: "money", schema: S("price") },
  listPrice: { type: "money", schema: S("price") },
  total: { type: "money", schema: S("totalPrice") },
  subtotal: { type: "money", schema: S("price") },
  amount: { type: "money", schema: S("amount") },

  // Text
  name: { type: "text", schema: S("name") },
  title: { type: "text", schema: S("name") },
  description: { type: "text", schema: S("description") },
  brand: { type: "text", schema: S("brand") },
  sku: { type: "text", schema: S("sku") },
  author: { type: "text", schema: S("author") },
  carrier: { type: "text", schema: S("provider") },

  // URL
  image: { type: "url", schema: S("image") },
  images: { type: "url", schema: S("image") },
  url: { type: "url", schema: S("url") },
  link: { type: "url", schema: S("url") },

  // Number
  rating: { type: "number", schema: S("ratingValue") },
  reviewCount: { type: "number", schema: S("reviewCount") },
  quantity: { type: "number", schema: S("value") },

  // Date
  date: { type: "date", schema: S("datePublished") },
  publishedDate: { type: "date", schema: S("datePublished") },
  releaseDate: { type: "date", schema: S("releaseDate") },

  // Enum
  availability: { type: "enum", schema: S("availability"), options: ["InStock", "OutOfStock", "PreOrder", "SoldOut"] },
  status: { type: "enum", schema: S("status") },
  condition: { type: "enum", schema: S("itemCondition"), options: ["NewCondition", "UsedCondition", "RefurbishedCondition"] },

  // Boolean
  inStock: { type: "boolean", schema: S("availability") },
};

/** Merges a project vocab over the built-in defaults (project wins per key). */
export function loadVocab(project?: VocabConfig): VocabConfig {
  if (!project) return { ...DEFAULT_VOCAB };
  return { ...DEFAULT_VOCAB, ...project };
}

/** Strips an entity prefix: "product.price" -> "price"; "price" -> "price". */
export function unqualify(fieldName: string): string {
  const dot = fieldName.lastIndexOf(".");
  return dot === -1 ? fieldName : fieldName.slice(dot + 1);
}

export type ResolvedFieldType = {
  type: FieldType;
  schema?: string;
  options?: string[];
  currency?: string;
};

/**
 * Resolves the type binding for a field.
 *
 * Precedence: explicit `ix-type` override > fully-qualified vocab key
 * ("product.price") > unqualified vocab key ("price") > untyped `text`.
 */
export function resolveFieldType(
  fieldName: string,
  vocab: VocabConfig,
  overrides?: { type?: FieldType; schema?: string }
): ResolvedFieldType {
  if (overrides?.type) {
    return { type: overrides.type, schema: overrides.schema };
  }
  const qualified = vocab[fieldName];
  if (qualified) {
    return { ...qualified, schema: overrides?.schema ?? qualified.schema };
  }
  const unq = unqualify(fieldName);
  const entry = vocab[unq];
  if (entry) {
    return { ...entry, schema: overrides?.schema ?? entry.schema };
  }
  return { type: "text", schema: overrides?.schema };
}
