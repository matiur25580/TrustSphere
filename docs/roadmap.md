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
- [ ] Cross-tenant isolation tests

## Milestone 2 — Vendor lifecycle
- [ ] Vendor CRUD and server-side pagination (implemented; API verification pending)
- [ ] Vendor classification and criticality (implemented; scoring review pending)
- [ ] Lifecycle status and activity timeline
- [ ] Vendor contact and service records (basic profile fields implemented; verification pending)

## Milestone 3 — Assessments and risk
- [ ] Configurable questionnaires
- [ ] Answer submission and review
- [ ] Versioned, explainable risk scoring
- [ ] Findings and risk history
- [ ] Human approval workflow

## Milestone 4 — Compliance and evidence
- [ ] Framework and control library
- [ ] Evidence metadata and private file storage
- [ ] Control-to-evidence mapping
- [ ] Gap tracking and review history

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
