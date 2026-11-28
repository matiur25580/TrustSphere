# TrustSphere

**AI-Powered Enterprise Risk & Compliance Management Platform**

TrustSphere is a multi-tenant SaaS platform concept for managing third-party vendors, assessing operational and cybersecurity risks, organizing compliance evidence, and coordinating remediation workflows.

> **Project status:** Identity, tenant context, vendor management, vendor security assessments, findings/remediation, compliance evidence, enterprise reporting, and an initial incident response lifecycle are implemented in the repository. Runtime/API integration, cross-tenant security verification and production hardening remain pending; this is not a production-certified system.

## Product goals

- Give organizations a single workspace for third-party vendor risk.
- Make assessments, findings, evidence, and remediation traceable.
- Support configurable compliance controls and human-reviewed evidence.
- Enforce tenant isolation and least-privilege access in the API.
- Use AI as an assistant for summaries and evidence suggestions—not as an autonomous compliance authority.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| API | Node.js, Express, TypeScript |
| Database | MongoDB, Mongoose |
| Validation | Zod |
| Security baseline | Helmet, CORS allow-list, rate limiting |
| Testing | Node.js test runner via tsx, scoring unit tests, MongoDB-backed API integration tests |
| Background jobs | Redis, BullMQ, Nodemailer, PDFKit |
| AI | Provider adapter (Gemini integration planned) |

## Repository layout

```text
.
├── client/                 # React application
├── server/                 # Express API
├── docs/                   # Product and engineering documentation
├── package.json            # Workspace scripts
└── README.md
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- MongoDB instance (local or MongoDB Atlas)

### Install

From the repository root:

```bash
npm install
```

### Environment

Copy the root `.env.example` to `server/.env`, then configure MongoDB. The separate report worker also needs a reachable Redis instance and SMTP credentials before scheduled email delivery is activated. Never commit real secrets.

### Run locally

```bash
npm run dev
```

The Vite client runs at `http://localhost:5173` and proxies `/api` requests to the Express API at `http://localhost:5000`. The API health endpoint is `GET /api/v1/health`.

The dashboard includes a tenant-scoped vendor directory, assessment and remediation workspaces, compliance evidence management, incident response operations, and live portfolio reporting. Executive metrics, risk distributions, activity trends and attention queues are aggregated from MongoDB for the selected organization. CSV export is available, and the report view can be printed or saved as PDF from the browser print dialog.

### Authentication configuration

Set a unique `JWT_ACCESS_SECRET` in `server/.env` (at least 32 characters). For example, generate one with `openssl rand -base64 48`. Keep this secret private and never commit it.

### Identity API (implemented foundation)

- `POST /api/v1/auth/register` — create a user, organization, and owner membership.
- `POST /api/v1/auth/login` — authenticate and return a short-lived access token and organization memberships.
- `POST /api/v1/auth/refresh` — rotate the HttpOnly refresh-session cookie.
- `POST /api/v1/auth/logout` — revoke the current refresh session.
- `GET /api/v1/auth/me` — return the authenticated user and organization memberships.
- `GET /api/v1/tenant/context` — example tenant-protected endpoint; requires a bearer access token and an `x-organization-id` header.

Passwords are hashed with bcrypt. Refresh tokens are opaque, stored as hashes, rotated with an atomic one-time update, and sent in HttpOnly SameSite cookies. The API includes membership-based tenant context and owner/admin/analyst/viewer permission middleware. See [Identity module notes](server/src/modules/identity/README.md) and the [identity security test plan](server/src/modules/identity/identity.test-plan.md).

The React client includes login and organization registration screens, in-memory access-token handling, refresh-cookie session restoration, a protected dashboard view, sign-out, organization switching, and a live tenant-context check. The authenticated dashboard includes a vendor directory, assessment workspace, and findings/remediation workspace with versioned baseline questionnaires, answer capture, evidence references, risk breakdowns, remediation ownership, due dates, and independent owner/admin validation. The access token is deliberately not persisted in localStorage; the browser uses the HttpOnly refresh cookie to restore sessions.

**Important:** this is an evolving portfolio implementation, not a security certification. Automated API/security integration tests still require CI confirmation; audit-event tamper resistance, invitations, MFA, configurable template authoring, private object-storage integration, and production deployment hardening remain future work. Registration currently uses compensating cleanup for partial failures; it is not a multi-document MongoDB transaction. The reporting workspace reads persisted organization data. Date-range filters apply to newly created vendors, assessments and findings; compliance implementation and evidence lifecycle cards show current organization status.

### Vendor Management API

All vendor routes require a bearer access token and an `x-organization-id` header. The API verifies active membership before accessing vendor data and applies role permissions (`vendors:read` / `vendors:write`).

- `GET /api/v1/vendors/summary` — tenant-scoped portfolio counts.
- `GET /api/v1/vendors?page=1&limit=10&search=&status=&riskBand=` — filtered and paginated directory (maximum page size 50).
- `POST /api/v1/vendors` — create a vendor.
- `GET /api/v1/vendors/:id` — read one vendor.
- `PATCH /api/v1/vendors/:id` — update profile and recalculate risk.
- `DELETE /api/v1/vendors/:id` — soft archive.

Risk score v1 is a deterministic heuristic based on criticality, data sensitivity, and system access. It is not a completed assessment or regulatory rating. See [Vendor module notes](server/src/modules/vendors/README.md) and [vendor security test plan](server/src/modules/vendors/vendor.test-plan.md).

### Vendor Security Assessment API

Assessment endpoints require a bearer token, an active tenant membership, and the corresponding `risk:read` or `risk:write` permission.

- `GET /api/v1/assessments/templates` — current published baseline template metadata and questions.
- `GET /api/v1/assessments/summary` — tenant-scoped assessment counts and recent scored records.
- `GET /api/v1/assessments?status=&vendorId=&page=1&limit=10` — filtered, paginated assessments.
- `POST /api/v1/assessments` — create an assessment for an active vendor in the current organization; stores a template snapshot.
- `GET /api/v1/assessments/:id` — assessment details and append-only event history.
- `PUT /api/v1/assessments/:id/responses` — validate and save answers plus evidence metadata.
- `POST /api/v1/assessments/:id/submit` — validate required answers and calculate the risk result.
- `POST /api/v1/assessments/:id/review` — owner/admin approval or rejection with reviewer comment.

The baseline template is version 1. Answers map to risk contributions (yes=0, partial=50, no=100); not-applicable answers are excluded from the weighted denominator. The result is a 0–100 risk score with category breakdown and model identifier `vendor-security-risk-v1`. The assessment score is separate from the vendor directory's inherent-risk heuristic.

Assessment questionnaire evidence remains metadata-only. The compliance control workspace now supports a separate private-disk evidence workflow with MIME signature checks, a 25 MB limit, SHA-256 checksums, tenant-scoped authorization, independent owner/admin review, expiry enforcement and authorized downloads. Files are stored outside the public web root with restrictive local filesystem permissions. This is a single-server starter adapter, not durable shared object storage; configure a private S3-compatible provider, malware scanning, backup/retention and key management before production use. Evidence review events are API-level history, not a tamper-proof external audit store.

See [assessment module notes](server/src/modules/assessments/README.md) and [assessment security test plan](server/src/modules/assessments/assessment.test-plan.md).

### Findings & Remediation API

All endpoints require an authenticated active tenant.

- `GET /api/v1/findings/summary` — tenant-scoped operational counts, overdue and critical findings.
- `GET /api/v1/findings?page=1&limit=10&status=&severity=&priority=&vendorId=&assessmentId=` — filtered, paginated findings.
- `POST /api/v1/findings/from-assessment/:assessmentId` — idempotently generate findings from No/Partial answers in a submitted assessment.
- `POST /api/v1/findings` — create a finding for an existing No/Partial response.
- `GET /api/v1/findings/:id` — finding details and activity history.
- `PATCH /api/v1/findings/:id` — update remediation plan, owner, due date and classification.
- `POST /api/v1/findings/:id/transition` — start work, submit for validation, independently validate/reopen, or accept residual risk.

The deterministic severity/priority classifier is a triage aid, not a regulatory severity decision. Finding generation is idempotent per tenant/assessment/question. Owners/admins validate remediation, and the finding creator cannot validate their own work. Activity events are append-only through the API, but transactions and tamper-proof audit storage remain future hardening. See [findings module notes](server/src/modules/findings/README.md) and [findings security test plan](server/src/modules/findings/finding.test-plan.md).

### Compliance Framework & Control Mapping

The starter compliance workspace maps ten shared control statements to selected SOC 2 Trust Services Criteria and ISO/IEC 27001:2022 Annex A references. The catalog is versioned as `trustsphere-control-catalog-v1`; organization-specific implementation status, accountable owner, notes and evidence metadata are stored separately per tenant.

- `GET /api/v1/compliance/frameworks` — available framework summaries and catalog disclaimer.
- `GET /api/v1/compliance/summary` — tenant-scoped implementation counts and coverage.
- `GET /api/v1/compliance/controls?framework=soc2|iso27001-2022` — mapped controls and current tenant implementation.
- `PUT /api/v1/compliance/controls/:controlId` — update implementation status, owner, notes and evidence metadata.
- `GET /api/v1/compliance/controls/:controlId/events` — recent control implementation activity.

The React workspace supports framework filtering, control implementation updates, private evidence upload, evidence status tracking, reviewer approval/rejection, expiry visibility and authorized downloads. Evidence is associated with a control and organization; pending evidence is available to its uploader and organization reviewers, while general member downloads require approval. The starter crosswalk is an implementation aid, not an official interpretation, audit opinion or certification. See [compliance module notes](server/src/modules/compliance/README.md).

### Compliance Evidence API

All endpoints require a bearer access token and active tenant membership.

- `POST /api/v1/compliance/evidence` — multipart upload with `file`, `controlId` and optional ISO date `expiresAt`.
- `GET /api/v1/compliance/evidence?controlId=&status=` — tenant-scoped evidence register (maximum 100 records).
- `POST /api/v1/compliance/evidence/:id/review` — owner/admin approval or rejection with reviewer comment; uploaders cannot review their own files.
- `GET /api/v1/compliance/evidence/:id/download` — authorized private download; pending evidence is restricted and expired evidence returns HTTP 410.
- `GET /api/v1/compliance/evidence/:id/events` — upload, review and download activity history.

Uploads are limited to 25 MB and PDF, PNG, JPEG or UTF-8 text content. The API checks file signatures, generates SHA-256, sanitizes display filenames and stores opaque UUID filenames under an organization-specific private directory. Set `EVIDENCE_STORAGE_DIR` to a persistent directory outside the web root. Local disk is not suitable for multi-instance or ephemeral deployments. Malware scanning, encrypted object storage, backup/retention automation and transactionally tamper-resistant audit storage remain production hardening tasks.

### Incident Management & Security Operations

All incident endpoints require an authenticated active tenant. Owner/admin/analyst can create and manage incidents with `security:write`; viewer can read with `security:read`.

- `GET /api/v1/incidents/members` — active organization responders for assignment.
- `GET /api/v1/incidents/summary` — tenant-scoped incident counts and severity distribution.
- `GET /api/v1/incidents?status=&severity=&category=&q=&page=1&limit=20` — filtered, paginated incident queue.
- `POST /api/v1/incidents` — report a security incident and optionally link an in-tenant vendor, finding and assignee.
- `GET /api/v1/incidents/:id` — incident record and investigation timeline.
- `PATCH /api/v1/incidents/:id` — update incident details, plans, lessons learned and assignee.
- `POST /api/v1/incidents/:id/transition` — triage, investigate, contain, recover, resolve, close or reopen.
- `POST /api/v1/incidents/:id/comments` — append an investigation note to the event timeline.

The lifecycle enforces containment and recovery plans before those stages. Only owner/admin can close or reopen resolved incidents. Vendor, finding and assignee references are validated against the active organization. Event history is append-only through the API, but is not yet transactionally coupled or cryptographically tamper-evident. See [Incident module notes](server/src/modules/incidents/README.md) and the [incident API test plan](server/src/modules/incidents/incident.test-plan.md).

### Enterprise Reporting & Risk Intelligence

All reporting endpoints require an authenticated active tenant and the `reports:read` permission.

- `GET /api/v1/reports/overview?range=7d|30d|90d` — tenant-scoped executive summary, risk distributions, daily activity trend and operational attention queues.
- `GET /api/v1/reports/export.csv?range=7d|30d|90d` — CSV export of summary metrics, distributions and daily trend.

The reporting workspace includes vendor risk bands, assessment risk bands, finding severity and lifecycle, compliance implementation coverage, evidence lifecycle, overdue remediation, assessments awaiting review and evidence awaiting review. The selected date range filters vendor, assessment and finding creation activity; compliance and evidence status are current snapshots. The print-optimized report can be saved as PDF using the browser print dialog.

Risk scores and starter framework mappings are decision-support indicators, not certifications, audit opinions or regulatory determinations. The dashboard and report endpoints are tenant-scoped; all analytics are aggregated using the active organization identifier resolved by membership middleware. See [reporting module notes](server/src/modules/reports/README.md) for metric definitions and date-window semantics.

### Scheduled Saved Report Delivery

Saved report definitions support manual, weekly and monthly schedules in an IANA time zone. Recurring definitions require at least one validated recipient. The API exposes tenant-scoped delivery history at `GET /api/v1/reports/saved/:id/deliveries`.

Run the delivery process separately from the API with `npm run worker:reports` from the repository root. The worker reconciles active MongoDB definitions into BullMQ repeatable schedulers in Redis, generates CSV or PDF attachments, and sends them through the configured SMTP relay. Failed jobs use five attempts with exponential backoff; delivery records retain status, recipients, attempt count, provider message ID and failure reason. A stable delivery key and message ID reduce duplicate processing, but SMTP delivery remains at-least-once: no external mail provider can guarantee exactly-once delivery after an ambiguous network failure.

Configure `REDIS_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` and optional `SMTP_USER` / `SMTP_PASSWORD` in the worker environment. The API can run without these optional settings, but scheduled jobs will not execute until a worker with valid Redis and SMTP configuration is running. Do not put credentials in source control.

### Run assessment and findings scoring tests

From the repository root, run `npm run test --workspace server`. The suite includes pure scoring unit tests and MongoDB-backed API integration coverage. The latest GitHub Actions run completed successfully with workspace typechecking, production builds, scoring tests and MongoDB-backed API integration tests.

### Unified Audit Activity API

The tenant-scoped audit explorer consolidates the existing append-only application events from assessments, findings, incidents, compliance controls and evidence into one searchable timeline.

- `GET /api/v1/audit/events?page=1&limit=20` — merged newest-first event feed (maximum page size 50).
- Optional filters: `resourceType=assessment|finding|incident|control|evidence`, exact `action`, `actorId`, and ISO-8601 `from` / `to` timestamps.
- Requires authentication, active tenant membership and `reports:read`; every source query is scoped by the organization resolved by membership middleware.
- The React dashboard includes resource, action and date filters with pagination.

This explorer aggregates existing module event collections; it does not yet provide a cryptographically tamper-evident audit ledger, transactional outbox, immutable external retention or audit export. Those remain separate production-hardening requirements.

## Engineering principles

1. **Tenant isolation is enforced server-side.** Client-side filtering is never a security boundary.
2. **Least privilege by default.** Permissions are checked at the route/service boundary.
3. **Auditability.** Important state changes will record actor, tenant, resource, action, and timestamp.
4. **Explainable automation.** Risk scores use documented rules; AI output requires human review.
5. **Secure document handling.** File metadata and access policy are stored in MongoDB; binary files belong in object storage.
6. **Incremental delivery.** Each milestone should be runnable, tested, and documented.

## Product modules (roadmap)

- Organization and identity management
- Vendor directory and lifecycle
- Security questionnaires and risk assessments
- Compliance frameworks, controls, and evidence
- Findings, remediation, and incidents
- Workflow approvals and notifications
- Analytics, reporting, and audit history
- AI-assisted document intelligence

See [Product roadmap](docs/roadmap.md) and [Architecture](docs/architecture.md).

## Security disclosure

Do not use production or confidential data in this portfolio project. Do not upload real vendor security reports, personal data, credentials, or secrets. Report suspected vulnerabilities privately to the repository owner.

## License

To be decided before public reuse or distribution.
