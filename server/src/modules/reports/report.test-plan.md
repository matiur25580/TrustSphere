# Reporting API test plan

The MongoDB-backed API integration suite in `../findings/finding.integration.test.ts` contains reporting coverage.

- [x] Viewer role can read the reporting overview through `reports:read`.
- [x] Overview totals reflect persisted vendor, assessment and finding records in the selected range.
- [x] High-risk vendor and finding lifecycle distributions are returned.
- [x] Compliance coverage reflects tenant control implementation state.
- [x] Daily trend payload is returned for the requested range.
- [x] A different tenant receives only its own empty-state metrics and zero control coverage.
- [x] CSV export returns a CSV content type and summary/trend rows.
- [x] Missing authentication is rejected.
- [ ] Unsupported range values are explicitly covered by an automated assertion.
- [ ] Large-tenant aggregation performance and query plans are benchmarked.
- [ ] Browser print-to-PDF layout is verified on desktop and mobile.

Run `npm run test --workspace server` from the repository root. These tests are committed but must pass in GitHub Actions before they are considered verified.
