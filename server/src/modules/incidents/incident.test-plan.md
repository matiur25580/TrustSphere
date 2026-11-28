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


## Alert ingestion and SLA coverage

- [x] Authenticated tenant-scoped alert ingestion creates a linked incident.
- [x] Duplicate source events increment occurrence count without creating duplicate incidents.
- [x] Severity-specific response, containment and resolution deadlines are assigned.
- [x] Viewer can read alerts but cannot ingest them.
- [x] Other tenants cannot read the organization's alert records.
- [x] Caller-supplied organization and incident identifiers are rejected.
- [ ] Recovery of an alert left in an in-progress state after process termination.
- [ ] Automated SLA breach detection, escalation and notification delivery.
- [ ] External SIEM/EDR webhook authentication and source-specific signature verification.

Run `npm run test --workspace server` from the repository root.
