# Identity & Access Implementation MVP

## Scope

This implementation covers the backend MVP for `IdentityAccessModule` only:

- registration
- login
- logout
- refresh token rotation foundation
- email verification skeleton
- password reset skeleton
- 2FA readiness skeleton
- session persistence
- login-attempt tracking
- temporary lockout foundation
- audit emission through the existing audit contract shape

It does not implement:

- academic workflows
- email transport
- full TOTP setup/verification
- frontend forms
- complete authorization middleware for protected business routes

## Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/request-password-reset`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/verify-email`

## Notes

- new users are created in `INVITED` state and become `ACTIVE` after email verification
- default student-role assignment is attempted if a `student` role exists in the target department
- refresh tokens are stored hashed in `Session.refreshTokenHash`
- cookie delivery is ready for `httpOnly` refresh-token usage, while response-body fallback still exists for development/testing
- current refresh-cookie behavior uses `SameSite=lax`; production should prefer `SameSite=strict` where UX allows or add a CSRF-token strategy for refresh flows
- email verification and password-reset endpoints return raw tokens only outside production because mail delivery is still a skeleton
- suspicious login events are recorded as a placeholder when lockout threshold is exceeded
- auth endpoints use a stricter throttler profile based on the existing auth rate-limit config

## Known MVP Limitations

- email transport is not implemented; verification and reset rely on skeleton token issuance only
- 2FA is readiness-only and does not yet implement TOTP enrollment, challenge, backup codes, or recovery UX
- CSRF protections for cookie-based refresh are documented but not fully implemented
- device trust, device naming, and broader session-management UX are still minimal
- refresh-token revocation is session-based but does not yet include richer anomaly response flows
- suspicious login handling is placeholder-only and does not yet enforce adaptive challenge workflows
- bcrypt is used for the MVP; an Argon2 migration is still recommended for production hardening

## Production Hardening Checklist

- implement real email delivery for verification, password reset, and security notifications
- add full 2FA flows, including enrollment, verification, backup recovery, and step-up enforcement
- harden refresh-cookie CSRF protection with `SameSite=strict` where possible or a dedicated CSRF token strategy
- confirm reverse-proxy and platform rate limiting align with the Nest auth throttler profile
- migrate password hashing to Argon2 if operationally feasible
- expand device and session management, including user-visible session listing and selective revocation
- add stronger suspicious-login detection and response workflows
- move development token fallbacks out of API responses in production environments
