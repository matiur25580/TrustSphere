# Vendor Security Assessment Module

## Scope

The assessment module adds a versioned vendor security baseline, tenant-scoped assessment records, response validation, deterministic category-weighted scoring, owner/admin review, and append-only application event history.

## Baseline template

Template ID: `trustsphere-vendor-security-baseline`; version: `1`.

Eight required questions cover Governance, Identity & access, Data protection, and Resilience. Each assessment stores a full template snapshot so later code changes do not silently rewrite questionnaires already issued. The current template is versioned in source code; tenant-authored template management and publishing UI are not implemented.

## Scoring model

Model ID: `vendor-security-risk-v1`.

- Yes: 0 risk points
- Partial: 50 risk points
- No: 100 risk points
- Not applicable: excluded from the answered-weight denominator
- Each question has a positive integer weight; category and overall scores are weighted averages rounded to the nearest integer.
- Bands: low 0–34, medium 35–59, high 60–79, critical 80–100.

Category breakdown returns its score, answered weight, and total template weight. The score is a questionnaire-based triage indicator, not a formal audit result, security certification, or regulatory determination. It is kept separate from the vendor directory's inherent-risk score.

## Lifecycle

`draft → in_progress → submitted → approved | rejected`

Responses can only be edited before submission. Required questions must have an answer before submit. Owners and admins may approve or reject a submitted assessment; analysts can prepare and submit it but cannot make the final review decision.

## Evidence references

Responses may include evidence metadata: filename, MIME type, size, SHA-256 checksum, and an opaque relative `storageKey`. No file bytes are accepted or served by this module. A private object-storage integration must enforce tenant-scoped object authorization, upload constraints, malware scanning, and short-lived access URLs before real evidence is used.

## Event history

The API appends a separate event document for creation, response saves, submission, and review decisions. No update/delete endpoint is exposed for events. This is application-level append-only behavior, not tamper-proof storage. Event creation and the related assessment write are not yet atomic; production use needs transaction/outbox design, retention policy, and protected audit export.

## API

See the root README for routes. All handlers use the shared authentication and active-membership tenant middleware. Assessment and linked vendor lookups include the active organization ID in their query filters.

## Testing

Run `npm run test --workspace server` for deterministic scoring unit tests. The companion security test plan lists required API and tenant-isolation tests; these require a test database and authenticated fixtures.
