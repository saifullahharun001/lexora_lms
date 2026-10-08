# Academic Core

**Classification:** implemented backend baseline with server/runtime-verified scoped workflows; broader academic product remains partial. [Runtime evidence index](runtime-test-checklist.md#current-verified-baseline-index) takes precedence over the original foundation/API snapshots.

## Domain and ownership

Department is the tenant boundary. `DepartmentAcademicConfig` owns versionable settings for enrollment, attendance, imports and eligibility through department-config. `AcademicProgram` groups the catalog; `AcademicYear` contains `AcademicTerm`. `Course` is a catalog entry; `CourseOffering` is delivery for a term/section and the runtime anchor for teaching, enrollment, sessions and assessment.

`TeacherCourseAssignment` binds an active Teacher to an offering. `Enrollment` binds student, offering and term, with source, approval and eligibility snapshots. `ClassSession` is a scheduled instructional occurrence; `AttendanceRecord` is unique per session/enrollment. `AttendanceImportBatch` separates raw import/reconciliation governance from resolved attendance. `EligibilityRuleDefinition` and `EligibilityRuleBinding` provide versioned criteria at department, programme, term or offering scope.

Later implemented structures include curriculum versions/courses and assessment templates; StudentCurriculumAssignment and exact enrollment/offering curriculum bindings; SyllabusVersion and approved CLO/PLO content; CourseOutlineVersion; AcademicSession and StudentBatch; and scoped Batch Coordinator appointments. These preserve academic identity/version lineage rather than silently rebinding historical records.

## Lifecycle and invariants

| Entity | Lifecycle vocabulary |
| --- | --- |
| Course | DRAFT, ACTIVE, INACTIVE, ARCHIVED |
| CourseOffering | PLANNED, PUBLISHED, ENROLLMENT_OPEN, IN_PROGRESS, COMPLETED, CANCELED, ARCHIVED |
| Enrollment | PENDING, APPROVED, WAITLISTED, REJECTED, DROPPED, WITHDRAWN, ARCHIVED |
| ClassSession | SCHEDULED, ACTIVE, COMPLETED, CANCELED, LOCKED, ARCHIVED |
| AttendanceImportBatch | RECEIVED, VALIDATING, PROCESSED, PARTIALLY_PROCESSED, FAILED, CANCELED, ARCHIVED |
| Eligibility snapshot | ELIGIBLE, INELIGIBLE, CONDITIONAL, PENDING_REVIEW |

Lifecycle vocabulary does not authorize arbitrary transitions. Parent and child department, programme, term, offering, student and curriculum identities must agree. Enrollment term must match the offering; department-scoped duplicate codes/enrollments conflict. Archived records are excluded from ordinary reads. Historical bindings and referenced records require restrictive, history-preserving handling.

Students see only permitted published/enrolled course context and their own enrollment/resources. Self-enrollment is a configuration-governed contract with offering state, enrollment windows, approval and eligibility checks; the existence of a visibility endpoint does not prove unrestricted self-enrollment completion.

Teachers require current offering assignments, not department membership alone. Department Admin manages academic structure within the department; auditors have scoped reads. Assignment changes, enrollment decisions, lifecycle transitions, configuration changes and sensitive corrections are auditable. Course-management, enrollment, class-session and attendance own their persistence; cross-module validation uses exported interfaces.

## Session, attendance and eligibility boundary

Ordinary attendance capture requires an ACTIVE session within its valid scheduled window. Scheduled-end reconciliation closes expired active sessions and cancels elapsed non-conducted scheduled sessions with audited lifecycle handling. Completed, locked, canceled or archived sessions do not grant ordinary capture authority. Students never mark or correct attendance.

Current ordinary correction (runtime verified 2026-09-29) is available only before authoritative generation/freeze: assigned Course Teacher for the current offering, Department Chairman, or Department Admin with explicit correction authority. A nonblank reason and actor are mandatory; corrections append lineage without rewriting raw AttendanceRecord evidence. Historical locks block correction.

Current Examination Committee Chairman generation (2026-09-30) irreversibly freezes Attendance /5. No ordinary correction, reopen, regeneration or replacement version is permitted afterward. Department Chairman and Examination Committee Chairman are distinct duties. The older Batch Coordinator Attendance verify/finalise/reopen sequence is historical and policy-superseded. The exact /5 calculation, evidence rules and immutable source contract belong to [Formative Assessment](formative-assessment.md).

Imports preserve source metadata and external references, department scope, deduplication and reconciliation evidence. Runtime-tested sync foundation is not production biometric integration. Eligibility uses versioned criteria and auditable evaluation snapshots; manual attendance/eligibility overrides require reason, actor and audit. Attendance /5 and Examination Eligibility remain separate academic decisions.

## Current API endpoints and policies

The table is **locally/static verified** against current Academic controller declarations during Phase 1. It extends the original API's program/course/offering/enrollment subset. All routes use `AuthGuard`, `PolicyGuard` and `@RequirePolicy()`; route policy alone does not confer object authority. Department comes from the principal, never client input or `x-department-id`.

| Method | Path (under /api/v1) | Policy |
| --- | --- | --- |
| POST | `/academic-sessions` | `course-management.academic-session.manage` |
| GET | `/academic-sessions` | `course-management.academic-session.read` |
| GET | `/academic-sessions/:id` | `course-management.academic-session.read` |
| PATCH | `/academic-sessions/:id` | `course-management.academic-session.manage` |
| POST | `/academic-terms` | `course-management.term.manage` |
| GET | `/academic-terms` | `course-management.term.read` |
| GET | `/academic-terms/:id` | `course-management.term.read` |
| PATCH | `/academic-terms/:id` | `course-management.term.manage` |
| POST | `/academic-years` | `course-management.term.manage` |
| GET | `/academic-years` | `course-management.term.read` |
| GET | `/academic-years/:id` | `course-management.term.read` |
| PATCH | `/academic-years/:id` | `course-management.term.manage` |
| POST | `/batch-coordinator-assignments` | `course-management.batch-coordinator-assignment.manage` |
| GET | `/batch-coordinator-assignments` | `course-management.batch-coordinator-assignment.manage` |
| GET | `/batch-coordinator-assignments/:id` | `course-management.batch-coordinator-assignment.manage` |
| PATCH | `/batch-coordinator-assignments/:id` | `course-management.batch-coordinator-assignment.manage` |
| POST | `/batch-coordinator-assignments/:id/unassign` | `course-management.batch-coordinator-assignment.manage` |
| POST | `/batch-coordinator-assignments/:id/reactivate` | `course-management.batch-coordinator-assignment.manage` |
| POST | `/batch-coordinator-assignments/:id/archive` | `course-management.batch-coordinator-assignment.manage` |
| POST | `/course-offerings` | `course-management.offering.manage` |
| GET | `/course-offerings` | `course-management.offering.read` |
| GET | `/course-offerings/me` | `enrollment.record.self-request` |
| GET | `/course-offerings/:id` | `course-management.offering.read` |
| GET | `/course-offerings/:id/syllabus` | `course-management.offering.read` |
| GET | `/course-offerings/:id/learning-outcomes` | `course-management.offering.read` |
| POST | `/course-offerings/:id/course-outline-versions` | `course-management.course-outline.write` |
| GET | `/course-offerings/:id/course-outline-state` | `course-management.course-outline.read` |
| GET | `/course-offerings/:id/course-outline-versions` | `course-management.course-outline.read` |
| GET | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId` | `course-management.course-outline.read` |
| PATCH | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/structured-content` | `course-management.course-outline.write` |
| PATCH | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId` | `course-management.course-outline.write` |
| POST | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/submit` | `course-management.course-outline.submit` |
| POST | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/approve` | `course-management.course-outline.approve` |
| POST | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/replace-active` | `course-management.course-outline.activate` |
| POST | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/activate` | `course-management.course-outline.activate` |
| POST | `/course-offerings/:id/course-outline-versions/:courseOutlineVersionId/archive` | `course-management.course-outline.archive` |
| PATCH | `/course-offerings/:id` | `course-management.offering.manage` |
| PUT | `/course-offerings/:id/curriculum-binding` | `course-management.curriculum-binding.manage` |
| PUT | `/course-offerings/:id/syllabus-binding` | `course-management.syllabus-binding.manage` |
| PUT | `/course-offerings/:id/student-batch-binding` | `course-management.student-batch-binding.manage` |
| POST | `/course-offerings/:id/teacher-assignments` | `course-management.teacher-assignment.manage` |
| GET | `/course-offerings/:id/teacher-assignments` | `course-management.teacher-assignment.manage` |
| POST | `/courses` | `course-management.course.manage` |
| GET | `/courses` | `course-management.course.read` |
| GET | `/courses/:id` | `course-management.course.read` |
| PATCH | `/courses/:id` | `course-management.course.manage` |
| PUT | `/curriculum-versions/:id/approve` | `course-management.curriculum-version.lifecycle.manage` |
| PUT | `/curriculum-versions/:id/activate` | `course-management.curriculum-version.lifecycle.manage` |
| PUT | `/curriculum-versions/:id/retire` | `course-management.curriculum-version.lifecycle.manage` |
| PUT | `/curriculum-versions/:id/archive` | `course-management.curriculum-version.lifecycle.manage` |
| POST | `/enrollments` | `enrollment.record.create` |
| GET | `/enrollments` | `enrollment.record.read` |
| GET | `/enrollments/me` | `enrollment.record.self-request` |
| GET | `/enrollments/me/:id` | `enrollment.record.self-request` |
| GET | `/enrollments/:id` | `enrollment.record.read` |
| PATCH | `/enrollments/:id` | `enrollment.record.update` |
| POST | `/programs` | `course-management.program.manage` |
| GET | `/programs` | `course-management.program.read` |
| GET | `/programs/:id` | `course-management.program.read` |
| PATCH | `/programs/:id` | `course-management.program.manage` |
| POST | `/student-batches` | `course-management.student-batch.manage` |
| GET | `/student-batches` | `course-management.student-batch.read` |
| GET | `/student-batches/:id` | `course-management.student-batch.read` |
| PATCH | `/student-batches/:id` | `course-management.student-batch.manage` |
| PUT | `/students/:studentUserId/curriculum-assignments/:academicProgramId` | `course-management.student-curriculum-assignment.manage` |
| POST | `/syllabus-versions` | `course-management.syllabus-version.manage` |
| GET | `/syllabus-versions` | `course-management.syllabus-version.manage` |
| GET | `/syllabus-versions/:id` | `course-management.syllabus-version.manage` |
| PUT | `/syllabus-versions/:id/approve` | `course-management.syllabus-version.lifecycle.manage` |
| PUT | `/syllabus-versions/:id/activate` | `course-management.syllabus-version.lifecycle.manage` |
| PUT | `/syllabus-versions/:id/retire` | `course-management.syllabus-version.lifecycle.manage` |
| PUT | `/syllabus-versions/:id/archive` | `course-management.syllabus-version.lifecycle.manage` |
| POST | `/teacher-assignments/:id/unassign` | `course-management.teacher-assignment.manage` |


## Verified boundaries and limitations

Recorded server/runtime evidence covers academic CRUD, teacher assignment and student own-resource isolation (including original findings and successful access-control retests), curriculum-aware enrollment and immutable lineage, curriculum/syllabus governance, batch/coordinator management and focused Course Outline transitions.

Course Outline technical lifecycle is verified through DRAFT -> SUBMITTED_BY_TEACHER -> COORDINATOR_REVIEW -> RETURNED_FOR_CORRECTION -> resubmission/review -> APPROVED -> ACTIVE -> ARCHIVED. Exact active binding, concurrency, audit-failure rollback and safe object denial were tested in the recorded matrices.

**Pending:** permanent institutional Course Outline approval/activation/archival authority. Temporary exact runtime grants do not establish permanent Department Admin academic authority. Also pending: post-approval amendment/replacement governance, active/latest/historical read-selection semantics, StudentBatch snapshot policy if required, Programme Coordinator governance, topic-to-CLO mapping, supplemental resources, weekly/Lesson Plans, assessment schedule, full Course Outline/Teacher Workspace UI, and production biometric reconciliation.

The original [foundation](academic-core-foundation.md) retains detailed public contract and audit-event catalogs; they describe design surface, not proof every listed action has a current HTTP implementation.
