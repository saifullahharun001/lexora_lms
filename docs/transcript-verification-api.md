# Transcript & Verification API

This module implements transcript snapshots and public verification for Lexora LMS. It does not render PDFs, send notifications, or expose a frontend surface.

## Endpoints

All internal endpoints are versioned under `/api/v1` and require `AuthGuard`, `PolicyGuard`, and the listed policy.

| Method | Path | Policy |
| --- | --- | --- |
| `POST` | `/transcripts` | `transcript-verification.transcript.create` |
| `GET` | `/transcripts` | `transcript-verification.transcript.read` |
| `GET` | `/transcripts/:id` | `transcript-verification.transcript.read` |
| `POST` | `/transcripts/:id/issue` | `transcript-verification.transcript.issue` |
| `POST` | `/transcripts/:id/revoke` | `transcript-verification.transcript.revoke` |
| `GET` | `/transcripts/:id/versions` | `transcript-verification.version.read` |
| `GET` | `/transcript-versions/:id` | `transcript-verification.version.read` |
| `POST` | `/transcripts/:id/verification-token` | `transcript-verification.token.create` |
| `POST` | `/transcript-seals` | `transcript-verification.seal.manage` |
| `GET` | `/transcript-seals` | `transcript-verification.seal.read` |
| `PATCH` | `/transcript-seals/:id` | `transcript-verification.seal.manage` |

The public endpoint is intentionally unauthenticated:

| Method | Path | Guard |
| --- | --- | --- |
| `GET` | `/public/transcript-verification/:token` | none |

## Security Model

- Every internal repository query and state transition includes `departmentId`.
- Student reads are constrained in the service layer to `principal.actorId`; a student cannot use another `studentUserId` or direct id lookup to read another transcript.
- Teachers are explicitly blocked from issue and revoke operations even if a policy is accidentally granted.
- Issue, revoke, token creation, and seal management are limited to `department_admin` or `exam_office` roles, plus the route policy check.
- Transcript generation accepts only `PUBLISHED`, `LOCKED`, or `AMENDED` result records.
- State changes use `updateMany` plus scoped `findFirst` transaction patterns.
- Revocation is append-based through `TranscriptRevocationRecord` and revokes the active issued version and active verification tokens when requested.
- Transcript versions have no update endpoint. They are generated as snapshots and then only move through issue/supersede/revoke status transitions.

## Public Verification Safety

Verification tokens are opaque random values. The existing `publicCode` column stores the token digest, not the raw token, and verification compares digests with constant-time comparison.

The public endpoint never returns transcript JSON, term summaries, course lines, student profile data, GPA details, or department-internal ids. It returns only:

- validity and token status
- safe public summary: transcript number, status, version number, issued timestamp
- seal metadata needed to validate the public artifact digest

Expired, revoked, superseded, or revoked-transcript tokens return invalid status with the same safe summary shape.

## Snapshot Assumptions

The MVP snapshot is generated from result records already published, locked, or amended. It captures:

- student display snapshot
- department and program snapshots
- term summaries from GPA records when present
- course lines from result records
- cumulative CGPA fields from the latest CGPA record when present
- `printStructureJson` as a future rendering placeholder

No transcript layout is hard-coded. PDF rendering can consume version snapshots later without mutating issued transcript versions.

## Future Notes

- A future migration can rename `publicCode` to `publicCodeHash` for clearer schema semantics.
- Add renderer-specific seal payload digest validation once PDF rendering is introduced.
- Keep notification hooks out of this module until notification product behavior is defined.
- Preserve department scoping and append-only revocation when adding batch transcript workflows.
