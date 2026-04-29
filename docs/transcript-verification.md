# Transcript & Verification Foundation

## Strategy Explanation

The transcript and verification foundation sits downstream from academic records, result processing, and published GPA/CGPA aggregates. It creates official, immutable transcript snapshots from published academic outcomes and exposes a separate public-verification surface that reveals only the minimum safe confirmation data.

This design follows these rules:

- every transcript and verification record is department-scoped
- transcripts are generated only from published or locked result-processing records
- `TranscriptRecord` is the student-level official transcript aggregate
- `TranscriptVersion` is the immutable issuance snapshot
- term summaries and course lines are copied from published result and GPA/CGPA sources rather than rendered live from mutable tables
- verification tokens are isolated public artifacts and always expire or may be revoked
- revocation is append-oriented and auditable
- seal and signature metadata are stored separately from rendering assets and PDF generation

This phase does not implement PDF rendering, QR image rendering, certificate generation, or user-facing pages.

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
- Stores opaque public code, token lifecycle, expiry, verification count, and safe public summary payload
- Acts as the QR/public URL lookup anchor

### TranscriptRevocationRecord

- Append-only transcript revocation trail
- Stores reason, requester/applier metadata, timestamps, and whether token invalidation applies
- Can target the transcript record as a whole and optionally a specific version

### TranscriptSealMetadata

- One-to-one metadata companion for a transcript version
- Stores signature algorithm, signer identity, seal reference, payload digest, and other signing metadata
- Keeps signature and seal concerns separate from rendering implementation

## Prisma Schema Additions

Added enums:

- `TranscriptRecordStatus`
- `TranscriptVersionStatus`
- `TranscriptVerificationTokenStatus`
- `TranscriptRevocationStatus`

Added models:

- `TranscriptRecord`
- `TranscriptVersion`
- `TranscriptTermSummary`
- `TranscriptCourseLine`
- `TranscriptVerificationToken`
- `TranscriptRevocationRecord`
- `TranscriptSealMetadata`

Added relations on existing models:

- `Department`
  - `transcriptRecords`
  - `transcriptVersions`
  - `transcriptTermSummaries`
  - `transcriptCourseLines`
  - `transcriptVerificationTokens`
  - `transcriptRevocationRecords`
  - `transcriptSealMetadatas`
- `User`
  - `transcriptRecordsAsStudent`
  - `transcriptRecordsGenerated`
  - `transcriptVersionsGenerated`
  - `transcriptVersionsIssued`
  - `transcriptVerificationTokensIssued`
  - `transcriptRevocationsRequested`
  - `transcriptRevocationsApplied`
  - `transcriptRevocationsRejected`
- `AcademicTerm`
  - `transcriptTermSummaries`
- `CourseOffering`
  - `transcriptCourseLines`
- `ResultRecord`
  - `transcriptCourseLines`
- `GPARecord`
  - `transcriptTermSummaries`
- `CGPARecord`
  - `transcriptVersions`

Representative Prisma additions:

```prisma
enum TranscriptRecordStatus {
  DRAFT
  GENERATED
  ISSUED
  REVOKED
  ARCHIVED
}

enum TranscriptVersionStatus {
  GENERATED
  ISSUED
  SUPERSEDED
  REVOKED
}

enum TranscriptVerificationTokenStatus {
  ACTIVE
  EXPIRED
  REVOKED
}

enum TranscriptRevocationStatus {
  REQUESTED
  APPLIED
  REJECTED
}

model TranscriptRecord {
  id                  String                 @id @default(cuid())
  departmentId        String                 @map("department_id")
  studentUserId       String                 @map("student_user_id")
  transcriptNumber    String                 @map("transcript_number")
  status              TranscriptRecordStatus @default(DRAFT)
  latestVersionNumber Int                    @default(0) @map("latest_version_number")
}

model TranscriptVersion {
  id                         String                  @id @default(cuid())
  departmentId               String                  @map("department_id")
  transcriptRecordId         String                  @map("transcript_record_id")
  sourceCgpaRecordId         String?                 @map("source_cgpa_record_id")
  versionNumber              Int                     @map("version_number")
  status                     TranscriptVersionStatus @default(GENERATED)
  studentSnapshotJson        Json                    @map("student_snapshot_json")
  programSnapshotJson        Json?                   @map("program_snapshot_json")
  departmentSnapshotJson     Json?                   @map("department_snapshot_json")
  printStructureJson         Json?                   @map("print_structure_json")
  cumulativeAttemptedCredits Decimal?               @db.Decimal(6, 2) @map("cumulative_attempted_credits")
  cumulativeEarnedCredits    Decimal?               @db.Decimal(6, 2) @map("cumulative_earned_credits")
  cgpaSnapshot               Decimal?               @db.Decimal(4, 2) @map("cgpa_snapshot")
  academicStandingStatus     String?                @map("academic_standing_status")
  completionStatus           String?                @map("completion_status")
  graduationStatus           String?                @map("graduation_status")
}

model TranscriptTermSummary {
  id                     String   @id @default(cuid())
  transcriptVersionId    String   @map("transcript_version_id")
  academicTermId         String?  @map("academic_term_id")
  sourceGpaRecordId      String?  @map("source_gpa_record_id")
  sortOrder              Int      @default(0) @map("sort_order")
  termCodeSnapshot       String   @map("term_code_snapshot")
  termNameSnapshot       String   @map("term_name_snapshot")
  attemptedCredits       Decimal? @db.Decimal(6, 2) @map("attempted_credits")
  earnedCredits          Decimal? @db.Decimal(6, 2) @map("earned_credits")
  qualityPoints          Decimal? @db.Decimal(8, 2) @map("quality_points")
  termGpaSnapshot        Decimal? @db.Decimal(4, 2) @map("term_gpa_snapshot")
  cumulativeCgpaSnapshot Decimal? @db.Decimal(4, 2) @map("cumulative_cgpa_snapshot")
}

model TranscriptCourseLine {
  id                      String   @id @default(cuid())
  transcriptVersionId     String   @map("transcript_version_id")
  transcriptTermSummaryId String   @map("transcript_term_summary_id")
  resultRecordId          String?  @map("result_record_id")
  courseOfferingId        String?  @map("course_offering_id")
  sortOrder               Int      @default(0) @map("sort_order")
  courseCodeSnapshot      String   @map("course_code_snapshot")
  courseTitleSnapshot     String   @map("course_title_snapshot")
  creditHoursSnapshot     Decimal  @db.Decimal(4, 2) @map("credit_hours_snapshot")
  letterGrade             String?  @map("letter_grade")
  gradePoint              Decimal? @db.Decimal(4, 2) @map("grade_point")
}

model TranscriptVerificationToken {
  id                 String                            @id @default(cuid())
  transcriptVersionId String                           @map("transcript_version_id")
  publicCode         String                            @unique @map("public_code")
  status             TranscriptVerificationTokenStatus @default(ACTIVE)
  publicSummaryJson  Json?                             @map("public_summary_json")
  expiresAt          DateTime?                         @map("expires_at")
  revokedAt          DateTime?                         @map("revoked_at")
}

model TranscriptRevocationRecord {
  id                  String                     @id @default(cuid())
  transcriptRecordId  String                     @map("transcript_record_id")
  transcriptVersionId String?                    @map("transcript_version_id")
  status              TranscriptRevocationStatus @default(REQUESTED)
  reason              String
}

model TranscriptSealMetadata {
  id                  String  @id @default(cuid())
  transcriptVersionId String  @unique @map("transcript_version_id")
  sealType            String  @map("seal_type")
  signatureAlgorithm  String? @map("signature_algorithm")
  signatureReference  String? @map("signature_reference")
  sealReference       String? @map("seal_reference")
  payloadDigest       String? @map("payload_digest")
}
```

## Enums

### Transcript Records

- `DRAFT`
- `GENERATED`
- `ISSUED`
- `REVOKED`
- `ARCHIVED`

### Transcript Versions

- `GENERATED`
- `ISSUED`
- `SUPERSEDED`
- `REVOKED`

### Verification Tokens

- `ACTIVE`
- `EXPIRED`
- `REVOKED`

### Revocation Records

- `REQUESTED`
- `APPLIED`
- `REJECTED`

## Snapshot / Computation Model

### Upstream Data Eligibility

- transcript generation may read only `ResultRecord` entries that are already `PUBLISHED` or `LOCKED`
- term aggregates come from published `GPARecord`
- cumulative aggregate comes from published `CGPARecord`
- draft, computed-only, verified-only, amended-but-unpublished, or revoked academic data must not feed an official transcript version

### Transcript Version Snapshot

- transcript generation creates a new `TranscriptVersion`
- the version copies required student, department, program, standing, completion, and printable layout fields into snapshot JSON columns
- once generated, version snapshot fields are immutable; later corrections create a new version rather than editing the old one

### Term Summaries

- one `TranscriptTermSummary` per included academic term
- each summary snapshots:
  - term code and name
  - attempted credits
  - earned credits
  - quality points
  - term GPA
  - cumulative CGPA after the term
  - academic standing or status for that term

### Course Lines

- each published course result becomes one `TranscriptCourseLine`
- each line snapshots:
  - course code and title
  - credit hours
  - normalized percentage if the department wishes to expose it
  - letter grade
  - grade point
  - quality points
  - completion/pass status
  - whether the line counts toward GPA

### Cumulative Credits and CGPA

- transcript version stores cumulative attempted credits, cumulative earned credits, and CGPA snapshot directly on the version for fast issuance and stable verification
- these values are derived from published `CGPARecord` and validated against included course lines during generation

### Academic Standing and Completion Foundation

- `academicStandingStatus` is a snapshot-ready string foundation for values such as `GOOD_STANDING`, `PROBATION`, or `SUSPENDED`
- `completionStatus` is a snapshot-ready string foundation for values such as `IN_PROGRESS`, `COMPLETED`, or `REQUIREMENTS_PENDING`
- `graduationStatus` is a snapshot-ready string foundation for values such as `NOT_ELIGIBLE`, `ELIGIBLE`, or `AWARDED`
- these remain snapshot fields now so later academic-policy services can populate them without redesigning transcript storage

## Rules and Constraints

- transcripts are generated only from published or locked results
- transcript version snapshots are immutable after creation
- new academic corrections require a new version, not in-place mutation of an issued version
- QR and public verification resolve through `TranscriptVerificationToken.publicCode`
- public verification must expose only safe summary data
- verification tokens expire independently of transcript record creation; omitted expiry defaults to 72 hours from issue, and supplied expiry must be in the future
- transcript revocation requires reason capture and append-only revocation records
- transcript revocation may invalidate all active verification tokens for the affected transcript or version
- digital signature and seal metadata are stored separately from rendering output
- transcript rendering and PDF generation are intentionally deferred

## Authorization and Audit Notes

### Authorization

- generate transcript:
  - `department_admin`
  - exam office or equivalent administrative records authority
  - internal service principal for scheduled generation if later introduced
- issue transcript:
  - `department_admin`
  - exam office or equivalent administrative records authority
  - step-up required
- revoke transcript:
  - `department_admin`
  - exam office or equivalent administrative records authority
  - step-up required
- view own transcript:
  - `student` for own transcript only
  - step-up recommended based on current identity-access guidance
- read department transcript:
  - `department_admin`
  - `auditor`
- public verification:
  - no authenticated department role
  - isolated `public_verification` scope only

### Mandatory Audit Events

- transcript generated
- transcript version generated
- transcript issued
- verification token issued
- public verification accessed
- verification token expired
- transcript revoked
- denied public verification attempt for expired or revoked token

## Public Verification Safety Model

- public verification runs in isolated public-verification context
- it must not load or return full student profiles, internal IDs, grades history beyond the intended safe summary, audit metadata, or departmental admin details
- recommended safe payload:
  - transcript number
  - student display name snapshot
  - issuing department name snapshot
  - issue date
  - version number
  - overall status such as valid or revoked
  - cumulative earned credits snapshot
  - CGPA snapshot
  - completion or graduation status snapshot
- optional course or term detail should be explicitly controlled by department policy, not assumed by default
- revoked or expired verification tokens should return only a minimal invalid-status response
- public verification is unauthenticated but rate limited with the existing NestJS throttler guard

## NestJS Scaffolding

Folder shape:

```text
transcript-verification/
  application/
    ports/
    services/
  contracts/
  domain/
```

Public contracts:

- `TranscriptRecord`
- `TranscriptVersion`
- `TranscriptTermSummary`
- `TranscriptCourseLine`
- `TranscriptVerificationToken`
- `TranscriptRevocationRecord`
- `TranscriptSealMetadata`

Repository boundary:

- repository port owns transcript records, immutable version snapshots, term summaries, course lines, verification tokens, revocation records, and seal metadata
- result, GPA, and CGPA source reads must come through exported contracts or dedicated query boundaries later rather than by embedding cross-module table logic in the service contract

Service boundary:

- service orchestrates transcript generation, version issuance, verification-token issuance, public verification lookup, revocation, and self-view authorization-aware reads
- service must preserve immutable snapshot semantics for issued versions

Policy names:

- `transcript-verification.transcript.read`
- `transcript-verification.transcript.generate`
- `transcript-verification.transcript.issue`
- `transcript-verification.transcript.revoke`
- `transcript-verification.transcript.self-read`
- `transcript-verification.verification.read-public`
- `transcript-verification.verification.issue`

Audit events:

- `transcript-verification.transcript.generated`
- `transcript-verification.transcript-version.generated`
- `transcript-verification.transcript.issued`
- `transcript-verification.verification-token.issued`
- `transcript-verification.verification.public-accessed`
- `transcript-verification.verification-token.expired`
- `transcript-verification.transcript.revoked`

Implemented scaffolding files:

- `apps/api/src/modules/transcript-verification/contracts/transcript-verification.contracts.ts`
- `apps/api/src/modules/transcript-verification/application/ports/transcript-verification.repository.port.ts`
- `apps/api/src/modules/transcript-verification/application/services/transcript-verification.service.ts`
- `apps/api/src/modules/transcript-verification/domain/transcript-verification.policy-names.ts`
- `apps/api/src/modules/transcript-verification/domain/transcript-verification.audit-events.ts`

## Document Content

This document intentionally establishes only the transcript and public verification foundation. PDF rendering, QR image generation, transcript UI, certificate generation, and end-to-end issuance workflows remain out of scope until this snapshot, verification, and revocation model is stable.
