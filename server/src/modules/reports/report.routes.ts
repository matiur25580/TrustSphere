import { Router } from "express";
import { Types } from "mongoose";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Vendor } from "../vendors/vendor.models.js";
import { VendorAssessment } from "../assessments/assessment.models.js";
import { Finding } from "../findings/finding.models.js";
import { ControlImplementation } from "../compliance/compliance.models.js";
import { ComplianceEvidence } from "../compliance/evidence.models.js";

export const reportRouter = Router();
reportRouter.use(authenticate, requireTenant, requirePermission("reports:read"));

const CONTROL_CATALOG_SIZE = 10;
const ranges = { "7d": 7, "30d": 30, "90d": 90 } as const;
type ReportRange = keyof typeof ranges;
type TrendRow = { _id: string; count: number };

function selectedRange(value: unknown): ReportRange {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ranges, value) ? value as ReportRange : "30d";
}
function mergeTrendRows(vendors: TrendRow[], assessments: TrendRow[], findings: TrendRow[]) {
  const days = new Map<string, { date: string; vendors: number; assessments: number; findings: number }>();
  for (const row of vendors) days.set(row._id, { date: row._id, vendors: row.count, assessments: 0, findings: 0 });
  for (const row of assessments) {
    const item = days.get(row._id) ?? { date: row._id, vendors: 0, assessments: 0, findings: 0 };
    item.assessments = row.count; days.set(row._id, item);
  }
  for (const row of findings) {
    const item = days.get(row._id) ?? { date: row._id, vendors: 0, assessments: 0, findings: 0 };
    item.findings = row.count; days.set(row._id, item);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function buildReport(organizationId: string, range: ReportRange) {
  const organization = new Types.ObjectId(organizationId);
  const generatedAt = new Date();
  const startDate = new Date(generatedAt.getTime() - ranges[range] * 24 * 60 * 60 * 1000);
  const createdInRange = { $gte: startDate, $lte: generatedAt };
  const activeFindingStatuses = ["open", "in_progress", "pending_validation"];

  const [
    vendorRows, vendorBands, assessmentRows, assessmentBands, findingRows, findingSeverities, findingStatuses,
    complianceRows, evidenceRows, vendorTrend, assessmentTrend, findingTrend,
    overdueFindings, submittedAssessments, pendingEvidence,
  ] = await Promise.all([
    Vendor.aggregate([
      { $match: { organizationId: organization, archivedAt: null, createdAt: createdInRange } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }, highRisk: { $sum: { $cond: [{ $in: ["$riskBand", ["high", "critical"]] }, 1, 0] } }, averageRisk: { $avg: "$riskScore" } } },
    ]),
    Vendor.aggregate([
      { $match: { organizationId: organization, archivedAt: null, createdAt: createdInRange } },
      { $group: { _id: "$riskBand", count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]),
    VendorAssessment.aggregate([
      { $match: { organizationId: organization, createdAt: createdInRange } },
      { $group: { _id: null, total: { $sum: 1 }, inProgress: { $sum: { $cond: [{ $in: ["$status", ["draft", "in_progress"]] }, 1, 0] } }, awaitingReview: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } }, approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, averageRisk: { $avg: "$riskScore" } } },
    ]),
    VendorAssessment.aggregate([
      { $match: { organizationId: organization, createdAt: createdInRange, riskBand: { $ne: null } } },
      { $group: { _id: "$riskBand", count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]),
    Finding.aggregate([
      { $match: { organizationId: organization, createdAt: createdInRange } },
      { $group: { _id: null, total: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ["$status", activeFindingStatuses] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $in: ["$status", activeFindingStatuses] }, { $ne: ["$dueDate", null] }, { $lt: ["$dueDate", generatedAt] }] }, 1, 0] } }, critical: { $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] } }, resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } }, accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } } } },
    ]),
    Finding.aggregate([
      { $match: { organizationId: organization, createdAt: createdInRange } },
      { $group: { _id: "$severity", count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]),
    Finding.aggregate([
      { $match: { organizationId: organization, createdAt: createdInRange } },
      { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]),
    ControlImplementation.aggregate([
      { $match: { organizationId: organization } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ComplianceEvidence.aggregate([
      { $match: { organizationId: organization } },
      { $group: { _id: null,
        pendingReview: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "pending_review"] }, { $gt: ["$expiresAt", generatedAt] }] }, 1, { $cond: [{ $and: [{ $eq: ["$status", "pending_review"] }, { $eq: ["$expiresAt", null] }] }, 1, 0] }] } },
        approved: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "approved"] }, { $or: [{ $eq: ["$expiresAt", null] }, { $gt: ["$expiresAt", generatedAt] }] }] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $or: [{ $eq: ["$status", "expired"] }, { $and: [{ $ne: ["$expiresAt", null] }, { $lte: ["$expiresAt", generatedAt] }] }] }, 1, 0] } },
        expiringSoon: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "approved"] }, { $gt: ["$expiresAt", generatedAt] }, { $lte: ["$expiresAt", new Date(generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000)] }] }, 1, 0] } },
      } },
    ]),
    Vendor.aggregate([{ $match: { organizationId: organization, archivedAt: null, createdAt: createdInRange } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }]),
    VendorAssessment.aggregate([{ $match: { organizationId: organization, createdAt: createdInRange } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }]),
    Finding.aggregate([{ $match: { organizationId: organization, createdAt: createdInRange } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }]),
    Finding.find({ organizationId: organization, status: { $in: activeFindingStatuses }, dueDate: { $lt: generatedAt } }).sort({ dueDate: 1 }).limit(6).populate("vendorId", "name").select("title severity priority status dueDate vendorId").lean(),
    VendorAssessment.find({ organizationId: organization, status: "submitted" }).sort({ submittedAt: 1 }).limit(5).populate("vendorId", "name").select("title submittedAt vendorId").lean(),
    ComplianceEvidence.find({ organizationId: organization, status: "pending_review", $or: [{ expiresAt: null }, { expiresAt: { $gt: generatedAt } }] }).sort({ createdAt: 1 }).limit(5).select("fileName controlId createdAt expiresAt").lean(),
  ]);

  const vendor = vendorRows[0] ?? { total: 0, active: 0, highRisk: 0, averageRisk: null };
  const assessment = assessmentRows[0] ?? { total: 0, inProgress: 0, awaitingReview: 0, approved: 0, averageRisk: null };
  const finding = findingRows[0] ?? { total: 0, open: 0, overdue: 0, critical: 0, resolved: 0, accepted: 0 };
  const controls = { not_started: 0, in_progress: 0, implemented: 0, not_applicable: 0 };
  for (const row of complianceRows) if (row._id in controls) controls[row._id as keyof typeof controls] = row.count;
  controls.not_started = Math.max(0, CONTROL_CATALOG_SIZE - controls.in_progress - controls.implemented - controls.not_applicable);
  const applicableControls = CONTROL_CATALOG_SIZE - controls.not_applicable;
  const evidence = evidenceRows[0] ?? { pendingReview: 0, approved: 0, rejected: 0, expired: 0, expiringSoon: 0 };
  return {
    meta: { range, startDate, endDate: generatedAt, generatedAt, catalogVersion: "trustsphere-control-catalog-v1" },
    summary: {
      vendorsCreated: vendor.total, activeVendorsCreated: vendor.active, highRiskVendors: vendor.highRisk, averageVendorRisk: vendor.averageRisk === null ? null : Math.round(vendor.averageRisk),
      assessmentsCreated: assessment.total, assessmentsInProgress: assessment.inProgress, assessmentsAwaitingReview: assessment.awaitingReview, assessmentsApproved: assessment.approved, averageAssessmentRisk: assessment.averageRisk === null ? null : Math.round(assessment.averageRisk),
      findingsCreated: finding.total, openFindings: finding.open, overdueFindings: finding.overdue, criticalFindings: finding.critical, resolvedFindings: finding.resolved, acceptedFindings: finding.accepted,
      controlCoveragePercent: applicableControls ? Math.round(controls.implemented / applicableControls * 100) : 0,
      controlsImplemented: controls.implemented, controlsInProgress: controls.in_progress, controlsNotStarted: controls.not_started, controlsNotApplicable: controls.not_applicable, totalControls: CONTROL_CATALOG_SIZE,
      evidencePendingReview: evidence.pendingReview, evidenceApproved: evidence.approved, evidenceRejected: evidence.rejected, evidenceExpired: evidence.expired, evidenceExpiringSoon: evidence.expiringSoon,
    },
    distributions: {
      vendorRisk: vendorBands.map(row => ({ label: row._id, count: row.count })),
      assessmentRisk: assessmentBands.map(row => ({ label: row._id, count: row.count })),
      findingSeverity: findingSeverities.map(row => ({ label: row._id, count: row.count })),
      findingStatus: findingStatuses.map(row => ({ label: row._id, count: row.count })),
      controlStatus: Object.entries(controls).map(([label, count]) => ({ label, count })),
      evidenceStatus: [{ label: "pending_review", count: evidence.pendingReview }, { label: "approved", count: evidence.approved }, { label: "rejected", count: evidence.rejected }, { label: "expired", count: evidence.expired }],
    },
    trend: mergeTrendRows(vendorTrend, assessmentTrend, findingTrend),
    attention: {
      overdueFindings: overdueFindings.map(item => ({ id: String(item._id), title: item.title, severity: item.severity, priority: item.priority, status: item.status, dueDate: item.dueDate, vendorName: typeof item.vendorId === "object" && item.vendorId ? (item.vendorId as { name?: string }).name ?? "Vendor" : "Vendor" })),
      assessmentsAwaitingReview: submittedAssessments.map(item => ({ id: String(item._id), title: item.title, submittedAt: item.submittedAt, vendorName: typeof item.vendorId === "object" && item.vendorId ? (item.vendorId as { name?: string }).name ?? "Vendor" : "Vendor" })),
      evidenceAwaitingReview: pendingEvidence.map(item => ({ id: String(item._id), fileName: item.fileName, controlId: item.controlId, createdAt: item.createdAt })),
    },
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

reportRouter.get("/overview", async (req, res, next) => {
  try {
    const range = selectedRange(req.query.range);
    res.json({ data: await buildReport(req.tenant!.organizationId, range) });
  } catch (error) { next(error); }
});

reportRouter.get("/export.csv", async (req, res, next) => {
  try {
    const range = selectedRange(req.query.range);
    const report = await buildReport(req.tenant!.organizationId, range);
    const rows: unknown[][] = [["Section", "Metric", "Value"]];
    for (const [key, value] of Object.entries(report.summary)) rows.push(["Summary", key, value]);
    for (const [section, values] of Object.entries(report.distributions)) for (const item of values) rows.push([section, item.label, item.count]);
    for (const item of report.trend) rows.push(["Daily trend", item.date, `vendors=${item.vendors}; assessments=${item.assessments}; findings=${item.findings}`]);
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="trustsphere-risk-report-${range}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (error) { next(error); }
});
