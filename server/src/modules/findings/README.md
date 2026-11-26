# Findings & Remediation

The findings module converts failed or partially satisfied controls in a submitted vendor assessment into tenant-scoped remediation records.

## API

All endpoints require a bearer access token and active `x-organization-id` membership.

- `GET /api/v1/findings/summary` — counts by operational state, overdue and critical.
- `GET /api/v1/findings?page=1&limit=10&status=&severity=&priority=&vendorId=&assessmentId=` — filtered, paginated findings.
- `POST /api/v1/findings/from-assessment/:assessmentId` — idempotently create findings from No/Partial answers.
- `POST /api/v1/findings` — create a finding for an existing No/Partial assessment response.
- `GET /api/v1/findings/:id` — detail and activity history.
- `PATCH /api/v1/findings/:id` — update description, severity, priority and remediation plan/owner/due date.
- `POST /api/v1/findings/:id/transition` — start, submit for validation, validate/reopen, or accept residual risk.

## Workflow

`open → in_progress → pending_validation → resolved`; a reviewer can return validation to `in_progress`. Owners/admins may accept residual risk with a reason. Finding creators cannot validate their own remediation. A remediation plan, named owner and due date are required before validation.

Severity and priority are deterministic triage suggestions derived from the source answer and question weight. They are editable by authorized risk writers and are not a regulatory severity determination. P1 is the highest priority.

Finding and activity queries are scoped to the authenticated tenant. The unique tenant/assessment/question index makes assessment-to-finding generation idempotent. Activity events are append-only through this API, but database-level tamper resistance and atomic transaction guarantees are not implemented.

## Evidence

This milestone references the assessment and question that produced the finding. Evidence remains metadata/private-storage integration from the assessment module; no binary upload or public file serving is introduced here.
