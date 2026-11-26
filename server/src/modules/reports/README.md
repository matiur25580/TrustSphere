# Reporting module

## Endpoints

All routes require a bearer access token, active `x-organization-id` membership and `reports:read`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/reports/overview?range=7d` | Executive summary, distributions, daily trend and attention queues |
| GET | `/api/v1/reports/export.csv?range=30d` | CSV export of summary metrics, distributions and trends |

Supported ranges are `7d`, `30d` and `90d`; omitted or unsupported values default to `30d`.

## Metric definitions

- Vendor, assessment and finding totals/distributions/trends use each record's `createdAt` within the selected rolling window.
- High-risk vendor count means vendor inherent-risk bands `high` or `critical` among vendors created in the period.
- Assessment risk distribution uses the assessment's stored scored risk band; unscored assessments are omitted from that distribution.
- Open findings include `open`, `in_progress` and `pending_validation`; overdue means one of those statuses with a due date earlier than report generation.
- Compliance coverage is a current snapshot using the ten-control starter catalog. `not_applicable` controls are excluded from the denominator; only `implemented` controls count as covered.
- Evidence lifecycle is a current snapshot. Evidence whose expiry date has passed is counted as expired even if its stored status has not yet been lazily updated by the evidence API.
- Attention queues are current operational queues (not restricted to the selected creation window) and are bounded to the six oldest overdue findings and five oldest items in each review queue.

## Security and limitations

All database aggregations and attention queries include the organization identifier obtained from membership middleware; no organization ID is accepted from query or body parameters. The module is read-only and is available to owner, admin, analyst and viewer roles through the existing `reports:read` permission.

CSV is generated server-side. The print-optimized React report uses the browser's print dialog; select “Save as PDF” to create a PDF. This module does not yet create scheduled reports, saved report definitions or email deliveries.

Risk scoring and compliance crosswalk data are internal decision-support indicators only, not certifications, legal advice, audit opinions or regulatory determinations.
