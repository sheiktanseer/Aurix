// Public API for @aurix/core.
export { parseHtmlToIxAst } from "./core/parser";
export type { IxNode } from "./core/parser";

export { expandHtmlServerSide, generateGraphFromDom, serializeGraphJson } from "./core/expander";
export type { ExpandOptions, ExpandMode } from "./core/expander";

export { inferGraphFromHtml } from "./core/ushe";
export type { InferredNode } from "./core/ushe";

// Shared classification rules (SSR/CSR parity layer).
export { parseEntityIx, classifyShortIx, fullFieldName, detectContract } from "./core/ix-rules";
export type { IxClassification, ContractSignals } from "./core/ix-rules";

// Typed IR: re-exported from @aurix/ir so @aurix/core stays a superset API.
// The pure IR lives in its own package; core owns only the DOM->IR builder.
export {
  DEFAULT_VOCAB, loadVocab, resolveFieldType, unqualify,
  coerceValue, parseMoney, parseDate, parseUrl, parseNumberish, parseBooleanish,
  SIDE_EFFECTS, isValidSideEffect, assertSideEffects, isReadOnly, isSuspiciousReadOnly,
  derivePreconditions, deriveOutputSchema, defaultErrorContract,
  AurixValidationError, lintIr, formatLint,
} from "@aurix/ir";
export type {
  IrGraph, IrNode, IrField, IrAction, ActionContract, ActionContractKind,
  SideEffect, Preconditions, OutputSchema, ErrorContract, TrustLevel,
  VocabConfig, VocabEntry, ResolvedFieldType,
  FieldType, TypedValue, ParseHints, ActionAttrs,
  LintResult, LintFinding, LintSeverity,
} from "@aurix/ir";

// DOM -> IR builder (lives in core because it is cheerio-coupled).
export { buildIr } from "./core/build";
export type { BuildIrOptions } from "./core/build";

// Scanner-only heuristic proposer (public API for the CLI scanner). Core/IR/
// emitters must NOT import this — see test `sideEffects.no-derivation-import`.
export { proposeSideEffects } from "./scanner/propose";
export type { SideEffectProposal, ProposeInput } from "./scanner/propose";

// Canonical graph utilities (stable IDs, deterministic serialization).
export { structuralPath, deriveNodeId, canonicalizeGraph, canonicalJson, sortKeys } from "./core/canonical";

// Signing / verification.
export {
  resolveKeyConfig,
  signGraphJws,
  verifyGraphJws,
  signGraphDetached,
  verifyGraphDetached,
  sha256hex,
} from "./server/signature";

export { expandClientSide } from "./client/aurix-expand";
