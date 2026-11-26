# Vendor Module Security Test Plan

- [ ] A user without a bearer token receives 401.
- [ ] A user without an active membership for the selected organization cannot access the module.
- [ ] A viewer can list and read vendors but cannot create, update, or archive.
- [ ] An analyst/admin/owner can create and update vendors.
- [ ] A vendor ID belonging to another organization returns 404 on read, update, and archive.
- [ ] List, summary, and search results never include another organization's records.
- [ ] Invalid IDs, enum values, emails, URLs, page sizes, and empty patches are handled safely.
- [ ] Search strings are treated literally; sort fields are allow-listed.
- [ ] Risk score and band are recalculated on changes to criticality, sensitivity, or access.
- [ ] Duplicate normalized vendor names within one organization return a conflict.
- [ ] Archived vendors disappear from normal list and summary responses.
