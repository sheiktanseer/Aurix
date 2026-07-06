/**
 * The AURIX typed IR — the single canonical object every downstream emitter
 * (JSON-LD, WebMCP, MCP, manifest) and the signer consume.
 *
 * It is deliberately NOT the DOM and NOT scraped text: fields carry typed
 * values (see {@link TypedValue}) and actions carry the agent-safety trio
 * (sideEffects + preconditions + outputSchema).
 */

import type { FieldType, TypedValue } from "./values";

export type TrustLevel = "high" | "low";

export type IrField = {
  /** Fully-qualified field name, e.g. "product.price". */
  name: string;
  /** Schema.org property URI, when the vocab maps one. */
  schema?: string;
  /** Where this datum came from. */
  source: string;
  /** Typed value. `value`/`display`/etc. are spread from the TypedValue. */
  type: FieldType;
  value: TypedValue["value"];
  display: string;
  currency?: string;
  options?: string[];
  /** UGC / low-trust marker — set when the field originates in a UGC region. */
  trust?: TrustLevel;
};

/** What happens on the server if an agent invokes the action. */
export type SideEffect = "none" | "write" | "payment" | "destructive";

export type ActionContractKind = "form" | "http" | "handler";

export type ActionContract = {
  kind: ActionContractKind;
  endpoint?: string;
  method?: string;
  handler?: string;
};

export type Preconditions = {
  /** Whether authentication is required to invoke the action. */
  auth: boolean;
  /** Named preconditions that must hold (e.g. "item-in-stock", "logged-in"). */
  requires: string[];
};

/** Structured error contract every action advertises to agents. */
export type ErrorContract = {
  /** JSON-schema-ish description of the error envelope. */
  type: "object";
  properties: {
    code: { type: "string"; description: string };
    message: { type: "string" };
    retriable: { type: "boolean" };
  };
  required: string[];
};

export type OutputSchema = {
  success: Record<string, unknown>;
  error: ErrorContract;
};

export type IrAction = {
  name: string;
  contract: ActionContract;
  // --- backward-compatible flat fields (kept for existing graph consumers) ---
  method?: string;
  endpoint?: string;
  requires: string[];
  auth: boolean;
  // --- agent-safety trio ---
  /** Author-declared; there is no default and no derivation (C-1). */
  sideEffects: SideEffect;
  preconditions: Preconditions;
  outputSchema: OutputSchema;
};

export type IrNode = {
  id: string;
  type?: string;
  entity: string;
  /** Author-assigned when true; false means the id was structurally derived
   *  (a lint error — signatures over derived ids are not stable). */
  authoredId: boolean;
  source: string;
  trust?: TrustLevel;
  fields: Record<string, IrField>;
  actions: Record<string, IrAction>;
  /** Debug-only structural locator; never used as identity. */
  debug?: { path: string };
};

export type IrGraph = {
  aurix: { version: string; domain?: string };
  nodes: IrNode[];
};
