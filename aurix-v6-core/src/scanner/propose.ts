/**
 * SCANNER-ONLY heuristics.
 *
 * This module is the ONLY place a sideEffects value may be *guessed*, and even
 * here it is emitted as a `status: "proposed"` suggestion that a human must
 * confirm — never as a declared IR value. Core, IR construction, and every
 * emitter are forbidden from importing this module (enforced by the
 * `sideEffects.no-derivation-import` test and the eslint no-restricted-imports
 * rule). Do not re-export it from the IR barrel.
 */

import type { SideEffect } from "../ir/types";

export type SideEffectProposal = {
  value: SideEffect;
  /** 0..1 confidence in the guess. */
  confidence: number;
  /** Human-readable justification shown alongside the proposed diff. */
  rationale: string;
  status: "proposed";
};

export type ProposeInput = {
  name?: string;
  method?: string;
  endpoint?: string;
  handler?: string;
  contractKind?: "form" | "http" | "handler";
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PAYMENT_HINT = /\b(pay|payment|checkout|charge|billing|purchase|order|subscribe|donate)\b/i;
const DESTRUCTIVE_HINT = /\b(delete|remove|destroy|cancel|deactivate|close|revoke|wipe|clear)\b/i;

/**
 * Proposes a sideEffects value from an action's contract shape. Returns a
 * suggestion object; the caller (the scanner) presents it for human
 * confirmation and only a confirmed value is ever written to IR.
 */
export function proposeSideEffects(input: ProposeInput): SideEffectProposal {
  const method = (input.method || "").toUpperCase();
  const surface = `${input.name || ""} ${input.handler || ""} ${input.endpoint || ""}`;

  if (method === "DELETE" || DESTRUCTIVE_HINT.test(surface)) {
    return { value: "destructive", confidence: 0.7, rationale: "DELETE method or destructive verb in name/endpoint.", status: "proposed" };
  }
  if (PAYMENT_HINT.test(surface)) {
    return { value: "payment", confidence: 0.7, rationale: "Payment-related term in name/endpoint.", status: "proposed" };
  }
  if (MUTATING_METHODS.has(method)) {
    return { value: "write", confidence: 0.6, rationale: `Mutating HTTP method ${method}.`, status: "proposed" };
  }
  if ((input.contractKind === "form" || input.contractKind === "handler") && !method) {
    return { value: "write", confidence: 0.4, rationale: "Form/handler contract with no explicit method assumed to mutate.", status: "proposed" };
  }
  return { value: "none", confidence: 0.3, rationale: "No mutating signal found; likely read-only. LOW confidence — confirm.", status: "proposed" };
}
