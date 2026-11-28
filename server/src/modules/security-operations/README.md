# Incident forensic custody and response playbooks

## Chain of custody
- Every custody event references an existing evidence record and incident in the active tenant.
- The ledger snapshots the evidence SHA-256, actor, action, custody handoff, location, timestamp, sequence and previous event hash.
- Event hashes form a per-incident SHA-256 chain. The read endpoint recomputes the chain and reports integrity status.
- Events are append-only at the application/schema layer. A database administrator can still alter records; production deployments should export signed checkpoints to independently controlled immutable/WORM storage.

## Response playbooks
- Playbooks are tenant-scoped, category/severity matched, versioned into each run as a step snapshot, and auditable.
- Steps describe human-operated actions. This milestone does not automatically isolate infrastructure, rotate credentials, send external messages, or execute destructive containment.
- Required steps must be completed or explicitly skipped in order before the run can finish.

## API
- `POST /api/v1/security-operations/incidents/:incidentId/chain-of-custody`
- `GET /api/v1/security-operations/incidents/:incidentId/chain-of-custody`
- `GET|POST /api/v1/security-operations/playbooks`
- `PATCH /api/v1/security-operations/playbooks/:id`
- `POST /api/v1/security-operations/playbooks/:id/start` with `incidentId`
- `PATCH /api/v1/security-operations/playbook-runs/:runId/steps/:stepId`
- `GET /api/v1/security-operations/incidents/:incidentId/playbook-runs`
- `GET /api/v1/security-operations/incidents/:incidentId/playbook-events`

All endpoints require authenticated tenant context and security read/write permissions. Client-supplied organization IDs are not accepted.
