# Transcript and Verification

**Classification:** implemented snapshot/verification API foundation with recorded server/runtime checks; full rendering/issuance product remains partial. See [runtime evidence](runtime-test-checklist.md#current-verified-baseline-index).

## Durable snapshot boundary

Snapshot student, department, programme, term/course details, source result IDs, credits, grade/quality points, GPA/CGPA, standing, completion and graduation status at issuance-version creation. Never render an issued transcript from mutable live marks. Later corrections create a new version and preserve prior lineage; academic snapshot fields cannot be edited in place.

`printStructureJson` remains a snapshot field for future rendering. No transcript layout is hard-coded by the API; a future renderer must consume the immutable version without changing it.

The authoritative target source is the published-result registry described in [Result Domain](result-domain.md). Draft, computed-only, verified-only, revoked or amended-but-unpublished results must not feed an official transcript.

**Known foundation mismatch — implemented, source-inspected:** the existing service accepts PUBLISHED, LOCKED and AMENDED ResultRecord statuses and snapshots the latest available GPA/CGPA records. This matches the old API, while the old foundation excluded amended-but-unpublished sources. Do not infer Controller publication or registry integration from AMENDED status. Align issuance eligibility with explicit publication/version evidence when implementing the new result boundary; no code changes are made here.

## Domain Model

### TranscriptRecord

- Canonical transcript aggregate for one student within one department
- Owns the transcript number, lifecycle state, latest version counter, and transcript-level revocation state
- Represents the durable administrative identity of the transcript across versions

### TranscriptVersion

- Immutable transcript snapshot for one issuance version
- Stores student, program, department, print structure, cumulative credits, CGPA snapshot, academic standing, completion status, and graduation-status foundation
- Once generated, its academic snapshot data must not be edited in place

### TranscriptTermSummary

- Child of `TranscriptVersion`
- Summarizes one academic term using published GPA and term result history
- Stores term code/name snapshot, attempted credits, earned credits, quality points, term GPA, cumulative CGPA after the term, and academic standing

### TranscriptCourseLine

- Child of `TranscriptTermSummary` and `TranscriptVersion`
- Snapshot of one published course-level result on the transcript
- Stores course code/title, credit hours, percentage, letter grade, grade point, quality points, GPA inclusion flag, and completion status

### TranscriptVerificationToken

- Public verification artifact tied to one transcript version
- Stores the digest of the opaque public token in the legacy `publicCode` field, plus token lifecycle, expiry, verification count, and safe public summary payload
- Acts as the QR/public URL lookup anchor

### TranscriptRevocationRecord

- Append-only transcript revocation trail
- Stores reason, requester/applier metadata, timestamps, and whether token invalidation applies
- Can target the transcript record as a whole and optionally a specific version

### TranscriptSealMetadata

- One-to-one metadata companion for a transcript version
- Stores signature algorithm, signer identity, seal reference, payload digest, and other signing metadata
- Keeps signature and seal concerns separate from rendering implementation


## Lifecycle and authority

Record: DRAFT / GENERATED / ISSUED / REVOKED / ARCHIVED. Version: GENERATED / ISSUED / SUPERSEDED / REVOKED. Token: ACTIVE / EXPIRED / REVOKED. Revocation: REQUESTED / APPLIED / REJECTED. Lifecycle state updates do not authorize mutation of academic snapshots.

Generate/issue/revoke and token/seal management require applicable route policy and scoped records authority. Current role restriction is department_admin or exam_office for issue/revoke/token/seal writes. Teachers are explicitly barred from issue/revoke even with an accidentally granted policy. Students read only their own transcript/version; neither a supplied studentUserId nor direct object ID bypasses principal.actorId and department scope.

Revocation records append reason, requester/applier and timestamps, optionally targeting a version and invalidating its tokens. Target step-up requirements for issuance/revocation remain requirements; full challenge enforcement is pending.

## Current API and implemented safety

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

The public endpoint is intentionally unauthenticated, but rate limited with the existing NestJS
throttler guard:

| Method | Path | Guard |
| --- | --- | --- |
| `GET` | `/public/transcript-verification/:token` | `ThrottlerGuard` only |

## Pagination

The list endpoints below accept `limit` and `offset` query parameters. `limit` defaults to `50`
and is capped at `100`; `offset` defaults to `0`.

- `GET /transcripts`
- `GET /transcripts/:id/versions`

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

Verification tokens are always finite-lived. If `expiresAt` is omitted when issuing a token, the
API sets it to 72 hours from creation. If `expiresAt` is supplied, it must be in the future; past
or current timestamps are rejected.

The public endpoint never returns transcript JSON, term summaries, course lines, student profile data, GPA details, or department-internal ids. It returns only:

- validity and token status
- safe public summary: transcript number, status, version number, issued timestamp
- seal metadata needed to validate the public artifact digest

Expired, revoked, superseded, missing, or revoked-transcript tokens return the same minimal invalid
response shape and do not expose whether a token exists.


## Audit and remaining work

Generation, version creation, issuance, token issuance, verification access/denial/expiry, revocation and sensitive state changes require audit. Public verification has only isolated read authority and must not inherit session privileges. The current minimal response above supersedes the old foundation's broader suggested public display-name/CGPA summary.

**Pending:** PDF/print renderer, QR images, certificate generation, official layout, downloadable documents, signature/seal integration and renderer-specific payload-digest validation, complete issuance UI/public-verification frontend polish, and published-result registry consumption. Seal metadata is not proof of a working digital-signature renderer.

Token publicCode is a digest despite its legacy name; a future publicCodeHash rename is optional hardening. Batch workflows must preserve scoping, immutable snapshots and append-only revocation. Notification hooks require separately defined product behavior.
