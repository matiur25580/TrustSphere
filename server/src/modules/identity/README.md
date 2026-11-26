# Identity module

This module provides account registration, login, refresh-session rotation, logout, identity lookup, organization membership, tenant context, and role-based permission middleware.

## API

- `POST /api/v1/auth/register` — create a user, organization, and owner membership.
- `POST /api/v1/auth/login` — authenticate and return an access token plus organization memberships.
- `POST /api/v1/auth/refresh` — rotate the HttpOnly refresh cookie and return a new access token.
- `POST /api/v1/auth/logout` — revoke the current refresh session.
- `GET /api/v1/auth/me` — return the authenticated identity and memberships.
- `GET /api/v1/tenant/context` — example tenant-protected endpoint; requires a bearer token and `x-organization-id`.

Access tokens are short-lived bearer JWTs. Refresh tokens are opaque random values; only their SHA-256 hashes are persisted. Browser refresh cookies use HttpOnly and SameSite=Lax, with Secure enabled in production.

Registration uses compensating cleanup for partial provisioning rather than assuming standalone MongoDB supports transactions. For financial or regulated production deployments, revisit this workflow with a replica-set transaction/outbox design and idempotency protection.
