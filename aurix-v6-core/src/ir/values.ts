/**
 * Typed value parsing for the AURIX IR.
 *
 * Scraped DOM text is never trusted as a value. Every field named by the vocab
 * (or an explicit `ix-type`) is parsed into a structured {@link TypedValue}:
 *
 *   "$1,299"      -> { type: "money",  value: 1299,  currency: "USD", display: "$1,299" }
 *   "2026-07-05"  -> { type: "date",   value: "2026-07-05T00:00:00.000Z", display: "2026-07-05" }
 *   "In stock"    -> { type: "enum",   value: "In stock", display: "In stock" }
 *   "/p/widget"   -> { type: "url",    value: "/p/widget", display: "/p/widget" }
 *
 * The `display` string always preserves the author-visible text; the `value`
 * carries the machine-usable, normalized datum. Consumers act on `value`.
 */

export type FieldType = "text" | "money" | "date" | "enum" | "url" | "number" | "boolean";

export type TypedValue =
  | { type: "text"; value: string; display: string }
  | { type: "money"; value: number; currency: string; display: string }
  | { type: "date"; value: string; display: string }
  | { type: "enum"; value: string; display: string; options?: string[] }
  | { type: "url"; value: string; display: string }
  | { type: "number"; value: number; display: string }
  | { type: "boolean"; value: boolean; display: string };

/** Options that refine how a raw string is coerced into a TypedValue. */
export type ParseHints = {
  /** Force a currency (ISO 4217) when the raw text has no symbol/code. */
  currency?: string;
  /** Allowed values for an enum field. */
  options?: string[];
  /** Base URL used to resolve relative URLs (kept as-is in `display`). */
  baseUrl?: string;
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  "₺": "TRY",
  "₴": "UAH",
  "₦": "NGN",
  R$: "BRL",
  A$: "AUD",
  C$: "CAD",
  HK$: "HKD",
  NZ$: "NZD",
};

// Longest symbols first so "R$" wins over "$".
const CURRENCY_SYMBOL_KEYS = Object.keys(CURRENCY_SYMBOLS).sort((a, b) => b.length - a.length);

const ISO_4217 = /\b([A-Z]{3})\b/;

/**
 * Parses a money string into a normalized numeric value + ISO currency.
 *
 * Handles: leading/trailing currency symbols ("$1,299", "9.99 €"), ISO codes
 * ("USD 1299", "1299 EUR"), thousands separators (both "," and " "), and both
 * "1,234.56" and "1.234,56" decimal conventions (disambiguated by the last
 * separator seen). Returns `null` when no numeric amount can be recovered.
 */
export function parseMoney(raw: string, hints: ParseHints = {}): { value: number; currency: string } | null {
  const text = raw.trim();
  if (!text) return null;

  let currency: string | undefined = hints.currency;

  // Symbol detection (longest match first).
  for (const sym of CURRENCY_SYMBOL_KEYS) {
    if (text.includes(sym)) {
      currency = CURRENCY_SYMBOLS[sym];
      break;
    }
  }
  // ISO code detection (only if no symbol matched).
  if (!currency) {
    const iso = text.match(ISO_4217);
    if (iso) currency = iso[1];
  }

  const amount = parseNumericAmount(text);
  if (amount === null) return null;

  return { value: amount, currency: currency || "USD" };
}

/**
 * Extracts a numeric amount from a string that may contain grouping/decimal
 * separators, disambiguating US ("1,234.56") from European ("1.234,56") layouts.
 *
 * Rules:
 *  - Both separators present: the *last* one is the decimal separator.
 *  - Only commas: >1 comma, or a lone comma followed by exactly 3 digits, is a
 *    thousands separator ("1,299" -> 1299); otherwise it is decimal ("1,29").
 *  - Only dots: >1 dot is thousands ("1.234.567"); a lone dot is decimal (US
 *    default), even when followed by 3 digits.
 */
function parseNumericAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,\-]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;

  const commas = (cleaned.match(/,/g) || []).length;
  const dots = (cleaned.match(/\./g) || []).length;

  let normalized: string;
  if (commas > 0 && dots > 0) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", "."); // comma decimal
    } else {
      normalized = cleaned.replace(/,/g, ""); // dot decimal
    }
  } else if (commas > 0) {
    const afterLast = cleaned.length - cleaned.lastIndexOf(",") - 1;
    normalized = commas > 1 || afterLast === 3
      ? cleaned.replace(/,/g, "")   // thousands
      : cleaned.replace(",", ".");  // decimal
  } else if (dots > 1) {
    normalized = cleaned.replace(/\./g, ""); // European thousands
  } else {
    normalized = cleaned;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

/** Parses a date string into an ISO 8601 instant. Returns `null` when unparseable. */
export function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// URL (security-sensitive)
// ---------------------------------------------------------------------------

const DANGEROUS_URL_SCHEME = /^\s*(javascript|data|vbscript|file):/i;

/**
 * Validates a URL value. Relative URLs are accepted as-is; absolute URLs must
 * use a safe scheme. Dangerous schemes (javascript:, data:, vbscript:, file:)
 * are rejected outright so a scraped `href` can never become an agent-invoked
 * XSS/exfiltration vector. Returns `null` when the value is unsafe.
 */
export function parseUrl(raw: string, hints: ParseHints = {}): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (DANGEROUS_URL_SCHEME.test(text)) return null;

  // Absolute URL: validate scheme via the URL parser.
  if (/^[a-z][a-z0-9+.\-]*:/i.test(text)) {
    try {
      const u = new URL(text);
      if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "mailto:" && u.protocol !== "tel:") {
        return null;
      }
      return u.toString();
    } catch {
      return null;
    }
  }
  // Protocol-relative or path-relative URL: accept the literal value.
  return text;
}

// ---------------------------------------------------------------------------
// Enum / number / boolean
// ---------------------------------------------------------------------------

const TRUTHY = new Set(["true", "yes", "y", "1", "on", "in stock", "available"]);
const FALSY = new Set(["false", "no", "n", "0", "off", "out of stock", "unavailable", "sold out"]);

export function parseBooleanish(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (TRUTHY.has(t)) return true;
  if (FALSY.has(t)) return false;
  return null;
}

export function parseNumberish(raw: string): number | null {
  const n = parseNumericAmount(raw);
  return n;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Coerces `raw` text into a {@link TypedValue} of the requested `type`.
 *
 * `display` always preserves the trimmed source text. When coercion fails the
 * value falls back to a `text` TypedValue so the pipeline never throws on a
 * single malformed field — the lint layer surfaces the mismatch instead.
 */
export function coerceValue(type: FieldType, raw: string, hints: ParseHints = {}): TypedValue {
  const display = raw.trim();

  switch (type) {
    case "money": {
      const m = parseMoney(display, hints);
      if (m) return { type: "money", value: m.value, currency: m.currency, display };
      return { type: "text", value: display, display };
    }
    case "date": {
      const iso = parseDate(display);
      if (iso) return { type: "date", value: iso, display };
      return { type: "text", value: display, display };
    }
    case "url": {
      const u = parseUrl(display, hints);
      if (u !== null) return { type: "url", value: u, display };
      return { type: "text", value: display, display };
    }
    case "enum": {
      const options = hints.options;
      return { type: "enum", value: display, display, ...(options ? { options } : {}) };
    }
    case "number": {
      const n = parseNumberish(display);
      if (n !== null) return { type: "number", value: n, display };
      return { type: "text", value: display, display };
    }
    case "boolean": {
      const b = parseBooleanish(display);
      if (b !== null) return { type: "boolean", value: b, display };
      return { type: "text", value: display, display };
    }
    case "text":
    default:
      return { type: "text", value: display, display };
  }
}
