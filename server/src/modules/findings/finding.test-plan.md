# Findings & Remediation Security Test Plan

- Verify unauthenticated requests are rejected.
- Verify viewer can read but cannot create, update, transition or accept findings.
- Verify every read/write query includes the active organization scope.
- Verify a user cannot generate findings from another tenant's assessment.
- Verify only No/Partial answers produce findings; Yes/Not applicable never do.
- Verify repeated generation is idempotent under the unique organization/assessment/question index.
- Verify unknown question IDs and findings without a No/Partial response are rejected.
- Verify pagination is bounded to 50 and filters cannot widen tenant scope.
- Verify validation requires a remediation plan, owner and due date.
- Verify only owners/admins can validate or accept residual risk.
- Verify the finding creator cannot validate their own remediation.
- Verify invalid lifecycle transitions are rejected and event history records actor, tenant and transition.
- Exercise duplicate-key races and concurrent transitions against MongoDB.
- Verify event creation and finding mutation failure behavior; add transaction/outbox semantics before claiming atomic auditability.
