/**
 * Derivation of the agent-safety trio for an action:
 *   1. sideEffects  — none | write | payment | destructive
 *   2. preconditions — auth + named requirements
 *   3. outputSchema  — success shape + a structured error contract
 *
 * This is the highest-value schema in AURIX: it is what lets an agent decide
 * "may I invoke this without asking?" A missing/unknown side effect is treated
 * conservatively (never `none` for a mutating verb).
 */

import type {
  ActionContract,
  ErrorContract,
  OutputSchema,
  Preconditions,
  SideEffect,
} from "./types";

/** Raw action attributes read off the DOM element. */
export type ActionAttrs = {
  endpoint?: string;
  method?: string;
  handler?: string;
  /** Explicit author override: ix-side-effect / data-side-effect. */
  sideEffect?: string;
  auth?: string;
  requires?: string;
  /** Explicit author override for success schema (JSON string). */
  output?: string;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PAYMENT_HINT = /\b(pay|payment|checkout|charge|billing|purchase|order|subscribe|donate)\b/i;
const DESTRUCTIVE_HINT = /\b(delete|remove|destroy|cancel|deactivate|close|revoke|wipe)\b/i;

function normalizeSideEffect(raw: string | undefined): SideEffect | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "none" || v === "read" || v === "readonly" || v === "read-only") return "none";
  if (v === "write") return "write";
  if (v === "payment") return "payment";
  if (v === "destructive") return "destructive";
  return null;
}

/**
 * Derives the side-effect class for an action.
 *
 * Precedence: explicit author override > destructive verb/method > payment
 * hint > mutating method (write) > default `none`. The default is only `none`
 * for non-mutating contracts; an unknown mutating method is never silently
 * classified as safe.
 */
export function deriveSideEffects(contract: ActionContract, attrs: ActionAttrs): SideEffect {
  const explicit = normalizeSideEffect(attrs.sideEffect);
  if (explicit) return explicit;

  const method = (contract.method || attrs.method || "").toUpperCase();
  const endpoint = contract.endpoint || attrs.endpoint || "";
  const name = `${attrs.handler || ""} ${endpoint}`;

  if (method === "DELETE" || DESTRUCTIVE_HINT.test(name)) return "destructive";
  if (PAYMENT_HINT.test(name)) return "payment";
  if (MUTATING_METHODS.has(method)) return "write";

  // Form contracts with no explicit method default to a mutating submit.
  if (contract.kind === "form" && !method) return "write";
  // A handler with no other signal is assumed to write (conservative).
  if (contract.kind === "handler" && !method) return "write";

  return "none";
}

/**
 * Derives preconditions. When the author does not specify `auth`, mutating
 * side effects default to `required` (fail-safe) and reads to `optional`.
 */
export function derivePreconditions(sideEffects: SideEffect, attrs: ActionAttrs): Preconditions {
  const requires = (attrs.requires || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let auth: Preconditions["auth"];
  const explicit = (attrs.auth || "").trim().toLowerCase();
  if (explicit === "none" || explicit === "required" || explicit === "optional") {
    auth = explicit as Preconditions["auth"];
  } else {
    auth = sideEffects === "none" ? "optional" : "required";
  }

  return { auth, requires };
}

/** The canonical structured error envelope every action advertises. */
export function defaultErrorContract(): ErrorContract {
  return {
    type: "object",
    properties: {
      code: { type: "string", description: "Machine-readable error code (e.g. OUT_OF_STOCK, UNAUTHENTICATED)." },
      message: { type: "string" },
      retriable: { type: "boolean" },
    },
    required: ["code", "message", "retriable"],
  };
}

/**
 * Builds the action output schema: a success shape (author-provided JSON via
 * `ix-output`/`data-output`, else a permissive object) plus the standard error
 * contract. Agents can rely on the error envelope shape regardless of endpoint.
 */
export function deriveOutputSchema(attrs: ActionAttrs): OutputSchema {
  let success: Record<string, unknown> = { type: "object", description: "Action result payload." };
  if (attrs.output) {
    try {
      const parsed = JSON.parse(attrs.output);
      if (parsed && typeof parsed === "object") success = parsed as Record<string, unknown>;
    } catch {
      // Malformed author schema is ignored here; the lint layer reports it.
    }
  }
  return { success, error: defaultErrorContract() };
}
