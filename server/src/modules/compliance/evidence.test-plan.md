# Compliance evidence security test plan

The following cases are covered in the MongoDB-backed API integration suite unless marked pending.

- [x] Analyst can upload a valid PDF and receive a checksum and pending-review record.
- [x] Browser-supplied filenames are reduced to a safe display name.
- [x] Storage keys are not exposed in upload/list/review responses.
- [x] A spoofed MIME declaration with invalid file content is rejected.
- [x] Viewer can list evidence but cannot download a pending file.
- [x] Another tenant cannot list or download the evidence.
- [x] Owner can independently approve evidence uploaded by an analyst.
- [x] Viewer can download approved evidence.
- [x] Uploaders cannot approve their own evidence.
- [x] Expired approved evidence transitions to expired and download returns HTTP 410.
- [x] Upload, approval and download activity events are recorded.
- [ ] Oversized upload returns HTTP 413.
- [ ] Upload rate limit behavior is verified under repeated requests.
- [ ] Filesystem permission and restart persistence are verified in the target deployment environment.
- [ ] Malware scanning, quarantine and content-disarm behavior are implemented.
- [ ] Object-storage adapter, backup/retention and orphan reconciliation are implemented.

Run `npm run test --workspace server` from the repository root. The automated cases are committed but must still pass in CI before being treated as verified.
