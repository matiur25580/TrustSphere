import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/trustsphere-alert-test";
process.env.JWT_ACCESS_SECRET = "trustsphere-alert-test-secret-at-least-32-characters";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const { createApp } = await import("../../app.js");
const { createAccessToken } = await import("../identity/identity.security.js");
const { User, Organization, Membership } = await import("../identity/identity.models.js");
const { Incident, IncidentEvent } = await import("../incidents/incident.models.js");
const { SecurityAlert } = await import("./alert.models.js");

const database = await MongoMemoryServer.create();
const app = createApp();
let analystToken = "";
let viewerToken = "";
let outsiderToken = "";
let organizationId = "";
let otherOrganizationId = "";

before(async () => {
  await mongoose.connect(database.getUri());
  const [analyst, viewer, outsider, organization, otherOrganization] = await Promise.all([
    User.create({ name: "Alert Analyst", email: "alert-analyst@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    User.create({ name: "Alert Viewer", email: "alert-viewer@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    User.create({ name: "Other Tenant", email: "alert-outsider@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    Organization.create({ name: "Alert North", slug: "alert-north-test" }),
    Organization.create({ name: "Alert South", slug: "alert-south-test" }),
  ]);
  organizationId = String(organization._id);
  otherOrganizationId = String(otherOrganization._id);
  await Membership.insertMany([
    { userId: analyst._id, organizationId: organization._id, role: "analyst", status: "active" },
    { userId: viewer._id, organizationId: organization._id, role: "viewer", status: "active" },
    { userId: outsider._id, organizationId: otherOrganization._id, role: "owner", status: "active" },
  ]);
  analystToken = createAccessToken(String(analyst._id));
  viewerToken = createAccessToken(String(viewer._id));
  outsiderToken = createAccessToken(String(outsider._id));
  await Promise.all([User, Organization, Membership, Incident, IncidentEvent, SecurityAlert].map(model => model.init()));
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
  };
}

const alertPayload = {
  source: "siem",
  sourceEventId: "siem-event-0001",
  title: "Suspicious privileged account activity",
  description: "Multiple anomalous privileged account sign-ins were detected.",
  category: "unauthorized_access",
  severity: "p1",
};

test("alert ingestion creates a tenant-scoped incident with severity SLA targets", async () => {
  const response = await api(analystToken).post("/api/v1/alerts").send(alertPayload);
  assert.equal(response.status, 201);
  assert.equal(response.body.duplicate, false);
  assert.equal(response.body.data.alert.occurrenceCount, 1);
  assert.ok(response.body.data.alert.incidentId);
  assert.equal(response.body.data.incident.severity, "p1");
  const start = new Date(response.body.data.incident.reportedAt).getTime();
  assert.equal(new Date(response.body.data.incident.responseDueAt).getTime() - start, 15 * 60_000);
  assert.equal(new Date(response.body.data.incident.containmentDueAt).getTime() - start, 60 * 60_000);
  assert.equal(new Date(response.body.data.incident.resolutionDueAt).getTime() - start, 240 * 60_000);
  assert.equal(await Incident.countDocuments({ organizationId }), 1);
  assert.equal(await IncidentEvent.countDocuments({ organizationId, action: "created" }), 1);
});

test("duplicate source events increment the alert count without creating another incident", async () => {
  const duplicate = await api(analystToken).post("/api/v1/alerts").send(alertPayload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.data.occurrenceCount, 2);
  assert.equal(await SecurityAlert.countDocuments({ organizationId }), 1);
  assert.equal(await Incident.countDocuments({ organizationId }), 1);
});

test("alert API enforces write permission and tenant isolation", async () => {
  const viewerWrite = await api(viewerToken).post("/api/v1/alerts").send({ ...alertPayload, sourceEventId: "viewer-attempt" });
  assert.equal(viewerWrite.status, 403);

  const outsiderList = await api(outsiderToken, otherOrganizationId).get("/api/v1/alerts");
  assert.equal(outsiderList.status, 200);
  assert.equal(outsiderList.body.data.length, 0);

  const viewerList = await api(viewerToken).get("/api/v1/alerts");
  assert.equal(viewerList.status, 200);
  assert.equal(viewerList.body.data.length, 1);
});

test("alert ingestion rejects caller-supplied tenant or incident identifiers", async () => {
  const invalid = await api(analystToken).post("/api/v1/alerts").send({
    ...alertPayload,
    sourceEventId: "spoof-attempt",
    organizationId: otherOrganizationId,
    incidentId: new mongoose.Types.ObjectId().toString(),
  });
  assert.equal(invalid.status, 400);
  assert.equal(await SecurityAlert.countDocuments({ organizationId, sourceEventId: "spoof-attempt" }), 0);
});
