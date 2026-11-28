import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { identityRouter } from "./modules/identity/identity.routes.js";
import { tenantRouter } from "./modules/identity/tenant.routes.js";
import { vendorRouter } from "./modules/vendors/vendor.routes.js";
import { assessmentRouter } from "./modules/assessments/assessment.routes.js";
import { findingRouter } from "./modules/findings/finding.routes.js";
import { complianceRouter } from "./modules/compliance/compliance.routes.js";
import { evidenceRouter } from "./modules/compliance/evidence.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { savedReportRouter } from "./modules/reports/saved-report.routes.js";
import { incidentRouter } from "./modules/incidents/incident.routes.js";
import { alertRouter } from "./modules/alerts/alert.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { escalationRouter } from "./modules/escalations/escalation.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }));

  app.get("/", (_req, res) => {
    res.json({ name: "TrustSphere API", version: "v1" });
  });

  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts. Please try again later." } },
  }));
  app.use("/api/v1/auth", identityRouter);
  app.use("/api/v1/tenant", tenantRouter);
  app.use("/api/v1/vendors", vendorRouter);
  app.use("/api/v1/assessments", assessmentRouter);
  app.use("/api/v1/findings", findingRouter);
  app.use("/api/v1/compliance", complianceRouter);
  app.use("/api/v1/compliance/evidence", evidenceRouter);
  app.use("/api/v1/reports", reportRouter);
  app.use("/api/v1/reports/saved", savedReportRouter);
  app.use("/api/v1/incidents", incidentRouter);
  app.use("/api/v1/alerts", alertRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/escalations", escalationRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
