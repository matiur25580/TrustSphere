# TrustSphere

**AI-Powered Enterprise Risk & Compliance Management Platform**

TrustSphere is a multi-tenant SaaS platform concept for managing third-party vendors, assessing operational and cybersecurity risks, organizing compliance evidence, and coordinating remediation workflows.

> **Project status:** Identity, tenant context, vendor management, and the first vendor security assessment workflow are implemented in the repository. Full runtime/API integration and cross-tenant security verification remain pending; this is not a production-certified system.

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
| Testing | Vitest, Supertest (planned in foundation) |
| Realtime / jobs | Socket.IO, Redis, BullMQ (later phases) |
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

Create `server/.env` from `server/.env.example` and ensure MongoDB is running. Never commit real secrets.

### Run locally

```bash
npm run dev
```

The Vite client runs at `http://localhost:5173` and proxies `/api` requests to the Express API at `http://localhost:5000`. The API health endpoint is `GET /api/v1/health`.

The dashboard combines illustrative portfolio analytics with a live, tenant-scoped vendor directory. Vendor records are persisted in MongoDB; the headline analytics and risk-distribution visualization remain illustrative sample data.

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

The React client includes login and organization registration screens, in-memory access-token handling, refresh-cookie session restoration, a protected dashboard view, sign-out, organization switching, and a live tenant-context check. The authenticated dashboard includes a vendor directory and an assessment workspace with versioned baseline questionnaires, answer capture, evidence references, risk breakdowns, and owner/admin review. The access token is deliberately not persisted in localStorage; the browser uses the HttpOnly refresh cookie to restore sessions.

**Important:** this is an evolving portfolio implementation, not a security certification. Automated API/security integration tests, audit-event tamper resistance, invitations, MFA, configurable template authoring, private object-storage integration, and production deployment hardening remain future work. Registration currently uses compensating cleanup for partial failures; it is not a multi-document MongoDB transaction. Dashboard analytics remain illustrative sample data, while the vendor directory reads and writes persisted records.

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

Evidence entries are metadata and opaque private-storage keys only. This repository does not upload, serve, or sign evidence files; connect a private object-storage provider and authorization layer before using real documents. Assessment events are append-only through the exposed API, but the event write and assessment update are not yet wrapped in a database transaction or tamper-proof external audit store.

See [assessment module notes](server/src/modules/assessments/README.md) and [assessment security test plan](server/src/modules/assessments/assessment.test-plan.md).

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
