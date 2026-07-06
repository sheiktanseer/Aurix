/**
 * Agent-safety trio helpers for IR Actions.
 *
 *   1. sideEffects  — none | write | payment | destructive  (AUTHOR-DECLARED)
 *   2. preconditions — auth + named requirements
 *   3. outputSchema  — success shape + a structured error contract
 *
 * C-1 RULE (binding): sideEffects derivation is FORBIDDEN here and in every
 * core/IR/emitter path. This module therefore contains NO heuristic that turns
 * a contract into a sideEffects value — only validation and read-only helpers.
 * The heuristic proposer lives in `src/scanner/propose.ts` and is import-
 * fenced away from core (see test `sideEffects.no-derivation-import`).
 */

import type {
  ActionContract,
  ErrorContract,
  OutputSchema,
  Preconditions,
  SideEffect,
} from "./types";
import { AurixValidationError } from "./errors";

export const SIDE_EFFECTS: readonly SideEffect[] = ["none", "write", "payment", "destructive"] as const;

export function isValidSideEffect(v: unknown): v is SideEffect {
  return typeof v === "string" && (SIDE_EFFECTS as readonly string[]).includes(v);
}

/**
 * Validates an author-declared sideEffects value at IR construction time.
 * Missing or invalid → throws E_SIDE_EFFECTS_MISSING. There is no default and
 * no derivation; this fires identically in strict and loose mode.
 */
export function assertSideEffects(actionName: string, raw: unknown): SideEffect {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
  if (!isValidSideEffect(v)) {
    throw new AurixValidationError(
      "E_SIDE_EFFECTS_MISSING",
      `Action "${actionName}" must declare sideEffects as one of ` +
        `none|write|payment|destructive (author-declared, no default). ` +
        `Got: ${raw === undefined ? "undefined" : JSON.stringify(raw)}.`
    );
  }
  return v;
}

/** Read-only iff sideEffects is exactly "none". Used by emitters for readOnlyHint. */
export function isReadOnly(action: { sideEffects: SideEffect }): boolean {
  return action.sideEffects === "none";
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cross-check for the W_SIDE_EFFECTS_SUSPICIOUS warning: an author declared
 * `none` on an action whose contract uses a mutating HTTP method. This is a
 * WARNING (surfaced by lint), never a hard error and never a silent override —
 * the declared value still stands.
 */
export function isSuspiciousReadOnly(sideEffects: SideEffect, contract: ActionContract): boolean {
  const method = (contract.method || "").toUpperCase();
  return sideEffects === "none" && MUTATING_METHODS.has(method);
}

/** Raw precondition/output attributes read off the DOM element. */
export type ActionAttrs = {
  auth?: string;
  requires?: string;
  output?: string;
};

/**
 * Builds preconditions from author attributes. `auth` is a boolean gate; a
 * value of "required"/"true"/"1"/"yes" (or presence of any `requires`) means
 * auth is required. This reads only precondition attributes — it does not look
 * at sideEffects, so it cannot be a covert sideEffects derivation.
 */
export function derivePreconditions(attrs: ActionAttrs): Preconditions {
  const requires = (attrs.requires || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const authRaw = (attrs.auth || "").trim().toLowerCase();
  const authTruthy = ["required", "true", "1", "yes", "auth"].includes(authRaw);
  const auth = authTruthy || requires.length > 0;

  return { auth, requires };
}

/** The canonical structured error envelope every action advertises (C-4 shape). */
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
 * contract. Not a sideEffects derivation.
 */
export function deriveOutputSchema(attrs: ActionAttrs): OutputSchema {
  let success: Record<string, unknown> = { type: "object", description: "Action result payload." };
  if (attrs.output) {
    try {
      const parsed = JSON.parse(attrs.output);
      if (parsed && typeof parsed === "object") success = parsed as Record<string, unknown>;
    } catch {
      // Malformed author schema ignored here; lint reports it.
    }
  }
  return { success, error: defaultErrorContract() };
}
