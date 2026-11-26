import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAccessToken(userId: string) {
  return jwt.sign({ sub: userId, tokenUse: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: "trustsphere-api",
    audience: "trustsphere-client",
  });
}

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "trustsphere-api",
    audience: "trustsphere-client",
  });
  if (typeof payload === "string" || payload.tokenUse !== "access" || !payload.sub) {
    throw new Error("Invalid access token");
  }
  return { userId: payload.sub };
}

export function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
