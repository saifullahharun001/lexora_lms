# Academic Core Foundation

## Academic Core Strategy

The academic core foundation establishes the minimum durable structure required to support department-scoped academic operations later without implementing the full workflows yet. It defines academic structure, termization, course catalog ownership, offering-level delivery, teacher-course linkage, student enrollment anchors, session scheduling, attendance capture, import compatibility, and configurable eligibility scaffolding.

The design follows four rules:

- every academic record is department-scoped
- offering-level records are the runtime center of academic activity
- attendance is session-bound and enrollment-bound
- eligibility is configuration-driven and auditable

This foundation does not implement assignments, quizzes, results, transcripts, discussions, or notifications.

## Domain Model

### Department Academic Configuration

- One academic configuration record per department
- Stores department-level toggles and JSON-backed settings for self-enrollment, session/teacher requirements, attendance override behavior, biometric intake, and eligibility enforcement
- Updated through `department-config` only

### Academic Programs

- Department-owned program definitions such as BSc CSE, MBA, or Diploma programs
- Used to organize courses and optionally bind eligibility policies
- Lifecycle-oriented and archive-friendly

### Academic Years

- Department-owned academic year windows
- Define the broad annual container for terms/semesters
- Support planning, active use, closure, and archival

### Academic Terms / Semesters

- Child of academic year
- Runtime container for enrollment windows and course offerings
- Supports visibility and enrollment timing
- Important for student visibility and scoping of offerings

### Course Catalog

- Department-owned catalog entries
- Optional linkage to academic programs
- Catalog course is not the runtime delivery record
- Runtime delivery happens through course offerings

### Course Offerings

- Course delivery instance for one term and one section
- Runtime anchor for teacher assignment, enrollment, class sessions, attendance imports, and session scheduling
- This is the main academic unit students and teachers interact with later

### Teacher Assignments

- Binds a teacher user to a specific course offering
- Supports offering-level scope enforcement
- Teacher access later derives from this assignment rather than generic department membership

### Student Enrollments

- Binds a student to a course offering and term
- Captures source, approval status, and eligibility status snapshot
- Serves as the academic attendance anchor for the student

### Class Sessions

- Scheduled instructional occurrences inside a course offering
- Can optionally point to a responsible teacher assignment
- Attendance can only be recorded against valid class sessions

### Attendance Records

- One attendance record per class session plus enrollment pair
- No student self-marked attendance
- Supports source typing for manual, import, biometric, and system sources
- Supports override reason and override actor fields for audited correction paths

### Attendance Import Batches

- Records imported attendance payloads and processing state
- Supports biometric and external source integration compatibility
- Keeps raw batch-level governance separate from final attendance records

### Eligibility Rule Definitions

- Department-scoped rule definitions stored as versioned criteria
- Rules can bind to department, program, term, or offering
- Enrollment can snapshot derived eligibility status later without hard-coding criteria in service logic

## Prisma Schema Additions

Added models:

- `DepartmentAcademicConfig`
- `AcademicProgram`
- `AcademicYear`
- `AcademicTerm`
- `Course`
- `CourseOffering`
- `TeacherCourseAssignment`
- `Enrollment`
- `ClassSession`
- `AttendanceRecord`
- `AttendanceImportBatch`
- `EligibilityRuleDefinition`
- `EligibilityRuleBinding`

New department relations:

- `academicConfig`
- `academicPrograms`
- `academicYears`
- `academicTerms`
- `courses`
- `courseOfferings`
- `teacherAssignments`
- `enrollments`
- `classSessions`
- `attendanceRecords`
- `attendanceImportBatches`
- `eligibilityRuleDefinitions`
- `eligibilityRuleBindings`

New user relations:

- `academicConfigsUpdated`
- `teachingAssignments`
- `studentEnrollments`
- `enrollmentApprovals`
- `attendanceMarked`
- `attendanceOverrides`
- `attendanceImportBatchesUploaded`
- `attendanceImportBatchesReviewed`

## Lifecycle Enums

### Courses

- `DRAFT`
- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

### Course Offerings

- `PLANNED`
- `PUBLISHED`
- `ENROLLMENT_OPEN`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `ARCHIVED`

### Enrollments

- `PENDING`
- `APPROVED`
- `WAITLISTED`
- `REJECTED`
- `DROPPED`
- `WITHDRAWN`
- `ARCHIVED`

### Class Sessions

- `SCHEDULED`
- `ACTIVE`
- `COMPLETED`
- `CANCELED`
- `LOCKED`
- `ARCHIVED`

### Attendance Sync / Import Batches

- `RECEIVED`
- `VALIDATING`
- `PROCESSED`
- `PARTIALLY_PROCESSED`
- `FAILED`
- `CANCELED`
- `ARCHIVED`

### Eligibility Status Foundation

- `ELIGIBLE`
- `INELIGIBLE`
- `CONDITIONAL`
- `PENDING_REVIEW`

## Rules and Constraints

### Department Scoping

- Every academic core entity carries `departmentId`
- Child entities must remain within the same department as their parent aggregate
- Cross-department joins are invalid by design

### Student Visibility by Semester / Year

- Students should only later see offerings and enrollments within terms that belong to their department
- Visibility should be constrained by offering publication state and term lifecycle
- Year and term context are the primary visibility filters, not course catalog alone

### Self-Enrollment Restrictions

- Self-enrollment is governed by department academic configuration
- If enabled, it should still respect offering state, enrollment window, and eligibility state
- Approval may still be required depending on department config

### Teacher Assignment Scoping

- Teacher academic access must come from `TeacherCourseAssignment`
- Department membership alone is insufficient for offering-level teacher actions
- Session leadership should reference either a teacher assignment or an auditable override path

### Attendance Only During Active Sessions

- Attendance creation and mutation should be limited to `ACTIVE` or explicitly allowed correction windows
- Locked, canceled, archived, or completed sessions should require stricter correction rules

### No Student Self-Marked Attendance

- Students never create or update attendance records directly
- Attendance originates from teacher, admin override, import, biometric, or system source

### Biometric External-Source Compatibility

- `AttendanceImportBatch` and `AttendanceRecord.externalSourceRef` support biometric integration
- External-source ingestion must remain batch-oriented and auditable
- Imported records should preserve source metadata and reconciliation context

### Manual Override Audit Dependency

- Manual attendance overrides require reason capture
- Override actor must be stored
- Sensitive override actions must produce audit events

### Configurable Eligibility Criteria Foundation

- Eligibility logic lives in versioned `EligibilityRuleDefinition.criteriaJson`
- Rule binding attaches criteria to department, program, term, or offering
- Enrollment can snapshot evaluated eligibility result without embedding rule logic in schema

## Ownership and Authorization Notes

### Department Academic Configuration

- Read: `department_admin`, `auditor`, limited `support`
- Create: system initialization or department admin bootstrap flow
- Update: `department_admin`
- Archive: rare, controlled
- Scope checks: active department only
- Audit: mandatory for changes

### Academic Programs

- Read: department admin, auditor, teacher within department, students via filtered catalog view later
- Create: department admin
- Update: department admin
- Archive: department admin
- Scope checks: same department
- Audit: create, update, archive

### Academic Years and Terms

- Read: department-wide according to role
- Create: department admin
- Update: department admin
- Archive/Close: department admin
- Scope checks: same department, term must belong to year
- Audit: create, state change, archive

### Courses

- Read: department-wide by authorized role
- Create: department admin
- Update: department admin
- Archive: department admin
- Scope checks: same department, optional program must share department
- Audit: create, update, archive

### Course Offerings

- Read: department-wide by authorized role; student visibility later filtered by term/offering state
- Create: department admin
- Update: department admin
- Archive/Cancel: department admin
- Scope checks: course and term must share department
- Audit: create, state change, archive/cancel

### Teacher Assignments

- Read: department admin, assigned teacher, auditor
- Create: department admin
- Update: department admin
- Archive/Deactivate: department admin
- Scope checks: teacher user and offering must share department
- Audit: assign, reassign, unassign

### Enrollments

- Read: department admin, auditor, assigned teacher in context, student self
- Create: department admin or self-service flow later if enabled
- Update: department admin
- Archive/Drop/Withdraw: department admin according to workflow
- Scope checks: student, offering, term, and department must align
- Audit: create, approve, reject, drop, withdraw, archive

### Class Sessions

- Read: department admin, assigned teacher, enrolled students later by policy
- Create: department admin or delegated schedule service
- Update: department admin or tightly scoped assigned-teacher edits later
- Archive/Cancel/Lock: department admin
- Scope checks: offering and optional teacher assignment must align to same department
- Audit: create, cancel, lock, manual time corrections

### Attendance Records

- Read: department admin, assigned teacher, auditor, student self read later
- Create: teacher in assigned context, admin override path, import/system path
- Update: teacher during valid session window, admin override path
- Archive/Delete: avoid routine delete; archive/override pattern preferred
- Scope checks: session, enrollment, student, and department must match
- Audit: mandatory for manual overrides and sensitive corrections

### Attendance Import Batches

- Read: department admin, auditor, limited support
- Create: authorized import path only
- Update: processing pipeline only
- Archive/Cancel: department admin
- Scope checks: batch and optional offering/session must share department
- Audit: create, processing outcome, cancel, reconciliation override

### Eligibility Rule Definitions and Bindings

- Read: department admin, auditor
- Create: department admin
- Update: department admin
- Archive: department admin
- Scope checks: binding target and rule must share department
- Audit: create, version, activate/deactivate, archive

## NestJS Scaffolding

### department-config

Folder shape:

```text
department-config/
  application/
    ports/
    services/
  contracts/
  domain/
```

Public contracts:

- `DepartmentAcademicConfigRecord`

Boundary design:

- service owns academic-config business rules
- repository port owns persistence reads/writes for config only

Policy names:

- `department-config.academic-config.read`
- `department-config.academic-config.update`

Audit events:

- `department-config.academic-config.updated`

### course-management

Public contracts:

- `AcademicProgramRecord`
- `AcademicYearRecord`
- `AcademicTermRecord`
- `CourseRecord`
- `CourseOfferingRecord`
- `TeacherCourseAssignmentRecord`
- `EligibilityRuleDefinitionRecord`
- `EligibilityRuleBindingRecord`

Boundary design:

- service layer orchestrates program/year/term/course/offering/assignment/rule coordination
- repository port reads and persists catalog and offering structures
- no enrollment or attendance table access directly from this module without interface boundary

Policy names:

- `course-management.program.manage`
- `course-management.term.manage`
- `course-management.course.manage`
- `course-management.offering.manage`
- `course-management.teacher-assignment.manage`
- `course-management.eligibility-rule.manage`

Audit events:

- `course-management.program.created`
- `course-management.program.updated`
- `course-management.program.archived`
- `course-management.term.created`
- `course-management.term.state-changed`
- `course-management.course.created`
- `course-management.course.updated`
- `course-management.course.archived`
- `course-management.offering.created`
- `course-management.offering.updated`
- `course-management.offering.state-changed`
- `course-management.teacher-assignment.assigned`
- `course-management.teacher-assignment.unassigned`
- `course-management.eligibility-rule.created`
- `course-management.eligibility-rule.updated`
- `course-management.eligibility-rule.bound`

### enrollment

Public contracts:

- `EnrollmentRecord`
- `EnrollmentEligibilitySnapshot`

Boundary design:

- service owns enrollment status transitions and eligibility checks
- repository port owns enrollment persistence
- eligibility evaluation comes through course-management public contract, not direct table access

Policy names:

- `enrollment.record.read`
- `enrollment.record.create`
- `enrollment.record.update`
- `enrollment.record.archive`
- `enrollment.record.self-request`

Audit events:

- `enrollment.record.created`
- `enrollment.record.approved`
- `enrollment.record.rejected`
- `enrollment.record.dropped`
- `enrollment.record.withdrawn`
- `enrollment.record.archived`

### class-session

Public contracts:

- `ClassSessionRecord`

Boundary design:

- service owns session scheduling constraints, session state, and teacher-assignment/session consistency
- repository port owns session persistence
- offering and assignment lookups come through public interfaces

Policy names:

- `class-session.record.read`
- `class-session.record.create`
- `class-session.record.update`
- `class-session.record.cancel`
- `class-session.record.lock`

Audit events:

- `class-session.record.created`
- `class-session.record.updated`
- `class-session.record.canceled`
- `class-session.record.locked`

### attendance

Public contracts:

- `AttendanceRecordEntry`
- `AttendanceImportBatchRecord`

Boundary design:

- service owns attendance rules, source validation, override semantics, and batch processing boundaries
- repository port owns attendance and import batch persistence
- session and enrollment consistency must be checked through public contracts, not direct cross-module table access in business logic

Policy names:

- `attendance.record.read`
- `attendance.record.capture`
- `attendance.record.override`
- `attendance.import-batch.read`
- `attendance.import-batch.create`
- `attendance.import-batch.process`
- `attendance.import-batch.cancel`

Audit events:

- `attendance.record.captured`
- `attendance.record.overridden`
- `attendance.record.imported`
- `attendance.import-batch.received`
- `attendance.import-batch.processed`
- `attendance.import-batch.failed`
- `attendance.import-batch.canceled`

