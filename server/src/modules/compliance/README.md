# Compliance module

## Scope

This module provides a starter control catalog and tenant-specific implementation tracking for TrustSphere.

- Catalog version: `trustsphere-control-catalog-v1`
- Framework references: selected SOC 2 Trust Services Criteria and ISO/IEC 27001:2022 Annex A references
- Shared control statements: ten
- Tenant state: implementation status, owner, notes, evidence metadata
- History: API-level append-only event records

## API

All endpoints require a bearer access token and an active `x-organization-id` membership.

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/compliance/frameworks` | `compliance:read` | List supported framework summaries |
| GET | `/api/v1/compliance/summary` | `compliance:read` | Implementation counts and coverage |
| GET | `/api/v1/compliance/controls` | `compliance:read` | List mapped controls and tenant state |
| PUT | `/api/v1/compliance/controls/:controlId` | `compliance:write` | Upsert implementation state |
| GET | `/api/v1/compliance/controls/:controlId/events` | `compliance:read` | Read recent change history |

Supported framework query values are `soc2` and `iso27001-2022`. Implementation states are `not_started`, `in_progress`, `implemented`, and `not_applicable`.

Evidence records contain filename, MIME type, byte size, SHA-256 and an opaque organization-prefixed storage key. This module does not upload, scan, serve or sign binary files. Integrate private object storage and an authorization layer before attaching real evidence.

## Limitations

The control catalog is a starter crosswalk for product demonstration and implementation planning. It is not an official standards interpretation, legal advice, audit opinion, certification or assurance that an organization meets a framework. Control event records are append-only through the API but are not transactionally coupled to implementation writes and are not tamper-proof. Catalog authoring, version migration, evidence review/approval, automated tests beyond the shared API integration suite, and formal compliance assessment are future work.
