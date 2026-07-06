// @aurix/ir — the pure, DOM-free typed IR: types, typed values, vocab.config,
// the agent-safety trio, validation errors, and lint. No cheerio, no DOM, no
// dependency on @aurix/core (the dependency edge is core -> ir, never back).

export type {
  IrGraph, IrNode, IrField, IrAction, ActionContract, ActionContractKind,
  SideEffect, Preconditions, OutputSchema, ErrorContract, TrustLevel,
} from "./types";

export {
  coerceValue, parseMoney, parseDate, parseUrl, parseNumberish, parseBooleanish,
} from "./values";
export type { FieldType, TypedValue, ParseHints } from "./values";

export {
  DEFAULT_VOCAB, loadVocab, resolveFieldType, unqualify,
} from "./vocab";
export type { VocabConfig, VocabEntry, ResolvedFieldType } from "./vocab";

export {
  SIDE_EFFECTS, isValidSideEffect, assertSideEffects, isReadOnly, isSuspiciousReadOnly,
  derivePreconditions, deriveOutputSchema, defaultErrorContract,
} from "./safety";
export type { ActionAttrs } from "./safety";

export { AurixValidationError } from "./errors";

export { lintIr, formatLint } from "./lint";
export type { LintResult, LintFinding, LintSeverity } from "./lint";
