# Vendor Management Module

## Scope
Tenant-scoped vendor directory with create, read, update, and archive operations; server-side search, status/risk filters, pagination, and an explainable deterministic inherent-risk score.

## Risk score v1
The score is a transparent baseline heuristic, not a regulatory rating or a substitute for a completed assessment:
- Criticality: low 15, medium 35, high 60, critical 75
- Data sensitivity: public 0, internal 5, confidential 12, restricted 18
- Access: none 0, limited 5, privileged 12
- Sum is capped at 100. Bands: low <35, medium 35–59, high 60–79, critical 80–100.

Every update recalculates the score from the three inputs. Future assessment snapshots should preserve scoring-model version and evidence.

## API
All endpoints require a bearer access token and `x-organization-id`. Tenant context is resolved from an active membership; organization IDs supplied by clients are never used as data filters without that membership check.

- `GET /api/v1/vendors/summary`
- `GET /api/v1/vendors?page=1&limit=10&search=&status=&riskBand=&sortBy=createdAt&sortOrder=desc`
- `POST /api/v1/vendors`
- `GET /api/v1/vendors/:id`
- `PATCH /api/v1/vendors/:id`
- `DELETE /api/v1/vendors/:id` (soft archive)

Collection page size is capped at 50. Search input is regex-escaped. Sorting is allow-listed. Every resource query includes the authenticated organization ID, including archive/update operations. Read permission is `vendors:read`; mutations require `vendors:write`.

## Limitations
This module does not yet include vendor assessment questionnaires, evidence uploads, continuous monitoring, audit-event persistence, approval workflows, or external risk intelligence. The risk score is an initial explainable classification only.
