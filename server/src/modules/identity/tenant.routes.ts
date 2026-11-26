import { Router } from "express";
import { authenticate, requirePermission, requireTenant } from "./identity.middleware.js";

export const tenantRouter = Router();
tenantRouter.use(authenticate, requireTenant);

tenantRouter.get("/context", requirePermission("vendors:read"), (req, res) => {
  res.json({ data: { organizationId: req.tenant!.organizationId, role: req.tenant!.role } });
});
