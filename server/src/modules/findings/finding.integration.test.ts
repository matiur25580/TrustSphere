import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/trustsphere-test";
process.env.JWT_ACCESS_SECRET = "trustsphere-integration-test-secret-at-least-32-characters";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const { createApp } = await import("../../app.js");
const { createAccessToken } = await import("../identity/identity.security.js");
const { User, Organization, Membership } = await import("../identity/identity.models.js");
const { Vendor } = await import("../vendors/vendor.models.js");
const { VendorAssessment } = await import("../assessments/assessment.models.js");
const { Finding } = await import("./finding.models.js");
const { ControlImplementation } = await import("../compliance/compliance.models.js");

const database = await MongoMemoryServer.create();
const app = createApp();
let analystToken = "";
let ownerToken = "";
let viewerToken = "";
let outsiderToken = "";
let organizationId = "";
let otherOrganizationId = "";
let assessmentId = "";
let vendorId = "";
let findingId = "";

before(async () => {
  await mongoose.connect(database.getUri());
  const [analyst, owner, viewer, outsider, organization, otherOrganization] = await Promise.all([
    User.create({ name: "Risk Analyst", email: "analyst@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    User.create({ name: "Workspace Owner", email: "owner@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    User.create({ name: "Read Only", email: "viewer@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    User.create({ name: "Other Tenant", email: "outsider@example.test", passwordHash: await bcrypt.hash("a-secure-password", 12) }),
    Organization.create({ name: "Northstar", slug: "northstar-test" }),
    Organization.create({ name: "Southstar", slug: "southstar-test" }),
  ]);
  organizationId = String(organization._id);
  otherOrganizationId = String(otherOrganization._id);
  await Membership.insertMany([
    { userId: analyst._id, organizationId: organization._id, role: "analyst", status: "active" },
    { userId: owner._id, organizationId: organization._id, role: "owner", status: "active" },
    { userId: viewer._id, organizationId: organization._id, role: "viewer", status: "active" },
    { userId: outsider._id, organizationId: otherOrganization._id, role: "owner", status: "active" },
  ]);
  analystToken = createAccessToken(String(analyst._id));
  ownerToken = createAccessToken(String(owner._id));
  viewerToken = createAccessToken(String(viewer._id));
  outsiderToken = createAccessToken(String(outsider._id));

  const vendor = await Vendor.create({
    organizationId: organization._id, createdBy: analyst._id, updatedBy: analyst._id,
    name: "Northstar Payments", normalizedName: "northstar payments", category: "Payment processor",
    criticality: "high", dataSensitivity: "confidential", accessLevel: "privileged",
    status: "active", riskScore: 77, riskBand: "high",
  });
  vendorId = String(vendor._id);
  const assessment = await VendorAssessment.create({
    organizationId: organization._id, vendorId: vendor._id, createdBy: analyst._id,
    templateId: "trustsphere-vendor-security-baseline", templateVersion: 1,
    templateSnapshot: { questions: [{ id: "iam-01", category: "Identity & access", prompt: "Is MFA enforced?", weight: 4 }] },
    title: "Northstar security assessment", status: "submitted",
    responses: [{ questionId: "iam-01", answer: "no", comment: "Privileged users do not use MFA.", evidence: [], answeredAt: new Date(), answeredBy: analyst._id }],
  });
  assessmentId = String(assessment._id);
  await Promise.all([User, Organization, Membership, Vendor, VendorAssessment, Finding, ControlImplementation].map(model => model.init()));
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
    put: (path: string) => request(app).put(path).set(headers),
  };
}

test("findings API enforces tenant boundaries, RBAC, idempotency and independent validation", async () => {
  const viewerVendorRead = await api(viewerToken).get(`/api/v1/vendors/${vendorId}`);
  assert.equal(viewerVendorRead.status, 200);
  const viewerVendorWrite = await api(viewerToken).post("/api/v1/vendors").send({});
  assert.equal(viewerVendorWrite.status, 403);
  const outsiderVendorRead = await api(outsiderToken, otherOrganizationId).get(`/api/v1/vendors/${vendorId}`);
  assert.equal(outsiderVendorRead.status, 404);

  const viewerAssessmentRead = await api(viewerToken).get(`/api/v1/assessments/${assessmentId}`);
  assert.equal(viewerAssessmentRead.status, 200);
  const outsiderAssessmentRead = await api(outsiderToken, otherOrganizationId).get(`/api/v1/assessments/${assessmentId}`);
  assert.equal(outsiderAssessmentRead.status, 404);

  const viewerRead = await api(viewerToken).get("/api/v1/findings");
  assert.equal(viewerRead.status, 200);
  assert.deepEqual(viewerRead.body.data, []);

  const viewerWrite = await api(viewerToken).post(`/api/v1/findings/from-assessment/${assessmentId}`);
  assert.equal(viewerWrite.status, 403);

  const generated = await api(analystToken).post(`/api/v1/findings/from-assessment/${assessmentId}`);
  assert.equal(generated.status, 201);
  assert.equal(generated.body.data.createdCount, 1);
  findingId = generated.body.data.findings[0]._id;

  const generatedAgain = await api(analystToken).post(`/api/v1/findings/from-assessment/${assessmentId}`);
  assert.equal(generatedAgain.status, 201);
  assert.equal(generatedAgain.body.data.createdCount, 0);
  assert.equal(await Finding.countDocuments({ organizationId, assessmentId }), 1);

  const crossTenant = await api(outsiderToken, otherOrganizationId).get(`/api/v1/findings/${findingId}`);
  assert.equal(crossTenant.status, 404);

  const incompleteSubmit = await api(analystToken).post(`/api/v1/findings/${findingId}/transition`)
    .send({ action: "submit_for_validation", resolutionNote: "Implemented MFA." });
  assert.equal(incompleteSubmit.status, 400);

  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const remediation = await api(analystToken).patch(`/api/v1/findings/${findingId}`)
    .send({ remediationPlan: "Enforce MFA for every privileged account.", remediationOwner: "Identity Engineering", dueDate });
  assert.equal(remediation.status, 200);

  const submitted = await api(analystToken).post(`/api/v1/findings/${findingId}/transition`)
    .send({ action: "submit_for_validation", resolutionNote: "MFA enforcement has been deployed." });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.status, "pending_validation");

  const selfReview = await api(analystToken).post(`/api/v1/findings/${findingId}/transition`)
    .send({ action: "validate", decision: "resolved", comment: "Self review attempt." });
  assert.equal(selfReview.status, 403);

  const validated = await api(ownerToken).post(`/api/v1/findings/${findingId}/transition`)
    .send({ action: "validate", decision: "resolved", comment: "Evidence reviewed; MFA is enforced." });
  assert.equal(validated.status, 200);
  assert.equal(validated.body.data.status, "resolved");

  const detail = await api(ownerToken).get(`/api/v1/findings/${findingId}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.events.some((entry: { action: string }) => entry.action === "created"));
  assert.ok(detail.body.data.events.some((entry: { action: string }) => entry.action === "validated"));

  const viewerFrameworks = await api(viewerToken).get("/api/v1/compliance/frameworks");
  assert.equal(viewerFrameworks.status, 200);
  assert.equal(viewerFrameworks.body.data.length, 2);
  const viewerControlWrite = await api(viewerToken).put("/api/v1/compliance/controls/access-mfa")
    .send({ status: "implemented" });
  assert.equal(viewerControlWrite.status, 403);
  const implementation = await api(analystToken).put("/api/v1/compliance/controls/access-mfa")
    .send({ status: "implemented", owner: "Identity Engineering", notes: "MFA is enforced for privileged accounts." });
  assert.equal(implementation.status, 200);
  assert.equal(implementation.body.data.status, "implemented");
  const complianceSummary = await api(analystToken).get("/api/v1/compliance/summary");
  assert.equal(complianceSummary.status, 200);
  assert.equal(complianceSummary.body.data.implemented, 1);
  const otherTenantControls = await api(outsiderToken, otherOrganizationId).get("/api/v1/compliance/controls");
  assert.equal(otherTenantControls.status, 200);
  assert.equal(otherTenantControls.body.data[0].implementation.status, "not_started");
  assert.equal(await ControlImplementation.countDocuments({ organizationId }), 1);
});
