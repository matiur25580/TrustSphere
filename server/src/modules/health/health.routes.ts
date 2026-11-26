import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const databaseState = mongoose.connection.readyState;
  const databaseConnected = databaseState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    service: "trustsphere-api",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: databaseConnected ? "connected" : "disconnected",
    },
  });
});
