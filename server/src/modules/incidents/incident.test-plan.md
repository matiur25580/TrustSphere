# Incident API test plan

The MongoDB-backed integration suite in `../findings/finding.integration.test.ts` includes incident coverage.

- [x] Analyst can create an incident linked to an in-tenant vendor and finding.
- [x] Viewer can read incident details but cannot create incidents.
- [x] A different tenant cannot read the incident.
- [x] Incident moves through triage, investigation, containment, recovery, resolution and owner/admin closure.
- [x] Containment cannot be declared without a containment plan.
- [x] Analyst cannot close an incident.
- [x] Activity history records containment and closure.
- [x] Summary endpoint is tenant scoped.
- [x] Cross-tenant vendor references are rejected; foreign finding and assignee cases still need explicit assertions.
- [ ] Concurrent transition behavior and event/write consistency are verified.
- [ ] Browser-level incident workflow is tested.

Run `npm run test --workspace server` from the repository root. The current GitHub Actions run passed typecheck, production build and the MongoDB-backed API integration suite. Browser-level workflow tests and the remaining unchecked cases are still outstanding.
