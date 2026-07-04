import { importJWK, SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import type { JWK } from "jose";

const AURIX_KEY = process.env.AURIX_SIGNING_KEY || "";

export async function signGraphJws(graph: object, kid?: string) {
  if (!AURIX_KEY) throw new Error("AURIX_SIGNING_KEY not set");
  try {
    const jwkObj: JWK = typeof AURIX_KEY === "string" && AURIX_KEY.startsWith("{") ? JSON.parse(AURIX_KEY) : null;
    if (jwkObj) {
      const alg = jwkObj.kty === "oct" ? "HS256" : (jwkObj.crv ? "EdDSA" : "RS256");
      const key = await importJWK(jwkObj, alg);
      const jwt = await new SignJWT({ graph })
        .setProtectedHeader({ alg, kid: kid || jwkObj.kid })
        .setIssuedAt()
        .sign(key);
      return jwt;
    }
  } catch (e) {
    // fallback to HMAC below
  }
  const jwk = { kty: "oct", k: Buffer.from(AURIX_KEY).toString("base64") };
  const key = await importJWK(jwk as any, "HS256");
  const jwt = await new SignJWT({ graph }).setProtectedHeader({ alg: "HS256", kid: kid || "aurix-hmac" }).setIssuedAt().sign(key);
  return jwt;
}

// Returns the single JWS algorithm implied by a JWK, matching signGraphJws.
function algForJwk(jwkObj: JWK): "HS256" | "EdDSA" | "RS256" {
  return jwkObj.kty === "oct" ? "HS256" : (jwkObj.crv ? "EdDSA" : "RS256");
}

export async function verifyGraphJws(jws: string, jwksUri?: string) {
  if (jwksUri) {
    // Remote JWKS is only meaningful for asymmetric keys; never accept HMAC here.
    const JWKS = createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jwtVerify(jws, JWKS, { algorithms: ["RS256", "EdDSA", "ES256"] });
    return payload;
  }
  if (process.env.AURIX_SIGNING_KEY) {
    const jwkObj = typeof process.env.AURIX_SIGNING_KEY === "string" && process.env.AURIX_SIGNING_KEY.startsWith("{") ? JSON.parse(process.env.AURIX_SIGNING_KEY) : null;
    if (jwkObj) {
      const alg = algForJwk(jwkObj as JWK);
      const key = await importJWK(jwkObj as JWK, alg);
      return (await jwtVerify(jws, key, { algorithms: [alg] })).payload;
    } else {
      const jwk = { kty: "oct", k: Buffer.from(process.env.AURIX_SIGNING_KEY).toString("base64") };
      const key2 = await importJWK(jwk as any, "HS256");
      return (await jwtVerify(jws, key2, { algorithms: ["HS256"] })).payload;
    }
  }
  throw new Error("No verification key available");
}
