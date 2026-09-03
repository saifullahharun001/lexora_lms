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

---

## Summative First/Second Functional Runtime Closure — 2026-09-01

This section supersedes the earlier module-status statement that classified the
authenticated First/Second Examiner functional/security runtime matrix as pending.

Historical pending sections remain preserved as point-in-time evidence.

Current implementation/runtime HEAD before this documentation update:

`95022543bdca4f6e969eedc12bf5a8705f7681d5`

### Current module classification

The narrow blind First/Second Examiner question-wise marking backend is now:

**IMPLEMENTED + DEPLOYED + FUNCTIONAL/SECURITY RUNTIME VERIFIED**

The complete Summative Examination workflow remains:

**PARTIAL / ACTIVE DEVELOPMENT**

### Runtime matrix closed

The authenticated real HTTP/PostgreSQL runtime campaign verified the implemented
First/Second scope end-to-end, including:

- isolated runtime-only academic prerequisites;
- fresh Department Admin and two distinct Examiner principals;
- Examination and ExaminationCourse;
- Ordinance-aligned four-seat Committee;
- External Member metadata;
- independent First/Second Examiner appointments;
- dynamic question configuration and lock;
- Enrollment-derived candidate registration;
- independent question-wise DRAFT marking;
- reciprocal First/Second blindness in DRAFT;
- reciprocal First/Second blindness after LOCKED;
- First Examiner LOCKED total `51.00`;
- Second Examiner LOCKED total `49.00`;
- required-question enforcement;
- server-calculated totals;
- exact zero behavior;
- explicit null clear;
- omitted-field no-op;
- malformed/negative/excess-scale/above-full rejection;
- client-total injection resistance;
- normal post-lock immutability;
- repeated finalization idempotency;
- unauthenticated/wrong-role/wrong-department rejection;
- forged `x-department-id` resistance;
- Course Teacher without Examiner authority;
- Teacher coarse marks permission without Examiner authority;
- expired/inactive assignment rejection;
- revoked Teacher UserRole rejection;
- `SUSPENDED` User fail-closed rejection;
- foreign-object protection;
- replacement-Examiner predecessor blindness;
- replacement version-1 duplication prevention;
- concurrent first-DRAFT safety;
- save-versus-finalize race safety;
- real PostgreSQL trigger enforcement;
- transactional audit-failure rollback;
- audit-content review;
- disposable-fixture cleanup;
- measured baseline restoration.

### Concurrency and rollback hardening

Concurrent first-DRAFT creation produced exactly one First-Examiner version-1
submission.

A save-versus-finalize race preserved all required question marks and ultimately
produced a single valid `LOCKED` submission with authoritative total `29.00`.

A deliberately forced required-audit persistence failure returned HTTP `500` and
rolled back the business mutation. After the temporary failure mechanism was removed,
the clean retry succeeded.

### Replacement Examiner protection

A replacement First Examiner:

- received authority only after explicit formal assignment;
- could not see the predecessor First Examiner submission;
- could not create a second First-Examiner version-1 submission for an existing
  candidate/seat/version identity;
- received HTTP `409` on the blocked mutation;
- produced no duplicate submission or mark mutation.

The replacement assignment was subsequently unassigned and archived, and the original
First Examiner authority was restored.

### Final cleanup and baseline restoration

Final cleanup completed with:

`summative_final_cleanup_rc=0`

Before cleanup the ten Summative business tables contained:

- `1` Examination;
- `1` ExaminationCourse;
- `1` ExaminationCommittee;
- `5` CommitteeAssignments;
- `3` ExaminerAssignments;
- `1` QuestionConfiguration;
- `6` QuestionConfigurationItems;
- `3` Candidates;
- `4` ExaminerMarkSubmissions;
- `19` ExaminerQuestionMarks.

After guarded cleanup all ten Summative business tables returned to `0`.

The isolated academic fixture also returned to its measured pre-Summative state:

- Law AcademicSessions: `0`;
- Law SyllabusVersions: `0`;
- runtime assessment-template components: `0`;
- runtime CourseOffering: `0`;
- runtime target Enrollments: `0`;
- hardening Student users: `0`;
- hardening StudentCurriculumAssignments: `0`.

### Protection and authorization preservation

All four relevant production database triggers were verified enabled after cleanup:

- `summative_candidate_identity_immutable_trg`;
- `summative_locked_submission_immutable_trg`;
- `summative_submission_lock_validate_trg`;
- `summative_question_mark_validate_trg`.

Permanent authorization remained unchanged:

- four intended Summative permissions preserved;
- four intended permanent role links preserved;
- Admin/Teacher authority separation preserved;
- canonical Law Teacher marks permission preserved;
- authorization fingerprint unchanged;
- global SERVICE audit cardinality unchanged at `10`.

### Runtime identities and evidence

Disposable Examiner and cross-department test identities were converted to
non-usable archived audit/authentication anchors rather than blindly hard-deleted:

- password hashes cleared;
- temporary Examiner UserRoles removed;
- active Examiner sessions revoked;
- login-attempt/authentication telemetry retained;
- temporary BUS Teacher authority fully removed.

A private non-secret pre-cleanup runtime evidence snapshot was preserved.

SHA-256:

`c863dfddff5cea344273f6fe8ee6fc63cd5923de86aafedb78a7596acb4ca6d6`

The evidence file itself is not tracked in Git.

### Current remaining Summative work

The following are still pending and must not be described as implemented:

- persistent First/Second comparison evidence;
- absolute-difference calculation;
- 15% variance evaluation against authoritative Summative full mark;
- candidate/script-scoped Third Examination referral;
- blind Third Examiner question-wise marking;
- nearest-pair calculation;
- equal-distance higher-pair rule;
- Committee Member review;
- Chairman approval/final lock;
- controlled reopen/correction/re-review/reapproval/relock;
- approved Summative result;
- transactional/idempotent result-engine handoff;
- final-result/amendment integration;
- Summative CLO selected-pair analytical evidence where formally required;
- confidentiality-filtered reports/export;
- frontend;
- mandatory Summative 2FA;
- formal exam-roll/candidate-number/physical-script-reference governance.

The 15% rule must be evaluated against the authoritative Summative full mark, not
against an assumed total of 100.

Third Examiner must remain candidate/script-referral scoped. It must not become a
permanent standing ExaminationCourse Examiner seat.

### Next implementation phase

The next safe backend implementation phase is:

**First/Second comparison + authoritative 15% variance evaluation**

Only after that boundary is implemented and runtime verified should candidate/script-
scoped Third Examination workflow be added.

## 24. Local Static Implementation Supersession — 2026-09-01

This section supersedes the current-status assertions above that classify
First/Second comparison, variance and the Third Examination marking workflow as not
yet implemented.

It does not supersede the earlier server deployment/runtime evidence.

Current promoted local/main implementation HEAD:

`ff6325af66f9a2c4a95f98eeae8dfab902c2d708`

### 24.1 Added implementation history

Later promoted Summative checkpoints:

- `02e79c5cdc529f4450198dc66bcd4c862606d3fd`
  - `feat: add summative examiner comparison variance`
  - immutable exact-source First/Second comparison evidence;
  - authoritative-full-mark variance calculation;
  - inclusive 15% Third Examination decision.

- `8dde2d148d6ed4bc30c1ff3d05b572c52f001729`
  - `feat: add summative third examiner referrals`
  - qualifying-comparison-bound candidate-level Third Examination referral;
  - separate Third Examiner authority;
  - no permanent course-level Third Examiner seat.

- `ff6325af66f9a2c4a95f98eeae8dfab902c2d708`
  - `feat: add blind third examiner marking`
  - blind referral-bound Third Examiner question-wise marking;
  - separate Third submission/question-mark evidence;
  - DRAFT / LOCKED behavior;
  - database immutability protection.

### 24.2 Added migration chain

The later local implementation extends the Summative migration chain with:

6. `202609010001_add_summative_examiner_comparisons`
   - SHA-256: `A77F1DDC64DDE4D689000CD0AD61CF8827BFD9C3B097CC620263A46408E38207`

7. `202609010002_add_summative_third_examination_referrals`
   - SHA-256: `C2C7E68F03F016926068EAA23C5E72CFF5CC5D675222691630D03FBA5770C601`

8. `202609010003_add_summative_third_examiner_marks`
   - SHA-256: `A2B204C126FD836009609E96AF03CC48B41312E9BB3524D6CC4809C894DE20A0`

These three later migrations are committed in Git but are not claimed by this
checkpoint as deployed to the ordinary server PostgreSQL database.

### 24.3 First/Second comparison implementation

`SummativeExaminerComparison` stores immutable comparison evidence from the exact
LOCKED First/Second sources.

The implementation retains internally:

- exact First/Second source submissions;
- exact source versions;
- First total snapshot;
- Second total snapshot;
- authoritative Summative full-mark snapshot;
- absolute difference;
- six-decimal variance;
- 15% threshold snapshot;
- versioned rule identity;
- deterministic Third-required / Third-not-required decision;
- comparison version;
- structural audit context.

The decision uses exact arithmetic/cross multiplication so display rounding does not
change academic eligibility.

Comparison evidence is not exposed through Examiner-facing blind workspaces.

### 24.4 Third Examination referral implementation

`SummativeThirdExaminationReferral` is candidate-scoped and exists only after an exact
qualifying comparison.

The Third Examiner:

- is not a permanent `ExaminationCourseExaminerSeat`;
- must be an eligible active same-department Teacher;
- must hold live scoped authority;
- cannot be the First Examiner;
- cannot be the Second Examiner;
- receives only the exact referred candidate/question-configuration scope.

Active referral uniqueness, history, deterministic lock ordering and protected
structural audit are implemented.

### 24.5 Blind Third Examiner marking implementation

Implemented data models:

- `SummativeThirdExaminerMarkSubmission`;
- `SummativeThirdExaminerQuestionMark`.

Third marking is independently referral-bound.

Implemented behavior includes:

- own assigned referral workspace;
- exact candidate/configuration authority;
- First/Second blindness;
- question-wise Decimal marks;
- DRAFT save/update;
- actual zero preservation;
- explicit null draft clear where supported;
- omitted field no-op;
- per-question full-mark validation;
- malformed/negative/excess-precision rejection;
- required/optional item semantics;
- server-calculated exact total;
- non-60 authoritative Summative full-mark support;
- client total cannot control persisted total;
- final LOCKED submission;
- repeated finalization idempotency;
- post-lock application mutation blocking;
- concurrent first-draft serialization;
- save-versus-finalize serialization;
- structural audit confidentiality;
- audit-failure rollback.

Database triggers additionally protect LOCKED Third submission/question-mark evidence
from ordinary UPDATE/DELETE.

Academic evidence relationships do not use unsafe `ON DELETE CASCADE`.

### 24.6 Static verification

At HEAD `ff6325af66f9a2c4a95f98eeae8dfab902c2d708`:

- Prisma validate: PASS;
- Prisma generate: PASS;
- API typecheck: PASS;
- API build: PASS;
- Third marking: 57/57 PASS;
- Third Referral: 71/71 PASS;
- First/Second marks + comparison: 63/63 PASS;
- combined focused static regression: 191/191 PASS;
- Git diff/migration hygiene guards: PASS;
- local repository after commit/push: CLEAN / ORIGIN-ALIGNED.

### 24.7 Runtime classification

The later comparison/Third bundles are currently:

**IMPLEMENTED + COMMITTED + PUSHED / AUTOMATED STATICALLY VERIFIED**

They are not yet classified as:

- server deployed;
- ordinary PostgreSQL deployed;
- boot verified on the server;
- authenticated functional-runtime verified.

The earlier 2026-08-30 deployment evidence remains preserved and must not be
retroactively extended to these later commits.

### 24.8 Remaining roadmap

Next implementation:

1. three-total nearest-pair calculation;
2. equal-distance higher-pair rule;
3. final derived Summative calculation evidence;
4. Committee Member review;
5. Chairman approval/final lock;
6. authorised correction/reopen lifecycle;
7. approved Summative result;
8. idempotent result-engine handoff;
9. final result/amendment integration;
10. Summative CLO selected-pair analytical evidence where approved;
11. reports/exports/confidentiality filtering;
12. frontend integration.

Candidate/exam-roll/physical-script governance remains unresolved.

Mandatory Summative 2FA remains pending security hardening and runtime verification.

This document remains subordinate to later evidence in
`docs/runtime-test-checklist.md`.
## 25. Three-Total Nearest-Pair Local Static Supersession — 2026-09-02

This section supersedes only the stale current-status statements in this document that
still describe three-total nearest-pair selection, equal-distance higher-pair
selection and derived Summative calculation evidence as unimplemented.

Promoted implementation commit:

`ae2499303e7009d3ecbe256f5966c9ff445d6d72`

Current nearest-pair classification:

**IMPLEMENTED + COMMITTED + PUSHED / AUTOMATED STATICALLY VERIFIED**

It is not yet server-deployed or server-runtime verified.

### 25.1 Implemented calculation rule

For a candidate requiring Third Examination, the system now uses exact First,
Second and Third locked totals.

It calculates:

- First/Second absolute distance;
- First/Third absolute distance;
- Second/Third absolute distance.

The minimum-distance pair is selected.

For equal-distance ambiguity, the two higher totals are selected.

For all-equal totals, deterministic First/Second canonical evidence is selected and
the explicit `ALL_EQUAL_CANONICAL` reason is preserved.

Rule identity:

`SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1`

The exact average of the selected pair is persisted as the:

**derived Summative value**

This is not yet a Committee-reviewed or Chairman-approved final Summative mark.

### 25.2 Evidence and integrity

The implementation preserves immutable evidence including:

- exact F/S/Third source IDs;
- source versions;
- exact comparison identity/version;
- exact Third Referral identity/assignment version;
- question-configuration identity;
- authoritative full-mark snapshot;
- F/S/Third total snapshots;
- three pairwise distances;
- selected pair;
- selection reason;
- calculation version;
- versioned rule identity;
- derived Summative value.

Academic relationships use restrictive foreign keys rather than unsafe academic
cascade behavior.

Database-side validation independently protects the source/evidence chain.

### 25.3 Third-finalisation integration

The calculation is coupled to protected Third finalisation.

Repeated well-formed LOCKED finalisation is idempotent for the exact source evidence.

Third Examiner blindness remains preserved.

No new Examiner-facing calculation endpoint exists.

### 25.4 Review hardening

Before promotion, source review additionally closed:

- referral/comparison rule-version evidence binding;
- exact referred-Third-Examiner audit actor binding;
- Third Referral Prisma/native-database type drift;
- misleading simulated-concurrency terminology.

Genuine PostgreSQL concurrency remains runtime-pending.

### 25.5 Verification evidence

Final local repository verification:

- Prisma validate: PASS;
- Prisma generate: PASS;
- API typecheck: PASS;
- API build: PASS;
- `git diff --check`: PASS.

Post-normalisation focused evidence includes:

- schema/migration tests: `23/23 PASS`;
- nearest-pair rule tests: `10/10 PASS`;
- focused production-source TypeScript harness: PASS;
- strongest post-normalisation focused subset: `33/33 PASS`.

A broader current-source focused campaign before final schema normalisation recorded
`61/61 PASS`; it remains local/static evidence only.

### 25.6 Runtime boundary

The following later layers still require controlled server/PostgreSQL runtime
verification:

- First/Second comparison/variance;
- Third Examination Referral;
- blind Third Examiner marking;
- three-total nearest-pair calculation.

A combined runtime campaign is preferred before introducing Committee Member Review.

### 25.7 Current remaining roadmap

Next implementation authority boundary:

1. Committee Member review;
2. Chairman approval/final lock;
3. authorised correction/reopen/re-review/reapproval/relock;
4. approved Summative result;
5. transactional/idempotent result-engine handoff;
6. final-result/amendment integration;
7. Summative CLO selected-pair analytical evidence where formally approved;
8. reports/exports/confidentiality filtering;
9. frontend integration.

Candidate/exam-roll/physical-script governance remains unresolved.

Mandatory Summative 2FA remains pending.

Committee composition is not redefined by this checkpoint. The current Academic
Ordinance and any later formal institutional decision must be reviewed before the
Committee Member Review authority layer is implemented.

The overall Summative module remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

This document remains subordinate to later evidence in
`docs/runtime-test-checklist.md`.

---

## 25. Comparison / Third / Nearest-Pair Runtime Closure — 2026-09-02

### 25.1 Supersession

This section supersedes the earlier current module classification that described the
comparison, Third Examination and nearest-pair bundles as only automated/static
verified or runtime-pending.

Historical sections remain preserved as point-in-time evidence.

Current implementation/runtime HEAD for this closure:

`9560ee8e78ea022f2a39196b7ad1f4adaa7d13e7`

Current narrow backend classification:

**IMPLEMENTED + DEPLOYED + FUNCTIONAL/SECURITY RUNTIME VERIFIED FOR THE TESTED MATRIX**

Complete Summative Examination workflow classification:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

### 25.2 Comparison and Third-trigger rule

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

### 25.3 Third Examination authority model

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

### 25.4 Third referral expiry

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

### 25.5 Third marking

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

### 25.6 Nearest-pair calculation

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

It is **not** yet the approved final Summative result.

### 25.7 Runtime hardening

Real runtime verification also covered:

- concurrency/idempotency for repeated Third finalisation;
- PostgreSQL UPDATE/DELETE blocking for LOCKED Third submissions;
- PostgreSQL UPDATE/DELETE blocking for LOCKED Third question marks;
- PostgreSQL UPDATE/DELETE blocking for three-total calculation evidence;
- real required-audit failure causing complete business-transaction rollback;
- zero temporary PostgreSQL failure-injector residue;
- structural audit confidentiality.

Final focused expiry/Third compiled regression:

`53/53 PASS`

Final server posture remained:

- API typecheck: PASS;
- API build: PASS;
- direct API health: HTTP `200`;
- Nginx API health: HTTP `200`;
- NestJS listener: `127.0.0.1:4000` only.

### 25.8 Cleanup closure

Final runtime campaign cleanup returned the tracked Summative business tables to the
measured baseline of `0`.

Runtime academic prerequisites were also restored:

- runtime AcademicSession: `0`;
- runtime StudentBatch: `0`;
- runtime SyllabusVersion: `0`;
- runtime CourseOffering: `0`;
- runtime Enrollments: `0`;
- runtime assessment components: `0`.

USER Summative feature audits returned from `96` to `0`.

SERVICE Summative audits remained `0`.

Permanent authorization remained `4/4`.

All ten current Summative production protection triggers remained enabled.

Temporary runtime/test DDL residue remained `0`.

Nine run-scoped identities were retained as archived/login-disabled
authentication/audit anchors with:

- cleared password hash;
- zero roles;
- zero active sessions.

Private recovered cleanup evidence SHA-256:

`D5D72C9DDA60BE9829B2B3EA30039F78421EF987B822A8188CDAAAC42030EC94`

### 25.9 Academic-authority continuity

The current Ordinance-aligned Examination Committee foundation remains:

- Chairman;
- Internal Member 1;
- Internal Member 2;
- External Member.

The External Member is not automatically an ordinary same-department Lexora User or
digital marks authority.

Historical lower-authority three-member specification wording remains historical and
does not supersede the current Ordinance-backed implementation.

### 25.10 What remains unimplemented

The comparison / Third / nearest-pair phase is no longer the next implementation
target.

Next backend work:

1. Committee Member review;
2. Chairman approval / final lock;
3. authorised reopen / correction / re-review / re-approval / re-lock;
4. approved Summative result record;
5. transactional/idempotent result-engine handoff;
6. final-result/amendment integration;
7. approved Summative CLO selected-pair analytical evidence where formally required;
8. confidentiality-filtered reports/export;
9. frontend integration.

Still pending security/governance work:

- mandatory Summative 2FA;
- formal candidate/exam-roll/physical-script/masking governance.

The Summative Examination remains offline/physical.

Lexora does not become a question-paper or physical answer-script storage system as a
result of this implementation.

---

## 26. Calculated-mark convergence and Committee final lock — 2026-09-03

Classification:

**IMPLEMENTED / LOCAL STATICALLY VERIFIED**

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

- `GET /v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/member-workspace`;
- `POST /v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/member-reviews`;
- `GET /v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/chairman-workspace`;
- `POST /v1/summative/calculated-marks/:calculatedMarkId/committee-workflow/chairman-approval`.

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

Local verification recorded `85/85` focused new tests and `200/200` selected existing
Summative regressions. Later canonical `D:\Lexora` verification passed Prisma schema
validation with Prisma CLI `6.19.3`, Prisma Client generation, API typecheck, API build
and `git diff --check`. This supersedes an earlier managed-runner
`EPERM ... lstat 'D:\\'` tooling limitation. No PostgreSQL service was used; this is
not deployment, authenticated runtime, real database-trigger or real concurrency
evidence.

No approved result-engine record, handoff, published result, correction/reopen flow,
frontend, mandatory 2FA, or physical exam-roll/script governance is added. The full
Summative workflow remains **PARTIAL / ACTIVE BACKEND DEVELOPMENT**.
