/**
 * @jest-environment node
 *
 * Pure unit tests for @aurix/ir — no DOM, no cheerio, no @aurix/core. These
 * prove the IR package stands on its own.
 */
import { coerceValue, parseMoney, parseUrl, parseDate } from "../src/values";
import { resolveFieldType, loadVocab } from "../src/vocab";
import {
  assertSideEffects, isValidSideEffect, isReadOnly, isSuspiciousReadOnly, derivePreconditions,
} from "../src/safety";
import { AurixValidationError } from "../src/errors";
import { lintIr } from "../src/lint";
import type { IrGraph } from "../src/types";

describe("@aurix/ir values", () => {
  test("money $1,299 -> 1299 USD", () => {
    expect(parseMoney("$1,299")).toEqual({ value: 1299, currency: "USD" });
  });
  test("money European 1.234,56 € -> 1234.56 EUR", () => {
    expect(parseMoney("1.234,56 €")).toEqual({ value: 1234.56, currency: "EUR" });
  });
  test("coerceValue money is structured", () => {
    expect(coerceValue("money", "$1,299")).toEqual({ type: "money", value: 1299, currency: "USD", display: "$1,299" });
  });
  test("url rejects javascript:", () => {
    expect(parseUrl("javascript:alert(1)")).toBeNull();
  });
  test("date -> ISO", () => {
    expect(parseDate("2026-07-06")).toBe("2026-07-06T00:00:00.000Z");
  });
});

describe("@aurix/ir vocab", () => {
  const vocab = loadVocab();
  test("price -> money + schema.org", () => {
    expect(resolveFieldType("product.price", vocab)).toMatchObject({ type: "money", schema: "https://schema.org/price" });
  });
  test("unknown -> text", () => {
    expect(resolveFieldType("product.zzz", vocab).type).toBe("text");
  });
});

describe("@aurix/ir safety", () => {
  test("isValidSideEffect", () => {
    expect(isValidSideEffect("payment")).toBe(true);
    expect(isValidSideEffect("nope")).toBe(false);
  });
  test("assertSideEffects throws on missing", () => {
    expect(() => assertSideEffects("act", undefined)).toThrow(AurixValidationError);
    try { assertSideEffects("act", undefined); } catch (e) { expect((e as AurixValidationError).code).toBe("E_SIDE_EFFECTS_MISSING"); }
  });
  test("assertSideEffects normalizes valid", () => {
    expect(assertSideEffects("act", "WRITE")).toBe("write");
  });
  test("isReadOnly only for none", () => {
    expect(isReadOnly({ sideEffects: "none" })).toBe(true);
    expect(isReadOnly({ sideEffects: "write" })).toBe(false);
  });
  test("isSuspiciousReadOnly: none + POST", () => {
    expect(isSuspiciousReadOnly("none", { kind: "http", method: "POST" })).toBe(true);
    expect(isSuspiciousReadOnly("none", { kind: "http", method: "GET" })).toBe(false);
  });
  test("derivePreconditions: requires implies auth", () => {
    expect(derivePreconditions({ requires: "x" })).toEqual({ auth: true, requires: ["x"] });
  });
});

describe("@aurix/ir lint (pure IR in)", () => {
  const base: IrGraph = {
    aurix: { version: "7.0" },
    nodes: [
      {
        id: "product@abc", entity: "product", authoredId: false, source: "server",
        fields: {}, actions: {},
      },
    ],
  };
  test("missing authored id -> E_MISSING_ID error", () => {
    const r = lintIr(base);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "E_MISSING_ID")).toBe(true);
  });
  test("suspicious action -> W_SIDE_EFFECTS_SUSPICIOUS warning", () => {
    const g: IrGraph = {
      aurix: { version: "7.0" },
      nodes: [{
        id: "order#O1", entity: "order", authoredId: true, source: "server", fields: {},
        actions: {
          confirm: {
            name: "confirm", contract: { kind: "http", method: "POST", endpoint: "/x" },
            method: "POST", endpoint: "/x", requires: [], auth: false,
            sideEffects: "none",
            preconditions: { auth: false, requires: [] },
            outputSchema: { success: {}, error: { type: "object", properties: { code: { type: "string", description: "" }, message: { type: "string" }, retriable: { type: "boolean" } }, required: ["code", "message", "retriable"] } },
          },
        },
      }],
    };
    const r = lintIr(g);
    expect(r.warnings.some((w) => w.code === "W_SIDE_EFFECTS_SUSPICIOUS")).toBe(true);
  });
});
