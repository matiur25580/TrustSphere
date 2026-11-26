# TrustSphere

**AI-Powered Enterprise Risk & Compliance Management Platform**

TrustSphere is a multi-tenant SaaS platform concept for managing third-party vendors, assessing operational and cybersecurity risks, organizing compliance evidence, and coordinating remediation workflows.

> **Project status:** Foundation in progress. This repository is being built incrementally. Features are documented as planned until implemented and tested.

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

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### Environment

Create `server/.env` based on `server/.env.example`. Never commit real secrets.

### Run locally

```bash
npm run dev
```

The API health endpoint is `GET /api/v1/health`. The frontend runs on the Vite development server.

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
