# Summative Examination

**Current classification:** implemented and deployed; First/Second and comparison/Third/nearest-pair paths are functional/security runtime verified for their tested matrices (2026-09-01/02). Committee Member Review and Chairman /60 approval/final lock are **targeted authenticated server/runtime verified** (2026-09-18). Broader Summative product scope remains **partial / active backend development**.

Current evidence is in the [runtime index](runtime-test-checklist.md#current-verified-baseline-index); historical implementation/deployment campaigns remain in the [preserved source](legacy/phase-1/summative-examination.md).

## Academic Authority and Scope

Academic rule priority is:

1. current applicable LL.B. (Honours) Academic Ordinance;
2. formally approved University / Academic Committee / Department / Examination
   Committee / quality-assurance decisions;
3. approved curriculum;
4. consolidated teacher/assessment specification;
5. general site specification;
6. implementation defaults.

Historical teacher/consolidated specifications contain a three-member Examination Committee description.

The current committed Academic Ordinance is the higher academic authority and the
current implemented committee foundation follows the Ordinance-aligned four-person
composition:

- one Chairman;
- two Internal Members;
- one External Member from a similar programme of another public university.

This current Ordinance-backed composition supersedes conflicting older three-member
wording for current implementation decisions.

Historical specification text should remain preserved as historical evidence rather than silently deleted.

The External Member is represented through formal external identity metadata. The
External Member is not automatically modelled as an ordinary same-department Lexora
User and does not automatically receive digital marks authority.

## Explicitly Offline / Out of Scope

Lexora does not currently provide:

- online Summative examination delivery;
- question-paper drafting;
- question-paper upload or storage;
- question moderation;
- question-paper printing;
- physical answer-script storage;
- scanned answer-script upload;
- on-screen answer-script evaluation.

Question configuration stores structural metadata only. It must not become a question-paper store.

## Implemented Data Model

Implemented major models include:

- `Examination`;
- `ExaminationCourse`;
- `ExaminationCommittee`;
- `ExaminationCommitteeAssignment`;
- `ExaminationCourseExaminerAssignment`;
- `SummativeQuestionConfiguration`;
- `SummativeQuestionConfigurationItem`;
- `SummativeExaminationCandidate`;
- `SummativeExaminerMarkSubmission`;
- `SummativeExaminerQuestionMark`.

### ExaminationCourse

`ExaminationCourse` preserves authoritative academic snapshots including:

- department;
- Examination;
- academic programme;
- academic session;
- academic term;
- CourseOffering;
- optional StudentBatch;
- curriculum version;
- curriculum course;
- syllabus version;
- assessment template;
- exact Summative assessment component;
- Summative full mark;
- rule-version identity.

The Summative full mark is server-derived from the authoritative
`SUMMATIVE_EXAMINATION` assessment component. It must not be supplied as a trusted
client value.

### Examination Committee

Current formal seat model:

- `CHAIRMAN`;
- `MEMBER_1`;
- `MEMBER_2`;
- `EXTERNAL_MEMBER`.

Internal seats use an assigned internal User identity.

The External Member path stores formal external identity metadata and does not create
ordinary internal-user authority.

Assignment lifecycle/history is preserved.

### Examiner Assignment

Current managed Examiner seats are:

- `FIRST_EXAMINER`;
- `SECOND_EXAMINER`.

The Course Teacher is not automatically an Examiner.

An active same-department Teacher may be separately appointed as First or Second
Examiner even if that Teacher is not the Course Teacher.

The same active user cannot silently occupy both active Examiner seats for the same
governed course context.

Third Examiner is deliberately not represented as a permanent standing course-level
seat.

### Question Configuration

Question configuration is:

- dynamic;
- versioned;
- metadata-only;
- exact ExaminationCourse scoped;
- lockable;
- history-preserving.

Supported metadata includes:

- question label;
- optional sub-question label;
- display order;
- full mark;
- required/optional status;
- optional CLO identity;
- optional Bloom level;
- active state.

The model is not hard-coded to ten questions.

At lock time, the authoritative configured counted full-mark total must equal the
`ExaminationCourse.summativeFullMark`.

### Candidate Roster

`SummativeExaminationCandidate` is an internal roster foundation derived from an exact
approved Enrollment and StudentCurriculumAssignment relationship.

It preserves immutable scope references.

It is not yet a formal institutional exam-roll or physical answer-script reference
system.

### First/Second Examiner Marks

Implemented behavior includes:

- assignment-bound marking workspace;
- exact candidate access;
- exact question-configuration binding;
- question-wise Decimal marks;
- draft saving;
- exact zero preservation;
- explicit `null` draft clear;
- omitted field = unchanged;
- required-question enforcement;
- per-question full-mark enforcement;
- malformed/negative/excess-scale rejection;
- server-calculated final total;
- final `LOCKED` state;
- ordinary post-lock immutability;
- repeat finalization idempotency;
- no ordinary reopen path.

Submission identity includes:

- department;
- Examination;
- ExaminationCourse;
- candidate;
- Examiner assignment;
- Examiner seat;
- question-configuration version;
- submission version.

## Blindness and Separation of Duties

First and Second Examiner records are independent.

An Examiner workspace is resolved from the authenticated principal's own current
assignment and must not disclose the opposite Examiner's:

- assignment identity;
- seat;
- draft submission;
- locked submission;
- question marks;
- total.

Course Teacher status alone provides no Examiner authority.

Department Admin management authority does not provide Examiner marks-entry authority.

Teacher coarse marks permission alone is insufficient without an exact live Examiner
assignment.

## Authorization Model

Current Summative management permissions provisioned to the Law Department Admin role:

- `summative-examination.setup.manage_department`;
- `summative-examination.committee.manage_department`;
- `summative-examination.examiner-assignment.manage_department`.

Current marks-entry coarse permission provisioned to the Law Teacher role:

- `summative-examination.examiner-marks.enter_department`.

The marks-entry path additionally requires:

- authenticated principal;
- authenticated principal's real department;
- active User;
- active Teacher role;
- active unrevoked/unexpired UserRole;
- exact permission provenance;
- active unexpired exact Examiner assignment;
- exact ExaminationCourse scope;
- valid workflow/object state.

Wildcard role authority is intentionally insufficient for these exact sensitive
Summative management/marks policies.

## Department Isolation and Object Authorization

Summative operations must preserve the existing Lexora security boundary:

- authenticated principal department is authoritative;
- caller-supplied `x-department-id` cannot override a valid principal department;
- every sensitive read/write is department-scoped;
- direct out-of-scope object IDs fail safely;
- Examiner authority is assignment-scoped;
- Committee authority is assignment-scoped where implemented;
- frontend visibility is never treated as the security boundary.

No Summative implementation may weaken AuthGuard, PolicyGuard, `@RequirePolicy()`,
RequestContext, department isolation or object-level authorization.

## Transaction / Concurrency / Audit Design

Current sensitive services use transaction-aware patterns including:

- Serializable transactions where required;
- parent-first deterministic lock ordering;
- live authority revalidation inside protected transactions;
- bounded retry for recognised serialization conflicts;
- immutable/history-preserving records;
- transaction-coupled audit writes;
- fail-closed rollback when protected audit persistence fails.

The marks path additionally uses database-level protection for candidate identity,
submission identity, question-mark identity and locked evidence.


## Comparison, Third Examination and calculated evidence

### Comparison and Third-trigger rule

Persistent First/Second comparison evidence is now runtime verified.

The decision uses the absolute First/Second total difference against the authoritative
Summative full mark.

Third Examination is required at the inclusive threshold:

`>= 15%`

Verified runtime examples include:

- `50` vs `42` -> `13.333333%` -> no Third;
- `50` vs `41` -> `15%` -> Third required;
- `52` vs `40` -> `20%` -> Third required.

The rule is not based on an assumed course total of `100`.

### Third Examination authority model

Third Examiner remains a candidate/referral-scoped authority.

Third Examiner is not a permanent standing `ExaminationCourse` Examiner seat.

Verified runtime authority includes:

- exact qualifying comparison required;
- First Examiner cannot become Third for the same governed candidate context;
- Second Examiner cannot become Third for the same governed candidate context;
- duplicate active referral blocked;
- unrelated Teacher receives no referred-candidate authority;
- direct foreign candidate/referral access fails safely;
- authenticated department scope cannot be overridden by forged
  `x-department-id`;
- Third Examiner remains blind to First/Second marks and totals.

### Third referral expiry

The active referral deadline is now part of the live authorization boundary.

Verified behavior:

- unexpired `ASSIGNED` referral grants exact Third workspace/read authority;
- expired referral no longer appears in the Third workspace;
- expired direct read returns safe not-found;
- expired mark save is denied;
- expired finalisation is denied;
- expired authority creates no Third academic evidence;
- controlled replacement transitions the predecessor from `ASSIGNED` to `EXPIRED`;
- successor uses the next assignment version;
- predecessor history/evidence remains preserved;
- structural expiry and successor audits are required.

### Third marking

Runtime verified:

- question-wise Third marks;
- DRAFT creation;
- required-question enforcement;
- exact referral/question-configuration binding;
- final LOCKED state;
- server-calculated Third total;
- ordinary post-lock mutation rejection;
- repeated-finalisation idempotency.

PostgreSQL protections additionally enforce LOCKED Third submission/question-mark
immutability.

### Nearest-pair calculation

The three-total calculation is implemented and runtime verified.

For three totals:

- `F` = First total;
- `S` = Second total;
- `T` = Third total;

the calculation evaluates:

- `|F-S|`;
- `|F-T|`;
- `|S-T|`.

The nearest pair is selected.

Verified unique-nearest example:

- First `50`;
- Second `41`;
- Third `48`;
- selected pair `FIRST_THIRD`;
- reason `UNIQUE_NEAREST`;
- derived value `49`.

Verified equal-distance example:

- First `52`;
- Second `40`;
- Third `46`;
- selected pair `FIRST_THIRD`;
- reason `EQUAL_DISTANCE_HIGHER_PAIR`;
- derived value `49`.

Where equal-distance ambiguity exists, the two higher totals are selected.

The deterministic all-equal rule remains:

`FIRST_SECOND / ALL_EQUAL_CANONICAL`

The derived nearest-pair value is immutable calculation evidence.

Calculation evidence alone is **not** the Chairman-approved/final-locked Summative result.


## Committee review and Chairman Summative /60 final lock

`SummativeCalculatedMark` is now the common immutable calculated-evidence boundary.
For a no-Third comparison it records the server-derived First/Second average under
`SUMMATIVE_FIRST_SECOND_AVERAGE_V1`. For a Third candidate it binds and copies the
exact immutable `SummativeThreeTotalCalculation.derivedSummativeValue`; it does not
implement a competing nearest-pair calculation. Both paths retain candidate scope,
source/configuration identities and versions, full-mark snapshot, calculation path,
rule identity and calculated-mark version.

`SummativeCommitteeMemberReview` records one immutable review by the exact current
`MEMBER_1` or `MEMBER_2` appointment instance. `VERIFIED` can satisfy that seat;
`CORRECTION_REQUIRED` is durable, requires a bounded nonblank reason and blocks
approval. Assignment ID, User, seat and `assignedAt` are snapshotted, so replacement
or reactivation makes an older review historical and unusable while permitting the
new appointment instance to create the next review version.

`SummativeChairmanApproval` is the immutable approval/final-lock evidence for one
exact calculated-mark version. The server copies the calculated value and full mark;
the client cannot submit either. Approval requires the exact current Chairman, two
current `VERIFIED` internal-Member reviews of the same calculated evidence and a
complete four-seat Committee including valid External Member metadata. No External
Member login or digital duty is introduced.

The Committee HTTP surface is limited to:

- `GET /api/v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/member-workspace`;
- `POST /api/v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/member-reviews`;
- `GET /api/v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/chairman-workspace`;
- `POST /api/v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/chairman-approval`.

Member projections omit question-wise marks, Examiner comments and Examiner
identities. Each Member can see only its own full review comment; the Chairman can see
both. Department Admin management authority, Examiner duty and Teacher role alone do
not grant this workspace or its writes.

The additive migration
`202609020002_add_summative_calculated_committee_approval` defines restrictive foreign
keys, candidate/source/version uniqueness, database-side source/arithmetic and
Committee validation, and ordinary `UPDATE`/`DELETE` rejection for calculated marks,
reviews and approvals. It also rejects future-dated or source-preceding calculation,
review and approval evidence and keeps persistence timestamps chronologically
coherent. It performs no academic backfill.

Committee workspace readiness uses the same structurally valid current internal
Member appointment boundary relevant to approval: the assigned User must exist in the
same department, remain active, unarchived and undeleted, and the internal assignment
must not carry External Member metadata. Historical reviews remain immutable but do
not appear current when that appointment is no longer usable.


## Current runtime boundary

The 2026-09-18 campaign (fix commit `dc5cb5a7cd8307ca5f7aa66b958296cc1edd1bd3`) retained historical MEMBER_1 CORRECTION_REQUIRED v1, recorded replacement MEMBER_1 VERIFIED v2 and MEMBER_2 VERIFIED v1, and proved exact current Chairman readiness with all four seats and valid External metadata. Approval produced 46/60 with exact review/version bindings and one success audit. Duplicate approval returned 409 without a duplicate row/audit.

Database transition timestamps are coherent: Member reviewedAt = createdAt; Chairman approvedAt = lockedAt = createdAt. First/Second and Third matrices separately cover reciprocal blindness, active assignment/replacement version restrictions, save/finalize and duplicate races, locked question/submission/calculation UPDATE/DELETE rejection and required-audit rollback. These recorded matrices do not prove every future correction path.

## Remaining boundaries

Summative /60 final lock is distinct from future **complete-course-result Chairman finalisation** after authoritative Final Formative /40 integration. Complete /100 composition, separate component pass rules, documents, Controller publication and published registry are governed by [Result Domain](result-domain.md) and remain pending.

Also pending: broad correction/reopen/amendment governance, mandatory real Summative 2FA, formal institutional candidate/exam-roll/physical-script reference governance, complete frontend and production hardening. Certified Regular candidate registration for Comprehensive is implemented separately; it does not close physical-script governance.

No online examination, question-paper storage or scanned-script evaluation is introduced. Exact institutional Tabulation/Marksheet/Examiner submission-sheet formats remain external requirements. Examiner submission sheets must bind immutable locked submission versions and preserve blindness.
