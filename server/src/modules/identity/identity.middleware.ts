import type { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Membership, Organization } from "./identity.models.js";
import { verifyAccessToken } from "./identity.security.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
      tenant?: { organizationId: string; role: string };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Your access token is invalid or expired." } });
  }
}

export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = req.header("x-organization-id");
    if (!organizationId || !req.auth?.userId) {
      res.status(400).json({ error: { code: "ORGANIZATION_REQUIRED", message: "Select an organization to continue." } });
      return;
    }
    if (!isValidObjectId(organizationId)) {
      res.status(400).json({ error: { code: "INVALID_ORGANIZATION_ID", message: "The selected organization identifier is invalid." } });
      return;
    }
    const [membership, organization]: [any, any] = await Promise.all([
      Membership.findOne({ userId: req.auth.userId, organizationId, status: "active" }).lean(),
      Organization.findOne({ _id: organizationId, status: "active" }).select("_id").lean(),
    ]);
    if (!membership || !organization) {
      res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "You do not have access to this organization." } });
      return;
    }
    req.tenant = { organizationId: String(organization._id), role: membership.role };
    next();
  } catch (error) {
    next(error);
  }
}

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  admin: ["users:read", "users:manage", "vendors:read", "vendors:write", "risk:read", "risk:write", "compliance:read", "compliance:write", "reports:read", "security:read", "security:write"],
  analyst: ["vendors:read", "vendors:write", "risk:read", "risk:write", "compliance:read", "compliance:write", "reports:read", "security:read", "security:write"],
  viewer: ["vendors:read", "risk:read", "compliance:read", "reports:read", "security:read"],
};

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.tenant ? rolePermissions[req.tenant.role] ?? [] : [];
    if (!permissions.includes("*") && !permissions.includes(permission)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
      return;
    }
    next();
  };
}
