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

This module is an operational coordination aid, not a substitute for an approved incident response plan, forensic tooling, legal review, or statutory notification process. External alert-source webhook signature verification, automated SLA breach detection and escalation, on-call routing, outbound notifications, attachments, forensic evidence chain-of-custody and automated playbooks remain future work.


## Alert ingestion and initial SLA policy

The authenticated tenant-scoped alert API is mounted at `/api/v1/alerts`:

- `POST /api/v1/alerts` — ingest an alert from `siem`, `edr`, `cloud`, `email_gateway`, `manual` or `other`; requires `security:write`.
- `GET /api/v1/alerts?page=1&limit=20&severity=&source=` — list the current organization's alerts; requires `security:read`.

Each alert is deduplicated by organization, source and source event ID. Repeated delivery increments its occurrence count and refreshes the last-received timestamp rather than creating another incident. A newly ingested alert creates a linked incident and an activity event. Alert input is strictly validated; callers cannot supply organization IDs or incident IDs.

New incidents receive fixed initial SLA targets from their severity, measured from report/ingestion time: P1 response/containment/resolution 15m/1h/4h; P2 1h/4h/24h; P3 4h/24h/72h; P4 8h/48h/120h. The first-response timestamp is set when investigation begins. These are starter defaults, not tenant-configurable contractual commitments. Automated breach detection, escalation/on-call routing and outbound notifications are not included in this slice.


## Automated SLA monitoring and escalation

Run the independent database polling worker with `npm run worker:sla --workspace server` (or `npm run worker:sla` from the repository root). It scans active incidents every 60 seconds and records overdue response, containment and resolution milestones. A unique organization + incident + milestone index makes each breach record idempotent across worker restarts and concurrent scans.

For each breach, an in-app notification is created for the assigned responder (when present) and active organization owners/admins. The latter is the initial escalation tier; there is no configurable on-call rota in this release. Notifications are tenant- and recipient-scoped:

- `GET /api/v1/notifications?page=1&limit=20` — current user's notification inbox and unread count; requires `security:read`.
- `PATCH /api/v1/notifications/:id/read` — mark one owned notification read.
- `POST /api/v1/notifications/read-all` — mark all current user's tenant notifications read.

The worker uses MongoDB only and does not require Redis or SMTP. It is a separate long-running process and must be deployed as a worker service with the same MongoDB environment configuration as the API. Notifications are persisted in-app; email, push, real-time delivery, configurable on-call schedules, timed multi-tier escalation, and external SIEM/EDR webhook authentication remain future work. A breach notification is not proof that a human responder has acknowledged or acted on the incident.
