# Vendor Assessment Security and Quality Test Plan

## Automated unit tests

- [x] Weighted scoring for yes/partial/no answers.
- [x] Not-applicable exclusion from weighted denominator.
- [x] Empty response set behavior.
- [x] Risk-band boundary behavior.

## API and tenant isolation tests

- [ ] Missing/invalid bearer token returns 401.
- [ ] No active membership for `x-organization-id` is denied.
- [ ] Viewer can list/read templates and assessments but cannot create, save, submit, or review.
- [ ] Analyst can create, save, and submit; analyst cannot approve/reject.
- [ ] Owner/admin can approve/reject only submitted assessments.
- [ ] Assessment creation rejects a vendor from another tenant or an archived vendor.
- [ ] Cross-tenant assessment IDs return 404 on detail, response, submit, and review.
- [ ] List, summary, and event history never expose another tenant's records.
- [ ] Client-supplied organization IDs in request bodies are rejected/ignored; tenant comes only from verified middleware.
- [ ] Unknown question IDs and invalid answer enums are rejected.
- [ ] Submission rejects missing required answers.
- [ ] Submitted and reviewed assessments cannot be edited or submitted again.
- [ ] Evidence keys reject absolute paths, traversal, dots, unsupported characters, oversized metadata, and invalid checksums.
- [ ] Evidence keys outside the active organization namespace are rejected.
- [ ] Event history has no API mutation route and records actor, action, tenant, and timestamp.
- [ ] Concurrent submit/review requests do not produce invalid lifecycle transitions.
- [ ] Duplicate responses for the same question are normalized to one current response.
- [ ] Pagination is bounded and status/vendor filters are tenant-scoped.

## Operational and integration tests

- [ ] MongoDB indexes are created and duplicate/collision behavior is verified.
- [ ] Event insert failure and assessment update failure behavior is covered; introduce a transaction/outbox before relying on atomic audit guarantees.
- [ ] Private object-storage upload, download authorization, malware scanning, retention, and deletion workflows are tested before enabling actual evidence files.
- [ ] Client workflow is exercised for draft, in-progress, submitted, approved, and rejected states.
- [ ] TypeScript typechecks, production builds, and all unit/integration tests pass in CI.
