// Public API for aurix-v6-core.
export { parseHtmlToIxAst } from "./core/parser";
export type { IxNode } from "./core/parser";

export { expandHtmlServerSide, generateGraphFromDom, serializeGraphJson } from "./core/expander";
export type { ExpandOptions, ExpandMode } from "./core/expander";

export { inferGraphFromHtml } from "./core/ushe";
export type { InferredNode } from "./core/ushe";

// Shared classification rules (SSR/CSR parity layer).
export { parseEntityIx, classifyShortIx, fullFieldName, detectContract } from "./core/ix-rules";
export type { IxClassification, ContractSignals } from "./core/ix-rules";

// Typed IR: types, vocab, typed values, agent-safety trio, builder, lint.
export type {
  IrGraph, IrNode, IrField, IrAction, ActionContract, ActionContractKind,
  SideEffect, Preconditions, OutputSchema, ErrorContract, TrustLevel,
} from "./ir/types";
export { buildIr } from "./ir/build";
export type { BuildIrOptions } from "./ir/build";
export {
  DEFAULT_VOCAB, loadVocab, resolveFieldType, unqualify,
} from "./ir/vocab";
export type { VocabConfig, VocabEntry, ResolvedFieldType } from "./ir/vocab";
export {
  coerceValue, parseMoney, parseDate, parseUrl, parseNumberish, parseBooleanish,
} from "./ir/values";
export type { FieldType, TypedValue, ParseHints } from "./ir/values";
export {
  SIDE_EFFECTS, isValidSideEffect, assertSideEffects, isReadOnly, isSuspiciousReadOnly,
  derivePreconditions, deriveOutputSchema, defaultErrorContract,
} from "./ir/safety";
export type { ActionAttrs } from "./ir/safety";
export { AurixValidationError } from "./ir/errors";

// Scanner-only heuristic proposer (public API for the CLI scanner). Core/IR/
// emitters must NOT import this — see test `sideEffects.no-derivation-import`.
export { proposeSideEffects } from "./scanner/propose";
export type { SideEffectProposal, ProposeInput } from "./scanner/propose";
export { lintIr, formatLint } from "./ir/lint";
export type { LintResult, LintFinding, LintSeverity } from "./ir/lint";

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
