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

- Every tenant-owned record must carry an `organizationId`. Vendor documents, assessments, and assessment events carry organization references.
- Resolve the active organization from a verified membership, not from an arbitrary client-supplied ID alone.
- Scope every read, update, and archive query by both resource ID and organization ID. Assessment detail, vendor linkage, list, summary, response, submit, review, and event-history queries are tenant-scoped.
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

Risk scores must be deterministic and explainable. The vendor directory has an inherent-risk triage heuristic. The separate assessment engine snapshots template version 1 and calculates a weighted 0–100 risk score (yes=0, partial=50, no=100; not-applicable excluded), retaining model version `vendor-security-risk-v1` and per-category breakdown. This questionnaire is decision support only, not a certification, audit opinion, or regulatory determination. AI may summarize evidence or suggest mappings, but must not silently alter authoritative scores or approve vendors.

## Assessment and evidence handling

Assessment question sets are copied into each assessment as version snapshots so future template revisions do not rewrite historical questionnaires. Assessment state transitions are draft/in-progress → submitted → approved/rejected. Only owners/admins can make the final review decision. Event history is append-only through API routes; database-level tamper resistance and atomic transaction guarantees are not implemented yet.

Evidence records contain metadata and an opaque storage key only. Binary storage, malware scanning, signed URL issuance, and per-object authorization require a separately configured private object-storage integration.

## File handling

Store file metadata and access-control metadata in MongoDB. Store binary objects in private object storage. Validate size, MIME type, file signature, and authorization; add malware scanning before production use.

## Production hardening still required

This foundation is not a production security certification. Before real deployment, add refresh-token/session lifecycle hardening, CSRF strategy if cookie auth is used, structured audit retention, backups, observability, secret rotation, rate-limit policy, dependency scanning, security testing, and operational runbooks.
