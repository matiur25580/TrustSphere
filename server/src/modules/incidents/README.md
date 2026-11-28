# Incident management module

## API

All routes require a bearer access token and active `x-organization-id` membership.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/v1/incidents/members` | `security:read` | Active organization responders for assignment |
| GET | `/api/v1/incidents/summary` | `security:read` | Tenant-scoped incident counts and severity distribution |
| GET | `/api/v1/incidents` | `security:read` | Filtered and paginated incident queue |
| POST | `/api/v1/incidents` | `security:write` | Report an incident |
| GET | `/api/v1/incidents/:id` | `security:read` | Incident details and activity history |
| PATCH | `/api/v1/incidents/:id` | `security:write` | Update investigation record and assignee |
| POST | `/api/v1/incidents/:id/transition` | `security:write` | Advance or reopen incident lifecycle |
| POST | `/api/v1/incidents/:id/comments` | `security:write` | Append an investigation note |

## Lifecycle

`reported → triaged → investigating → contained → recovering → resolved → closed`

- Investigation can start from reported or triaged.
- A containment plan is required before marking an incident contained.
- A recovery plan is required before entering recovery.
- Resolution is permitted after containment.
- Only owner/admin can close or reopen resolved incidents.
- Owner/admin/analyst can report, assign, investigate, update plans and add notes; viewer can read.
- Reopening returns an incident to investigation and clears resolved/closed timestamps.

## Tenant and relationship controls

Every incident and event query is scoped by the organization resolved from active membership. Optional vendor and finding links must belong to the same organization; when both are provided, the finding must belong to the selected vendor. Assignees must be active members of that organization. The API does not accept an organization identifier from the incident body.

## Activity history and limitations

Incident events capture creation, assignment, investigation transitions, details updates and comments. They are append-only through the API surface, but are not yet transactionally coupled to incident writes, cryptographically tamper-evident, or protected from privileged database operators. Comments are stored as event details and are visible to organization members with read access.

This module is an operational coordination aid, not a substitute for an approved incident response plan, forensic tooling, legal review, or statutory notification process. Alert ingestion, on-call routing, SLA timers, attachments, forensic evidence chain-of-custody, notification delivery and automated playbooks remain future work.


## Alert ingestion and initial SLA policy

The authenticated tenant-scoped alert API is mounted at `/api/v1/alerts`:

- `POST /api/v1/alerts` — ingest an alert from `siem`, `edr`, `cloud`, `email_gateway`, `manual` or `other`; requires `security:write`.
- `GET /api/v1/alerts?page=1&limit=20&severity=&source=` — list the current organization's alerts; requires `security:read`.

Each alert is deduplicated by organization, source and source event ID. Repeated delivery increments its occurrence count and refreshes the last-received timestamp rather than creating another incident. A newly ingested alert creates a linked incident and an activity event. Alert input is strictly validated; callers cannot supply organization IDs or incident IDs.

New incidents receive fixed initial SLA targets from their severity, measured from report/ingestion time: P1 response/containment/resolution 15m/1h/4h; P2 1h/4h/24h; P3 4h/24h/72h; P4 8h/48h/120h. The first-response timestamp is set when investigation begins. These are starter defaults, not tenant-configurable contractual commitments. Automated breach detection, escalation/on-call routing and outbound notifications are not included in this slice.
