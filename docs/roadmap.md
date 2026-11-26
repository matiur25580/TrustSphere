# Product Roadmap

Status is intentionally conservative: unchecked implementation items have not yet passed automated/runtime verification.

## Milestone 0 — Foundation
- [x] Repository documentation and initial architecture
- [ ] TypeScript client and API workspaces (implemented; build verification pending)
- [ ] API health endpoint (implemented; runtime verification pending)
- [ ] Environment validation and database connection (implemented; runtime verification pending)
- [ ] Basic responsive application shell (implemented; browser verification pending)

## Milestone 1 — Identity and tenant foundation
- [ ] User registration and sign-in (implemented; integration verification pending)
- [ ] Organization creation and membership (implemented; integration verification pending)
- [ ] Server-side tenant resolution (implemented; isolation tests pending)
- [ ] Permission-based authorization (implemented; role matrix tests pending)
- [x] Findings API integration coverage for tenant isolation and role permissions (execution pending CI confirmation)

## Milestone 2 — Vendor lifecycle
- [ ] Vendor CRUD and server-side pagination (implemented; API verification pending)
- [ ] Vendor classification and criticality (implemented; scoring review pending)
- [ ] Lifecycle status and activity timeline
- [ ] Vendor contact and service records (basic profile fields implemented; verification pending)

## Milestone 3 — Assessments and risk
- [ ] Configurable questionnaire authoring (baseline v1 template snapshot implemented; authoring UI pending)
- [x] Answer submission and owner/admin review workflow (runtime verification pending)
- [x] Versioned template snapshot and explainable category-weighted scoring (scoring unit tests added; full API verification pending)
- [x] Findings generated from failed/partial assessment responses (runtime verification pending)
- [x] Tenant-scoped remediation workflow, due dates, ownership and independent validation (integration verification pending)
- [x] Finding activity history and deterministic severity/priority triage (tamper resistance and transaction boundary pending)
- [x] Human approval/rejection workflow (integration verification pending)
- [x] Append-only assessment event history at API level (tamper resistance and transaction boundary pending)

## Milestone 4 — Compliance and evidence
- [x] Starter framework and control library (SOC 2 / ISO 27001:2022 crosswalk; formal interpretation excluded)
- [x] Tenant-scoped private evidence uploads and control association (local disk adapter; shared object storage pending)
- [x] Independent evidence approval/rejection, reviewer comments and activity history (runtime verification pending)
- [x] Evidence expiry tracking and authorized download (malware scanning and lifecycle cleanup pending)
- [x] Control implementation gap status and API-level change history (runtime verification pending)

## Milestone 5 — Operations
- [ ] Remediation plans and tasks
- [ ] Incident management
- [ ] Background jobs and reminders
- [ ] Real-time notifications
- [ ] Audit event search

## Milestone 6 — AI assistance
- [ ] Provider abstraction and prompt/version management
- [ ] Document extraction pipeline
- [ ] Evidence mapping suggestions with confidence and citations
- [ ] Human review and approval
- [ ] AI usage limits, redaction, and audit trail

## Milestone 7 — Production readiness
- [ ] Unit, integration, and end-to-end tests
- [ ] Docker and CI pipeline
- [ ] Monitoring, error tracking, and health checks
- [ ] Backup/restore and retention procedures
- [ ] Threat model and security review
- [ ] Deployment documentation
