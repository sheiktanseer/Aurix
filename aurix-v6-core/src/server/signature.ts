import { importJWK, SignJWT, jwtVerify, createRemoteJWKSet, generateKeyPair as joseGenerateKeyPair } from "jose";
import type { JWK } from "jose";
import { createHash } from "node:crypto";


/**
 * Resolves a raw key string into a JWK + algorithm pair.
 *
 * Two modes:
 * 1. JSON object (starts with `{`) → parsed as a JWK.  Errors thrown
 *    immediately with actionable messages; no silent fallback.
 * 2. Plain string → treated as an intentional HMAC secret.  Must be ≥32
 *    characters; encoded as base64url per RFC 7515 §6.4.
 */
export function resolveKeyConfig(raw: string): { jwk: JWK; alg: "HS256" | "EdDSA" | "RS256" } {
  if (raw.trim().startsWith("{")) {
    let jwk: JWK;
    try {
      jwk = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        "AURIX_SIGNING_KEY looks like a JWK but is not valid JSON: " +
          (e as Error).message
      );
    }
    if (!jwk.kty) {
      throw new Error("AURIX_SIGNING_KEY JWK missing required field 'kty'");
    }
    const alg: "HS256" | "EdDSA" | "RS256" =
      jwk.kty === "oct" ? "HS256" : jwk.crv ? "EdDSA" : "RS256";
    return { jwk, alg };
  }

  // Plain string → intentional HMAC secret.
  if (raw.length < 32) {
    throw new Error(
      `AURIX_SIGNING_KEY HMAC secret must be at least 32 characters (got ${raw.length})`
    );
  }
  // RFC 7515 §6.4: the `k` parameter is base64url-encoded.
  return {
    jwk: { kty: "oct", k: Buffer.from(raw).toString("base64url") },
    alg: "HS256",
  };
}

// ---------------------------------------------------------------------------
// Full-payload sign / verify  (kept for backward-compat; marked @deprecated)
// ---------------------------------------------------------------------------




/**
 * Signs a graph object as a JWT payload.
 * @deprecated Use {@link signGraphDetached} for canonical detached signing.
 */
export async function signGraphJws(graph: object, kid?: string): Promise<string> {
  const AURIX_KEY = process.env.AURIX_SIGNING_KEY || "";
  if (!AURIX_KEY) throw new Error("AURIX_SIGNING_KEY not set");
  const { jwk, alg } = resolveKeyConfig(AURIX_KEY);
  const key = await importJWK(jwk, alg);
  return new SignJWT({ graph })
    .setProtectedHeader({ alg, kid: kid || (jwk as any).kid || "aurix-key" })
    .setIssuedAt()
    .sign(key);
}

/**
 * Verifies a graph JWS, optionally against a remote JWKS.
 * @deprecated Use {@link verifyGraphDetached} for canonical detached verification.
 */
export async function verifyGraphJws(jws: string, jwksUri?: string): Promise<object> {
  if (jwksUri) {
    // Remote JWKS is only meaningful for asymmetric keys; never accept HMAC here.
    const JWKS = createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jwtVerify(jws, JWKS, {
      algorithms: ["RS256", "EdDSA", "ES256"],
    });
    return payload;
  }
  const envKey = process.env.AURIX_SIGNING_KEY;
  if (!envKey) throw new Error("No verification key available");
  const { jwk, alg } = resolveKeyConfig(envKey);
  const key = await importJWK(jwk, alg);
  return (await jwtVerify(jws, key, { algorithms: [alg] })).payload;
}

// ---------------------------------------------------------------------------
// Detached signing (Fix 5)
// ---------------------------------------------------------------------------

/** Computes the hex-encoded SHA-256 digest of a UTF-8 string. */
export function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Signs a detached JWS whose payload is the SHA-256 digest of the canonical
 * JSON serialization of `graph`.  The graph itself is never embedded in the
 * token — only the digest is.
 *
 * Payload: `{ g: "<sha256hex>", v: "6.0", iat: <unix> }`
 */
export async function signGraphDetached(graph: object, kid?: string): Promise<string> {
  const AURIX_KEY = process.env.AURIX_SIGNING_KEY || "";
  if (!AURIX_KEY) throw new Error("AURIX_SIGNING_KEY not set");
  const { jwk, alg } = resolveKeyConfig(AURIX_KEY);
  const key = await importJWK(jwk, alg);
  const { canonicalJson } = await import("../core/canonical");
  const digest = sha256hex(canonicalJson(graph));
  return new SignJWT({ g: digest, v: "6.0" })
    .setProtectedHeader({ alg, kid: kid || (jwk as any).kid || "aurix-key" })
    .setIssuedAt()
    .sign(key);
}

/**
 * Verifies a detached JWS by recomputing the canonical-JSON digest of
 * `graph` and comparing it to the `g` claim in the token.
 *
 * Throws if the signature is invalid, the digest mismatches, or the token
 * is malformed.
 */
export async function verifyGraphDetached(jws: string, graph: object): Promise<void> {
  const envKey = process.env.AURIX_SIGNING_KEY;
  if (!envKey) throw new Error("No verification key available");
  const { jwk, alg } = resolveKeyConfig(envKey);
  const key = await importJWK(jwk, alg);
  const { payload } = await jwtVerify(jws, key, { algorithms: [alg] });
  const { canonicalJson } = await import("../core/canonical");
  const expected = sha256hex(canonicalJson(graph));
  if ((payload as any).g !== expected) {
    throw new Error("Graph digest mismatch: the graph has been mutated or the wrong graph was provided");
  }
}

// Re-export generateKeyPair so tests can call it without importing jose directly.
export { joseGenerateKeyPair as generateKeyPair };
