import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { Membership, Organization, RefreshSession, User } from "./identity.models.js";
import { authenticate } from "./identity.middleware.js";
import { createAccessToken, createRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS } from "./identity.security.js";

export const identityRouter = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(120),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

function readCookie(req: Request, name: string) {
  const pair = req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(name + "="));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}
function setRefreshCookie(res: Response, token: string) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `ts_refresh=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${Math.floor(REFRESH_TOKEN_TTL_MS / 1000)}${secure}`);
}
function clearRefreshCookie(res: Response) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `ts_refresh=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0${secure}`);
}
function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.header("origin");
  if (origin && origin !== env.CLIENT_ORIGIN) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." } });
    return;
  }
  next();
}
async function issueSession(req: Request, res: Response, userId: string) {
  const refreshToken = createRefreshToken();
  await RefreshSession.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.get("user-agent")?.slice(0, 500),
    ipAddress: req.ip,
  });
  setRefreshCookie(res, refreshToken);
  return createAccessToken(userId);
}

identityRouter.post("/register", async (req, res, next) => {
  let createdUserId: unknown;
  let createdOrganizationId: unknown;
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) {
      res.status(409).json({ error: { code: "EMAIL_IN_USE", message: "An account with this email already exists." } });
      return;
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({ name: input.name, email, passwordHash });
    createdUserId = user._id;
    const baseSlug = input.organizationName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
    const organization = await Organization.create({ name: input.organizationName, slug: `${baseSlug}-${String(user._id).slice(-6)}` });
    createdOrganizationId = organization._id;
    await Membership.create({ userId: user._id, organizationId: organization._id, role: "owner", status: "active" });
    const accessToken = await issueSession(req, res, String(user._id));
    res.status(201).json({
      data: {
        accessToken,
        user: { id: String(user._id), name: user.name, email: user.email },
        organization: { id: String(organization._id), name: organization.name, slug: organization.slug, role: "owner" },
      },
    });
  } catch (error) {
    // Compensate partial provisioning if a later registration step fails.
    if (createdOrganizationId) await Organization.deleteOne({ _id: createdOrganizationId }).catch(() => undefined);
    if (createdUserId) {
      await Membership.deleteMany({ userId: createdUserId }).catch(() => undefined);
      await RefreshSession.deleteMany({ userId: createdUserId }).catch(() => undefined);
      await User.deleteOne({ _id: createdUserId }).catch(() => undefined);
    }
    next(error);
  }
});

identityRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!user || user.status !== "active" || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      return;
    }
    const accessToken = await issueSession(req, res, String(user._id));
    const memberships = await Membership.find({ userId: user._id, status: "active" }).populate("organizationId", "name slug").lean();
    res.json({
      data: {
        accessToken,
        user: { id: String(user._id), name: user.name, email: user.email },
        organizations: memberships.map((membership: any) => ({
          id: String(membership.organizationId._id),
          name: membership.organizationId.name,
          slug: membership.organizationId.slug,
          role: membership.role,
        })),
      },
    });
  } catch (error) { next(error); }
});

identityRouter.post("/refresh", requireTrustedOrigin, async (req, res, next) => {
  try {
    const rawToken = readCookie(req, "ts_refresh");
    if (!rawToken) {
      res.status(401).json({ error: { code: "REFRESH_REQUIRED", message: "A valid refresh session is required." } });
      return;
    }
    const tokenHash = hashToken(rawToken);
    const session = await RefreshSession.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } }).select("+tokenHash");
    if (!session) {
      clearRefreshCookie(res);
      res.status(401).json({ error: { code: "REFRESH_INVALID", message: "Refresh session is invalid or expired." } });
      return;
    }
    session.revokedAt = new Date();
    await session.save();
    const user = await User.findOne({ _id: session.userId, status: "active" });
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable." } });
      return;
    }
    const accessToken = await issueSession(req, res, String(user._id));
    res.json({ data: { accessToken } });
  } catch (error) { next(error); }
});

identityRouter.post("/logout", requireTrustedOrigin, async (req, res, next) => {
  try {
    const rawToken = readCookie(req, "ts_refresh");
    if (rawToken) await RefreshSession.updateOne({ tokenHash: hashToken(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

identityRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth!.userId).select("name email status");
    if (!user || user.status !== "active") {
      res.status(401).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable." } });
      return;
    }
    const memberships = await Membership.find({ userId: user._id, status: "active" }).populate("organizationId", "name slug").lean();
    res.json({ data: {
      user: { id: String(user._id), name: user.name, email: user.email },
      organizations: memberships.map((membership: any) => ({
        id: String(membership.organizationId._id), name: membership.organizationId.name,
        slug: membership.organizationId.slug, role: membership.role,
      })),
    } });
  } catch (error) { next(error); }
});
