import { expandHtmlServerSide, serializeGraphJson } from "../src/core/expander";
import { resolveKeyConfig, signGraphJws, verifyGraphJws, generateKeyPair } from "../src/server/signature";
import { exportJWK } from "jose";

test("graph serialization escapes script-context breakout characters", () => {
  const out = serializeGraphJson({ evil: "</script><img src=x onerror=alert(1)>" });
  expect(out).not.toContain("</script>");
  expect(out).not.toContain("<img");
  expect(out).toContain("\\u003c");
});

test("malicious field text cannot break out of the aurix-graph script tag", () => {
  const html = `<body><section ix="productDetails.product#SKU"><h1 ix="name">evil</script><img src=x onerror=alert(1)>rest</h1></section></body>`;
  const { html: out } = expandHtmlServerSide(html);
  // Isolate the graph script's inner JSON.
  const open = out.indexOf('type="application/aurix+json">') + 'type="application/aurix+json">'.length;
  const close = out.indexOf("</script>", open);
  const graphJson = out.slice(open, close);
  // No raw angle brackets may survive inside the script body — all escaped to \\u003c / \\u003e.
  expect(graphJson).not.toMatch(/[<>]/);
  // And it must still be valid JSON (escapes are legal JSON string content).
  expect(() => JSON.parse(graphJson)).not.toThrow();
});

// ---------------------------------------------------------------------------
// Fix 4: resolveKeyConfig — fail-loud key handling
// ---------------------------------------------------------------------------
describe("resolveKeyConfig", () => {
  test("malformed JWK JSON throws with actionable message (does NOT silently sign)", () => {
    expect(() => resolveKeyConfig('{"kty": "oct" BROKEN')).toThrow(
      "AURIX_SIGNING_KEY looks like a JWK but is not valid JSON"
    );
  });

  test("JWK without kty throws", () => {
    expect(() => resolveKeyConfig('{"k": "abc"}')).toThrow("missing required field 'kty'");
  });

  test("plain secret shorter than 32 chars throws", () => {
    expect(() => resolveKeyConfig("tooshort")).toThrow("at least 32 characters");
  });

  test("plain secret of exactly 32 chars is accepted", () => {
    const result = resolveKeyConfig("a".repeat(32));
    expect(result.alg).toBe("HS256");
    expect(result.jwk.kty).toBe("oct");
    // base64url — must not contain '+' or '/'
    expect(result.jwk.k).not.toMatch(/[+/]/);
  });

  test("valid oct JWK resolves to HS256", () => {
    const raw = JSON.stringify({ kty: "oct", k: Buffer.from("a".repeat(32)).toString("base64url") });
    const result = resolveKeyConfig(raw);
    expect(result.alg).toBe("HS256");
  });
});

// ---------------------------------------------------------------------------
// Fix 4: sign/verify round-trips
// ---------------------------------------------------------------------------
const GRAPH_OBJ = { aurix: { version: "6.0" }, nodes: [] };
const savedKey = process.env.AURIX_SIGNING_KEY;

afterEach(() => {
  if (savedKey === undefined) delete process.env.AURIX_SIGNING_KEY;
  else process.env.AURIX_SIGNING_KEY = savedKey;
});

test("valid plain 32-char HMAC secret: sign+verify round-trip", async () => {
  process.env.AURIX_SIGNING_KEY = "test-secret-aurix-exactly-32chars!!";
  const jws = await signGraphJws(GRAPH_OBJ);
  const payload = await verifyGraphJws(jws);
  expect((payload as any).graph).toEqual(GRAPH_OBJ);
});

test("valid oct JWK: sign+verify round-trip", async () => {
  const jwk = { kty: "oct", k: Buffer.from("test-secret-aurix-exactly-32chars!!").toString("base64url") };
  process.env.AURIX_SIGNING_KEY = JSON.stringify(jwk);
  const jws = await signGraphJws(GRAPH_OBJ);
  const payload = await verifyGraphJws(jws);
  expect((payload as any).graph).toEqual(GRAPH_OBJ);
});

test("EdDSA JWK (Ed25519): sign+verify round-trip", async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const privateJwk = await exportJWK(privateKey);
  process.env.AURIX_SIGNING_KEY = JSON.stringify(privateJwk);
  const jws = await signGraphJws(GRAPH_OBJ);

  // Verify using the public key directly (simulating remote verification).
  const { importJWK, jwtVerify } = await import("jose");
  const pubKey = await importJWK(await exportJWK(publicKey), "EdDSA");
  const { payload } = await jwtVerify(jws, pubKey, { algorithms: ["EdDSA"] });
  expect((payload as any).graph).toEqual(GRAPH_OBJ);
});

test("HS256 token must fail when config says EdDSA (algorithm pinning)", async () => {
  // Sign with HMAC.
  process.env.AURIX_SIGNING_KEY = "test-secret-aurix-exactly-32chars!!";
  const jws = await signGraphJws(GRAPH_OBJ);

  // Swap key to an EdDSA JWK — verification must fail.
  const { privateKey } = await generateKeyPair("EdDSA");
  const privateJwk = await exportJWK(privateKey);
  process.env.AURIX_SIGNING_KEY = JSON.stringify(privateJwk);

  await expect(verifyGraphJws(jws)).rejects.toThrow();
});


