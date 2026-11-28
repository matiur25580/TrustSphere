import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { SecurityNotification } from "./notification.models.js";

export const notificationRouter = Router();
notificationRouter.use(authenticate, requireTenant);

notificationRouter.get("/", requirePermission("security:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const filter = { organizationId: req.tenant!.organizationId, recipientId: req.auth!.userId };
    const [items, total, unread] = await Promise.all([
      SecurityNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SecurityNotification.countDocuments(filter),
      SecurityNotification.countDocuments({ ...filter, readAt: null }),
    ]);
    res.json({ data: items, meta: { page, limit, total, unread, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

notificationRouter.patch("/:id/read", requirePermission("security:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification not found." } });
      return;
    }
    const notification = await SecurityNotification.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.tenant!.organizationId, recipientId: req.auth!.userId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean();
    if (!notification) {
      res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification not found." } });
      return;
    }
    res.json({ data: notification });
  } catch (error) { next(error); }
});

notificationRouter.post("/read-all", requirePermission("security:read"), async (req, res, next) => {
  try {
    const result = await SecurityNotification.updateMany(
      { organizationId: req.tenant!.organizationId, recipientId: req.auth!.userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ data: { updated: result.modifiedCount } });
  } catch (error) { next(error); }
});
