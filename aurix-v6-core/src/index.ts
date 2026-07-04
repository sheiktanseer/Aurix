// Public API for aurix-v6-core.
export { parseHtmlToIxAst } from "./core/parser";
export type { IxNode } from "./core/parser";

export { expandHtmlServerSide, generateGraphFromDom, serializeGraphJson } from "./core/expander";
export type { ExpandOptions, ExpandMode } from "./core/expander";

export { inferGraphFromHtml } from "./core/ushe";
export type { InferredNode } from "./core/ushe";

// Shared classification rules (SSR/CSR parity layer).
export { parseEntityIx, classifyShortIx, fullFieldName } from "./core/ix-rules";
export type { IxClassification } from "./core/ix-rules";

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
