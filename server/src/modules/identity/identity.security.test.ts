import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Set deterministic test configuration before importing the module that validates env.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/trustsphere-security-test";
process.env.JWT_ACCESS_SECRET = "trustsphere-security-test-secret-at-least-32-characters";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const { createAccessToken, verifyAccessToken } = await import("./identity.security.js");
const subject = "64b000000000000000000001";
const secret = process.env.JWT_ACCESS_SECRET!;

test("access tokens round-trip the authenticated subject", () => {
  const token = createAccessToken(subject);
  assert.deepEqual(verifyAccessToken(token), { userId: subject });
});

test("rejects a token whose signature has been modified", () => {
  const token = createAccessToken(subject);
  const replacement = token.endsWith("a") ? "b" : "a";
  assert.throws(() => verifyAccessToken(token.slice(0, -1) + replacement));
});

test("rejects tokens issued for a different audience", () => {
  const token = jwt.sign({ sub: subject, tokenUse: "access" }, secret, {
    expiresIn: "5m",
    issuer: "trustsphere-api",
    audience: "another-client",
  });
  assert.throws(() => verifyAccessToken(token));
});

test("rejects refresh-purpose tokens presented as access tokens", () => {
  const token = jwt.sign({ sub: subject, tokenUse: "refresh" }, secret, {
    expiresIn: "5m",
    issuer: "trustsphere-api",
    audience: "trustsphere-client",
  });
  assert.throws(() => verifyAccessToken(token));
});

test("rejects expired access tokens", () => {
  const token = jwt.sign({ sub: subject, tokenUse: "access" }, secret, {
    expiresIn: -1,
    issuer: "trustsphere-api",
    audience: "trustsphere-client",
  });
  assert.throws(() => verifyAccessToken(token));
});
