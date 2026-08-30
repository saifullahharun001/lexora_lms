---
title: "Lexora LMS — Summative Examination Backend"
project: "Lexora LMS"
module: "Summative Examination"
initial_scope: "Department of Law, University of Chittagong"
document_status: "Implementation / Deployment / Runtime Handoff"
date: "2026-08-30"
implementation_head: "89b4440dfbbf0b2cf4c3e675039c38c1e8417fff"
---

# Lexora LMS — Summative Examination Backend

## 1. Purpose and Current Classification

This document is the durable module-level implementation and handoff record for the
Lexora LMS Summative Examination backend.

The Summative Examination itself remains offline and physical.

Lexora currently manages only the controlled digital workflow around:

- examination setup;
- examination-course identity;
- Examination Committee assignments;
- First and Second Examiner assignments;
- dynamic question-structure metadata;
- candidate roster identity;
- blind First/Second Examiner question-wise marks;
- draft/final submission state;
- server-calculated totals;
- locking and audit evidence.

Current classification at implementation HEAD
`89b4440dfbbf0b2cf4c3e675039c38c1e8417fff`:

- implementation through blind First/Second marking: IMPLEMENTED;
- focused/static tests: VERIFIED;
- server typecheck/build/regression: VERIFIED;
- PostgreSQL migration deployment: VERIFIED;
- authorization provisioning: VERIFIED;
- PM2 deployment/boot: VERIFIED;
- unauthenticated AuthGuard route activation: VERIFIED;
- authenticated end-to-end Summative functional/security runtime matrix: PENDING;
- First/Second comparison and variance: NOT YET IMPLEMENTED;
- Third Examination workflow: NOT YET IMPLEMENTED;
- Committee review / Chairman approval: NOT YET IMPLEMENTED;
- approved Summative result handoff: NOT YET IMPLEMENTED;
- mandatory Summative 2FA enforcement: PENDING;
- frontend integration: PENDING / NOT VERIFIED.

This module must not be described as fully complete until the pending functional and
security runtime matrix and downstream workflow are implemented and verified.

## 2. Academic Authority and Scope

Academic rule priority is:

1. current applicable LL.B. (Honours) Academic Ordinance;
2. formally approved University / Academic Committee / Department / Examination
   Committee / quality-assurance decisions;
3. approved curriculum;
4. consolidated teacher/assessment specification;
5. general site specification;
6. implementation defaults.

Historical teacher/consolidated specifications contain a three-member Examination
Committee description.

The current committed Academic Ordinance is the higher academic authority and the
current implemented committee foundation follows the Ordinance-aligned four-person
composition:

- one Chairman;
- two Internal Members;
- one External Member from a similar programme of another public university.

This current Ordinance-backed composition supersedes conflicting older three-member
wording for current implementation decisions.

Historical specification text should remain preserved as historical evidence rather
than silently deleted.

The External Member is represented through formal external identity metadata. The
External Member is not automatically modelled as an ordinary same-department Lexora
User and does not automatically receive digital marks authority.

## 3. Explicitly Offline / Out of Scope

Lexora does not currently provide:

- online Summative examination delivery;
- question-paper drafting;
- question-paper upload or storage;
- question moderation;
- question-paper printing;
- physical answer-script storage;
- scanned answer-script upload;
- on-screen answer-script evaluation.

Question configuration stores structural metadata only. It must not become a
question-paper store.

## 4. Implementation History

Relevant Summative implementation checkpoints in the promoted branch history include:

- `f56df56babee153270351bce9a6699efeb99da5f`
  - Summative Examination schema/application foundation checkpoint.
- `eed3001a119dc72f4e6a3e57609806d2e95c168f`
  - setup and Ordinance-aligned Examination Committee implementation.
- `a3c2b914041e6476ee4474e9df56c582e8b1bf79`
  - independent First/Second Examiner assignment.
- `bf94f072daaf0344ff4aee87bcefb547014fd411`
  - dynamic question-configuration Pass A.
- `460a9496fc00975d6b758a953f3d041373376302`
  - question-configuration hardening / Pass B.
- `89b4440dfbbf0b2cf4c3e675039c38c1e8417fff`
  - blind First/Second Examiner question-wise marking and mixed-role authorization
    provisioning correction.

The exact Git history remains authoritative if commit labels or descriptions in this
document are later found to differ from the commit subjects.

## 5. Database Migration Chain

Current Summative migration chain:

1. `202608280001_add_summative_examination_committee_foundation`
2. `202608290001_add_external_examination_committee_member`
3. `202608290002_add_examination_course_examiner_assignment`
4. `202608290003_add_summative_question_configuration`
5. `202608290004_add_summative_examiner_marks`

Reviewed SHA-256 for the final marks migration:

`e05ba687c76b0da283163bc446019a962feb61b3fe458d6785cd330f165db454`

The deployed migration chain is additive and creates the Summative data model,
constraints, indexes, enums and PostgreSQL trigger protections.

## 6. Implemented Data Model

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

## 7. Blindness and Separation of Duties

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

## 8. Authorization Model

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

## 9. Department Isolation and Object Authorization

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

## 10. Transaction / Concurrency / Audit Design

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

## 11. Static and Server Verification

At server promotion to
`89b4440dfbbf0b2cf4c3e675039c38c1e8417fff`:

- repository: clean;
- `origin/main`: aligned;
- five Summative migrations: present;
- final marks migration hash: verified;
- Prisma Client generation: PASS;
- API typecheck: PASS;
- API build: PASS;
- selected Summative + authorization regression tests: `199/199 PASS`.

At that checkpoint there was intentionally:

- no migration deploy;
- no provisioning apply;
- no PM2 restart;
- no ordinary database mutation.

## 12. Disposable PostgreSQL Verification

Before ordinary deployment, an exact-current ordinary-database backup was restored to
a loopback-only disposable PostgreSQL 18.6 instance.

Verified there:

- exact snapshot restore: PASS;
- five-migration chain: PASS;
- migration history: 5/5 complete;
- incomplete/rolled-back target migrations: 0;
- existing business data: preserved;
- automatic Summative backfill: zero;
- new tables: 10/10;
- enum types: 7/7;
- named indexes: 55/55;
- named constraints: 82/82;
- PostgreSQL triggers: 4/4;
- Summative foreign keys: 49;
- non-RESTRICT target FKs: 0;
- Prisma database/datamodel drift: none;
- second migration deploy: safe no-op;
- mixed-role provisioning dry-run: zero write;
- mixed-role permanent provisioning: PASS;
- Admin/Teacher authorization separation: PASS;
- second provisioning apply: true no-op.

The disposable container was removed and no persistent disposable volume was retained.

The ordinary `lexora_lms` database remained untouched throughout the disposable
verification.

## 13. Ordinary PostgreSQL Deployment Verification

Ordinary runtime database:

- PostgreSQL 18.6;
- database: `lexora_lms`;
- PostgreSQL remains loopback-local.

A validated private pre-migration backup was retained before mutation.

All five Summative migrations were deployed successfully.

Post-deployment verification:

- migration history: 5/5 complete;
- incomplete/rolled-back target migrations: 0;
- pre-existing business data: preserved;
- authorization data during schema migration: preserved;
- automatic Summative rows: zero;
- tables: 10/10;
- enum types: 7/7;
- indexes: 55/55;
- constraints: 82/82;
- triggers: 4/4;
- Summative foreign keys: 49/49 restrictive;
- Prisma database/datamodel drift: none;
- second ordinary migrate deploy: true no-op;
- final migration status: up to date.

## 14. Permanent Authorization Provisioning Verification

Before permanent apply:

- four new Summative permissions were absent;
- target role links were absent;
- corresponding Summative provisioning audits were absent;
- final dry-run produced zero writes.

Permanent provisioning then created exactly the intended Summative authorities.

Verified:

- setup management -> Department Admin;
- committee management -> Department Admin;
- Examiner-assignment management -> Department Admin;
- Examiner-marks entry -> Teacher;
- Admin Examiner-marks leakage: 0;
- Teacher Summative-management leakage: 0;
- Summative provisioning SERVICE audits: exactly four;
- second permanent apply: true no-op.

Provisioned-state fingerprint:

`9|9|9 -> 9|9|9`

The fingerprint represents unchanged provisioned permission/link/audit cardinality
across the second apply.

## 15. Live Activation / Boot Verification

After migrations and permanent provisioning:

- API typecheck: PASS;
- API build: PASS;
- Prisma schema: up to date;
- PM2 `lexora-api` restarted;
- PID changed from `1697` to `35362`;
- PM2 state: online;
- direct API health: HTTP 200;
- Nginx API health: HTTP 200;
- NestJS listener: `127.0.0.1:4000` only;
- Nginx: active;
- PostgreSQL: active;
- unauthenticated Summative marking-workspace probe: HTTP 401;
- repository: clean / origin-aligned.

This proves deployment, boot and AuthGuard route activation.

It does not prove the authenticated Summative business workflow.

## 16. Read-Only Runtime Discovery

Post-activation discovery was deliberately read-only.

It confirmed:

- current Summative routes are registered behind AuthGuard and PolicyGuard;
- initial ordinary Summative business-row count was zero;
- canonical Law Admin, Teacher and Student principals remained available;
- only one existing Law Teacher principal was currently usable as an active Examiner;
- other historical Teacher-role identities inspected were not usable because their
  User state was not active;
- Law AcademicSession count was zero;
- Law StudentBatch count was zero;
- Law SyllabusVersion count was zero.

Assessment inventory confirmed the canonical theoretical template
`LLB-STANDARD-100-V1` contains:

- Formative Activities: 30;
- Attendance: 5;
- Comprehensive Examination: 5;
- Summative Examination: 60.

Its total assessment structure is 100 marks.

A currently inspected canonical offering using a Summative-capable curriculum course
did not have the exact StudentCurriculumAssignment/CurriculumCourse-backed Enrollment
shape needed by the new candidate-registration foundation.

A separate runtime-only enrollment chain was therefore identified as a safer future
fixture basis:

- academic programme: `program_law_sca_runtime`;
- curriculum version: `cv_law_sca_runtime_approved`;
- curriculum course: `curriculum_course_law_enrollment_runtime_approved`;
- course: `course_law_enrollment_runtime_001`;
- academic term: `term_law_2025_2026_s1`;
- assessment template: `assessment_template_law_enrollment_runtime_v1`;
- existing test Student and exact StudentCurriculumAssignment.

That runtime-only assessment template currently has no components.

A future isolated runtime fixture may add temporary 30/5/5/60 assessment components
instead of mutating canonical LL.B. academic records.

## 17. Interrupted Prerequisite-Fixture Attempt

A prerequisite-fixture command was started after the read-only discovery.

It stopped at its local temporary-password length guard before any fixture-creation
transaction began.

Verified classification:

- temporary Teachers created: NO;
- temporary UserRoles created: NO;
- AcademicSession created: NO;
- SyllabusVersion created: NO;
- CourseOffering fixture created: NO;
- Enrollment fixture created: NO;
- Summative business rows created: NO;
- rollback required: NO.

No attempted password or password-derived value is recorded in this documentation.

## 18. Functional Runtime Verification Still Pending

The deployed Summative backend is not yet considered fully runtime verified.

A controlled fresh-principal HTTP/PostgreSQL runtime matrix must still cover at least:

- isolated runtime-only prerequisites;
- fresh Department Admin authentication;
- two distinct usable Teacher Examiner identities;
- Examination creation;
- ExaminationCourse creation;
- four-seat Examination Committee;
- External Member metadata path;
- First/Second Examiner assignment;
- dynamic question configuration;
- exact configuration lock;
- candidate registration from exact approved Enrollment +
  StudentCurriculumAssignment;
- First Examiner draft question marks;
- Second Examiner draft question marks;
- First Examiner final lock;
- Second Examiner final lock;
- reciprocal blindness in DRAFT state;
- reciprocal blindness in LOCKED state;
- unauthenticated rejection;
- wrong-role rejection;
- wrong-department rejection;
- forged `x-department-id` resistance;
- Course Teacher without Examiner assignment;
- Teacher coarse permission without Examiner assignment;
- revoked/expired/inactive authority;
- foreign candidate/item/object safe-not-found behavior;
- negative mark rejection;
- above-question-full-mark rejection;
- malformed Decimal rejection;
- zero versus missing-required behavior;
- explicit null draft clear;
- omitted-field no-op behavior;
- client-controlled total rejection;
- required-question finalization enforcement;
- locked-submission mutation blocking;
- repeated finalization idempotency;
- concurrent first-draft save;
- save-versus-finalization race;
- real PostgreSQL trigger enforcement;
- real transactional audit-failure rollback;
- audit-context review;
- disposable fixture cleanup;
- measured baseline restoration.

Until this matrix passes, the current First/Second marking workflow must remain
classified as deployed but functionally runtime-pending.

## 19. Future Implementation Roadmap

After the current First/Second runtime matrix closes, the next implementation work is:

1. First/Second comparison evidence.
2. Absolute-difference / variance calculation.
3. 15% threshold against the authoritative Summative full mark.
4. Candidate/script-scoped Third Examination referral.
5. Third Examiner blind question-wise marking.
6. Three-total nearest-pair calculation.
7. Equal-distance higher-pair rule.
8. Committee Member review.
9. Chairman approval and final lock.
10. authorised reopen / correction / re-review / re-approval / re-lock.
11. approved Summative result record.
12. transactional and idempotent result-engine handoff.
13. final-result and amendment integration.
14. Summative CLO analytical selected-pair marks where formally required.
15. reporting/export confidentiality filtering.
16. frontend/UI integration.

Third Examiner must not be implemented as a permanent standing
`ExaminationCourse` seat.

It should be created only for a candidate/script that qualifies for Third Examination
under the applicable variance rule.

## 20. Candidate / Script Reference Governance Gap

Current source/runtime audit has not established a sufficiently authoritative
institutional contract for:

- candidate/exam-number issuance;
- Student ID and academic-session binding;
- physical answer-script allocation;
- blind physical script numbering;
- masking/unmasking lifecycle;
- persistent script reference format.

Do not invent an exam-roll or physical-script-reference schema.

The current `SummativeExaminationCandidate` remains an internal Enrollment-derived
roster identity until formal institutional governance is available.

## 21. 2FA Security Gap

The target specifications require mandatory 2FA for:

- Admin;
- Teacher;
- Examiner;
- Examination Committee access.

No Summative-specific reusable enforced 2FA primitive has yet been demonstrated by
current source/runtime evidence.

Therefore mandatory Summative 2FA remains:

`PENDING SECURITY HARDENING`

Do not classify Summative sensitive access as fully production-hardened until this is
resolved and runtime verified.

## 22. Frontend Status

This Summative work is currently a backend implementation/deployment checkpoint.

No current evidence in this checkpoint proves production-ready frontend integration
for:

- examination setup;
- committee assignment;
- Examiner assignment;
- question configuration;
- candidate roster;
- Examiner marking;
- comparison/Third;
- committee review;
- Chairman approval;
- result handoff.

Frontend completion must be tracked separately.

## 23. Resume Point

The next safe continuation point is:

1. verify repository/runtime remains at or beyond the documented implementation HEAD;
2. create only isolated runtime prerequisite fixtures;
3. keep temporary credentials out of documentation and Git;
4. obtain fresh principals/tokens;
5. execute the First/Second authenticated functional/security runtime matrix;
6. clean disposable fixture rows;
7. record runtime evidence;
8. commit documentation separately;
9. only then begin variance + Third Examiner implementation.

This document is subordinate to later runtime evidence and the latest
`docs/runtime-test-checklist.md`.
