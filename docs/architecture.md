# TrustSphere — Architecture

## Architectural approach

Start with a **modular monolith**: one deployable Express API with explicit domain modules and boundaries. This keeps the portfolio implementation approachable while preserving a path to extract independently scaled workers or services later.

## Logical components

```text
React + TypeScript (Vite)
        |
        | HTTPS / JSON
        v
Express API (/api/v1)
  |-- Authentication & authorization
  |-- Organization / membership
  |-- Vendor management
  |-- Assessments & risk engine
  |-- Compliance & evidence
  |-- Findings & remediation
  |-- Audit events
        |
        +---- MongoDB (tenant-scoped documents)
        +---- Object storage (future: private evidence files)
        +---- Redis / BullMQ (future: asynchronous jobs)
        +---- AI provider adapter (future: human-reviewed suggestions)
```

## Tenant isolation

- Every tenant-owned record must carry an `organizationId`.
- Resolve the active organization from a verified membership, not from an arbitrary client-supplied ID alone.
- Scope every read, update, and delete query by both resource ID and organization ID.
- Enforce membership and permission checks in backend middleware/services.
- Add automated cross-tenant access tests before exposing tenant-owned endpoints.

## Domain boundaries

| Domain | Owns |
|---|---|
| Identity | Users, sessions, authentication |
| Organizations | Tenants, memberships, invitations |
| Vendors | Vendor profiles, lifecycle state |
| Assessments | Questionnaires, answers, assessment snapshots |
| Risk | Scoring rules, findings, risk history |
| Compliance | Frameworks, controls, evidence links |
| Workflow | Approval definitions and transitions |
| Audit | Append-only business activity records |

## API conventions

- Prefix: `/api/v1`
- JSON request and response bodies.
- Validate external input at the API boundary.
- Return a consistent error shape.
- Use pagination for collection endpoints.
- Avoid leaking internal stack traces in production.

## Risk scoring principles

Risk scores must be deterministic and explainable. Store the scoring model/version and the contributing category scores with each assessment snapshot. AI may summarize evidence or suggest mappings, but must not silently alter authoritative scores or approve vendors.

## File handling

Store file metadata and access-control metadata in MongoDB. Store binary objects in private object storage. Validate size, MIME type, file signature, and authorization; add malware scanning before production use.

## Production hardening still required

This foundation is not a production security certification. Before real deployment, add refresh-token/session lifecycle hardening, CSRF strategy if cookie auth is used, structured audit retention, backups, observability, secret rotation, rate-limit policy, dependency scanning, security testing, and operational runbooks.
