# Identity and tenant security test plan

The following cases should be automated before production use:

## Registration and login
- Reject malformed payloads and passwords shorter than 12 characters.
- Normalize email addresses and reject duplicate accounts.
- Verify password hashes are stored, never plaintext.
- Return the same invalid-credentials response for unknown email and wrong password.
- Do not issue tokens to suspended accounts.

## Session lifecycle
- Access tokens expire after 15 minutes and validate issuer, audience, and token purpose.
- Refresh tokens are random, stored only as SHA-256 hashes, and delivered in HttpOnly cookies.
- Refresh rotates the token; the previous token cannot be reused.
- Logout revokes the current refresh session.
- Expired, revoked, malformed, and missing refresh tokens are rejected.
- Refresh and logout reject untrusted browser origins.

## Tenant isolation and authorization
- A user cannot select an organization without an active membership.
- A suspended organization or membership cannot be used.
- Every tenant-scoped query must include the resolved organization ID.
- Viewer cannot write; analyst cannot administer users; admin cannot exceed owner privileges.
- Cross-tenant object identifiers must never bypass tenant-scoped lookups.

## Operational checks
- Exercise concurrent refresh attempts to verify one-time token rotation.
- Verify rate limits, audit events, and security headers.
- Test with a MongoDB replica set if multi-document transactions are introduced later.
