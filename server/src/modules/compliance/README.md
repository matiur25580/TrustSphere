# Compliance and evidence module

## Scope

The module provides a starter control catalog, tenant-specific implementation tracking and a private evidence lifecycle.

- Catalog version: `trustsphere-control-catalog-v1`
- Framework references: selected SOC 2 Trust Services Criteria and ISO/IEC 27001:2022 Annex A references
- Shared control statements: ten
- Tenant state: implementation status, accountable owner and notes
- Evidence: private local-disk storage, control association, SHA-256, expiry, review status and activity history

## Control API

All endpoints require a bearer access token and an active `x-organization-id` membership.

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/compliance/frameworks` | `compliance:read` | List framework summaries |
| GET | `/api/v1/compliance/summary` | `compliance:read` | Implementation counts and coverage |
| GET | `/api/v1/compliance/controls` | `compliance:read` | List mapped controls and tenant state |
| PUT | `/api/v1/compliance/controls/:controlId` | `compliance:write` | Update implementation state |
| GET | `/api/v1/compliance/controls/:controlId/events` | `compliance:read` | Read control change history |

Supported framework query values are `soc2` and `iso27001-2022`. Implementation states are `not_started`, `in_progress`, `implemented`, and `not_applicable`.

## Evidence API

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| POST | `/api/v1/compliance/evidence` | `compliance:write` | Upload a control evidence file |
| GET | `/api/v1/compliance/evidence` | `compliance:read` | List tenant evidence (optional controlId/status filters) |
| POST | `/api/v1/compliance/evidence/:id/review` | owner/admin | Approve or reject pending evidence |
| GET | `/api/v1/compliance/evidence/:id/download` | `compliance:read` | Download with tenant and review-state authorization |
| GET | `/api/v1/compliance/evidence/:id/events` | `compliance:read` | Read evidence activity history |

Uploads use multipart field `file`, required `controlId`, and optional ISO date `expiresAt`. The server accepts PDF, PNG, JPEG and UTF-8 text files up to 25 MB, checks signatures, sanitizes display filenames, computes SHA-256 and stores the binary using an opaque UUID under an organization-specific directory. Configure `EVIDENCE_STORAGE_DIR` to a persistent path outside the public web root. Files are created with restrictive directory/file permissions. Storage keys are never accepted from the browser.

Evidence starts in `pending_review`. Only an organization owner/admin can approve or reject it, and uploaders cannot review their own files. The uploader and organization reviewers can access pending files; general member downloads require approval. Approved evidence becomes `expired` when its expiry date is reached and cannot be downloaded. Activity includes upload, review and download events.

## Operational and security limitations

Local filesystem storage is a single-server adapter; it is not shared or durable across ephemeral/multi-instance deployments. Before production, add private object storage with encryption/key management, malware scanning and quarantine, backup/retention policies, storage lifecycle cleanup, upload concurrency controls and operational monitoring. A database record and local file write are not protected by a distributed transaction; cleanup handles ordinary database write failures but crash consistency needs a storage reconciliation job. Evidence events are append-only through the API, not tamper-proof or externally anchored.

See the [evidence security test plan](evidence.test-plan.md). Run `npm run test --workspace server`; CI execution is still required before these cases are considered verified.\n\nThe control catalog is a starter crosswalk for product demonstration and implementation planning. It is not an official standards interpretation, legal advice, audit opinion, certification or assurance that an organization meets a framework.
