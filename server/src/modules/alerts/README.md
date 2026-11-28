# Security alert ingestion

## Endpoints

All endpoints require a bearer access token and active `x-organization-id` membership.

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/v1/alerts` | `security:write` | Ingest an alert and create a linked incident |
| GET | `/api/v1/alerts?page=1&limit=20&severity=&source=` | `security:read` | List tenant-scoped alerts |

## Idempotency and correlation

The unique key is `organizationId + source + sourceEventId`. Repeated deliveries increment `occurrenceCount` and update `lastReceivedAt`; they do not intentionally create another incident. The first delivery creates an incident and records an incident activity event linking the alert.

## Supported sources

`siem`, `edr`, `cloud`, `email_gateway`, `manual`, and `other`. This is an authenticated application API, not yet a public third-party webhook. Source-specific credentials, HMAC/signature validation, IP allow-lists and replay-window validation must be implemented before exposing ingestion to external systems.

## Security

- Organization scope is derived from active authenticated membership.
- The payload is strict and rejects unknown fields, including caller-supplied organization or incident IDs.
- Viewer role can list alerts but cannot ingest.
- All alert queries are tenant-scoped.

## Current limitations

A process crash between alert insertion and incident correlation can leave an alert without a linked incident; recovery/reconciliation is pending. Automatic SLA breach scanning, on-call routing, notification delivery and tenant-configurable SLA policies are also future work.
