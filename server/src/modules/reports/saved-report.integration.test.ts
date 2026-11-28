import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/trustsphere-saved-reports-test";
process.env.JWT_ACCESS_SECRET = "trustsphere-saved-report-test-secret-at-least-32-characters";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const { createApp } = await import("../../app.js");
const { createAccessToken } = await import("../identity/identity.security.js");
const { User, Organization, Membership } = await import("../identity/identity.models.js");
const { SavedReport } = await import("./saved-report.models.js");
const { SavedReportDelivery } = await import("./saved-report-delivery.models.js");

const database = await MongoMemoryServer.create();
const app = createApp();
let ownerToken = "";
let adminToken = "";
let analystToken = "";
let viewerToken = "";
let outsiderToken = "";
let organizationId = "";
let otherOrganizationId = "";

before(async () => {
  await mongoose.connect(database.getUri());
  const [owner, admin, analyst, viewer, outsider, organization, otherOrganization] = await Promise.all([
    User.create({ name: "Owner", email: "owner@saved.test", passwordHash: await bcrypt.hash("secure-password", 4) }),
    User.create({ name: "Admin", email: "admin@saved.test", passwordHash: await bcrypt.hash("secure-password", 4) }),
    User.create({ name: "Analyst", email: "analyst@saved.test", passwordHash: await bcrypt.hash("secure-password", 4) }),
    User.create({ name: "Viewer", email: "viewer@saved.test", passwordHash: await bcrypt.hash("secure-password", 4) }),
    User.create({ name: "Outsider", email: "outsider@saved.test", passwordHash: await bcrypt.hash("secure-password", 4) }),
    Organization.create({ name: "Saved Reports Org", slug: "saved-reports-org" }),
    Organization.create({ name: "Other Saved Reports Org", slug: "other-saved-reports-org" }),
  ]);
  organizationId = String(organization._id);
  otherOrganizationId = String(otherOrganization._id);
  await Membership.insertMany([
    { userId: owner._id, organizationId: organization._id, role: "owner", status: "active" },
    { userId: admin._id, organizationId: organization._id, role: "admin", status: "active" },
    { userId: analyst._id, organizationId: organization._id, role: "analyst", status: "active" },
    { userId: viewer._id, organizationId: organization._id, role: "viewer", status: "active" },
    { userId: outsider._id, organizationId: otherOrganization._id, role: "owner", status: "active" },
  ]);
  ownerToken = createAccessToken(String(owner._id));
  adminToken = createAccessToken(String(admin._id));
  analystToken = createAccessToken(String(analyst._id));
  viewerToken = createAccessToken(String(viewer._id));
  outsiderToken = createAccessToken(String(outsider._id));
  await Promise.all([User, Organization, Membership, SavedReport, SavedReportDelivery].map(model => model.init()));
});

after(async () => {
  await mongoose.disconnect();
  await database.stop();
});

function api(token: string, tenant = organizationId) {
  const headers = { Authorization: `Bearer ${token}`, "x-organization-id": tenant };
  return {
    get: (path: string) => request(app).get(path).set(headers),
    post: (path: string) => request(app).post(path).set(headers),
    patch: (path: string) => request(app).patch(path).set(headers),
    delete: (path: string) => request(app).delete(path).set(headers),
  };
}

test("saved report definitions enforce tenant scope, permissions and schedule validation", async () => {
  const create = await api(adminToken).post("/api/v1/reports/saved").send({
    name: "Monthly vendor risk pack",
    description: "Leadership risk summary",
    range: "90d",
    format: "csv",
    recipients: ["risk@example.test", "RISK@example.test"],
    schedule: { frequency: "monthly", dayOfMonth: 15, dayOfWeek: null, localTime: "08:30", timeZone: "Asia/Kolkata" },
  });
  assert.equal(create.status, 201);
  const savedId = create.body.data._id as string;
  assert.deepEqual(create.body.data.recipients, ["risk@example.test"]);
  assert.equal(create.body.data.organizationId, organizationId);

  const viewerList = await api(viewerToken).get("/api/v1/reports/saved");
  assert.equal(viewerList.status, 200);
  assert.equal(viewerList.body.data.length, 1);

  const analystWrite = await api(analystToken).post("/api/v1/reports/saved").send({ name: "Not allowed" });
  assert.equal(analystWrite.status, 403);

  const invalidSchedule = await api(ownerToken).post("/api/v1/reports/saved").send({
    name: "Invalid weekly report",
    schedule: { frequency: "weekly", dayOfWeek: null, dayOfMonth: null, localTime: "09:00", timeZone: "Not/AZone" },
  });
  assert.equal(invalidSchedule.status, 400);

  const missingRecipients = await api(ownerToken).post("/api/v1/reports/saved").send({
    name: "No recipient schedule",
    schedule: { frequency: "weekly", dayOfWeek: 1, dayOfMonth: null, localTime: "09:00", timeZone: "Asia/Kolkata" },
  });
  assert.equal(missingRecipients.status, 400);
  assert.equal(missingRecipients.body.error.code, "SCHEDULE_RECIPIENTS_REQUIRED");

  await SavedReportDelivery.create({
    organizationId,
    savedReportId: savedId,
    savedReportName: "Monthly vendor risk pack",
    idempotencyKey: "test-org:test-report:delivery-1",
    status: "sent",
    format: "csv",
    range: "90d",
    recipients: ["risk@example.test"],
    attempts: 1,
    scheduledFor: new Date(),
    completedAt: new Date(),
  });
  const history = await api(viewerToken).get(`/api/v1/reports/saved/${savedId}/deliveries`);
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].status, "sent");
  const crossTenantHistory = await api(outsiderToken, otherOrganizationId).get(`/api/v1/reports/saved/${savedId}/deliveries`);
  assert.equal(crossTenantHistory.status, 404);

  const outsiderRead = await api(outsiderToken, otherOrganizationId).get("/api/v1/reports/saved");
  assert.equal(outsiderRead.status, 200);
  assert.deepEqual(outsiderRead.body.data, []);

  const update = await api(ownerToken).patch(`/api/v1/reports/saved/${savedId}`).send({ enabled: false });
  assert.equal(update.status, 200);
  assert.equal(update.body.data.enabled, false);

  const removed = await api(adminToken).delete(`/api/v1/reports/saved/${savedId}`);
  assert.equal(removed.status, 204);
  const listAfterArchive = await api(ownerToken).get("/api/v1/reports/saved");
  assert.deepEqual(listAfterArchive.body.data, []);
});
