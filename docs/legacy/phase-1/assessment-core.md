# Assessment Core

## Strategy

The assessment core foundation adds the minimum durable structure needed to support assignments, quizzes, submissions, attempts, and grading without implementing full workflows. It treats assessments as offering-bound academic resources, keeps student work tied to enrollment, and separates grading records from downstream result processing.

The design follows these rules:

- every assessment entity is department-scoped
- every assignment and quiz belongs to a `CourseOffering`
- every submission and attempt belongs to an `Enrollment`
- grading is auditable and supports later regrade controls
- file-based submission uses `FileObject` references rather than embedding storage logic
- evaluation hooks exist as placeholders for plagiarism, auto-grading, or external evaluators

This phase does not implement result processing, transcript generation, or notifications.

## Domain Model

### Assignment

- Offering-bound coursework definition
- Holds publishing state, schedule boundaries, late policy, submission limits, file constraints, plagiarism placeholder, and evaluation config

### AssignmentSubmission

- Student submission record tied to one assignment and one enrollment
- Tracks attempt number, submission status, lateness, notes, and evaluation hook state

### SubmissionFile

- Join record between `AssignmentSubmission` and `FileObject`
- Preserves submission ordering and display metadata while reusing the secure file pipeline

### Quiz

- Offering-bound quiz definition
- Holds publication state, access timing, time limit, max attempts, shuffling, auto-grading flag, and evaluation config

### QuizQuestion

- Child of `Quiz`
- Defines prompt, type, ordering, points, requiredness, and per-question config

### QuizOption

- Child of `QuizQuestion`
- Used for selectable question types
- Supports ordering and correctness metadata

### QuizAttempt

- Student attempt tied to quiz, offering, and enrollment
- Tracks attempt number, status, started/submitted timestamps, auto-submit state, and evaluation hook placeholder

### QuizResponse

- Child of `QuizAttempt`
- One response per question per attempt
- Supports selected option, text answer, correctness, and awarded points foundation

### GradingRecord

- Shared grading foundation for either `AssignmentSubmission` or `QuizAttempt`
- Stores grader, grading mode, score, feedback, regrade marker, and regrade reason
- Exists independently from later result-processing

## Prisma Schema Additions

Added enums:

- `AssignmentStatus`
- `SubmissionStatus`
- `QuizStatus`
- `QuizAttemptStatus`
- `QuizQuestionType`
- `GradingRecordTargetType`
- `GradingMode`
- `EvaluationHookStatus`

Added models:

- `Assignment`
- `AssignmentSubmission`
- `SubmissionFile`
- `Quiz`
- `QuizQuestion`
- `QuizOption`
- `QuizAttempt`
- `QuizResponse`
- `GradingRecord`

Added relations on existing models:

- `Department`
  - `assignments`
  - `assignmentSubmissions`
  - `submissionFiles`
  - `quizzes`
  - `quizQuestions`
  - `quizOptions`
  - `quizAttempts`
  - `quizResponses`
  - `gradingRecords`
- `CourseOffering`
  - `assignments`
  - `quizzes`
  - `quizAttempts`
  - `gradingRecords`
- `Enrollment`
  - `assignmentSubmissions`
  - `quizAttempts`
- `User`
  - `assignmentGradings`
  - `quizGradings`

## Lifecycle Enums

### Assignments

- `DRAFT`
- `PUBLISHED`
- `CLOSED`
- `ARCHIVED`

### Submissions

- `SUBMITTED`
- `LATE`
- `GRADED`
- `RESUBMITTED`

### Quizzes

- `DRAFT`
- `PUBLISHED`
- `ACTIVE`
- `CLOSED`
- `ARCHIVED`

### Attempts

- `IN_PROGRESS`
- `SUBMITTED`
- `AUTO_SUBMITTED`
- `GRADED`

## Rules and Constraints

### Assignment Tied to Course Offering

- every assignment belongs to one `CourseOffering`
- assignment department must equal offering department
- teacher management later derives from offering assignment, not assignment alone

### Submission Tied to Enrollment

- every submission belongs to one `Enrollment`
- submission enrollment must point to the same offering as the assignment
- uniqueness uses `assignmentId + enrollmentId + attemptNumber`

### Quiz Tied to Course Offering

- every quiz belongs to one `CourseOffering`
- quiz department must equal offering department

### Attempt Tied to Student + Offering

- every attempt belongs to one `Enrollment`
- every attempt also stores `courseOfferingId` for efficient scope filtering
- uniqueness uses `quizId + enrollmentId + attemptNumber`

### Time Limits for Quizzes

- quiz stores `timeLimitMinutes`
- attempt snapshots `timeLimitMinutesSnapshot`
- time-expired attempts may transition to `AUTO_SUBMITTED`

### Late Submission Rules

- assignment stores `allowLateSubmission` and `maxLateMinutes`
- submission tracks `isLate` and `lateByMinutes`
- late handling remains policy- and config-driven later

### Multiple Attempts Configuration

- assignment stores `maxSubmissionCount`
- quiz stores `maxAttempts`
- services later enforce limits by counting existing submissions or attempts

### File Upload Constraints

- assignment stores `maxFileCount`, `maxFileSizeBytes`, and `allowedMimeTypes`
- `SubmissionFile` only references approved `FileObject` records
- file malware scanning and authorization remain in `file-storage`

### Plagiarism Integration Placeholder

- assignment contains `plagiarismCheckEnabled`
- submission and attempt contain evaluation hook fields
- this reserves structure for future plagiarism and external evaluator integrations

### Auto-Grading vs Manual Grading

- quiz has `autoGradingEnabled`
- grading record stores `gradingMode` as `AUTO`, `MANUAL`, or `MIXED`
- grading record abstracts both assignment and quiz scoring without result-processing

## Authorization and Ownership Notes

### Assignment

- Read:
  - department admin and auditor by department scope
  - teacher only for assigned offerings
  - student only through offering visibility and publication rules later
- Create:
  - teacher for assigned offerings only
  - department admin by department scope
- Update:
  - teacher for assigned offerings only
  - department admin
- Archive:
  - teacher for assigned offerings if policy allows
  - department admin
- Scope checks:
  - offering department must match request department
  - teacher must have active `TeacherCourseAssignment`
- Audit:
  - publish/unpublish, archive, sensitive deadline changes

### Assignment Submission

- Read:
  - student only own submission
  - teacher only within assigned offering
  - department admin and auditor by department scope
- Create:
  - student only for own enrollment in the assignment offering
- Update:
  - student only own submission and only while allowed by assignment state
  - teacher/admin not for content mutation except controlled override paths later
- Archive:
  - not a routine student action; handled by admin workflow if needed
- Scope checks:
  - enrollment must belong to same offering as assignment
  - student principal must match enrollment student for self actions
- Audit:
  - upload, update, resubmission, grading-related state changes

### Quiz

- Read:
  - teacher for assigned offerings
  - department admin and auditor
  - student according to offering enrollment and publication state
- Create:
  - teacher for assigned offerings only
  - department admin
- Update:
  - teacher for assigned offerings while mutable
  - department admin
- Archive:
  - teacher for assigned offerings if allowed
  - department admin
- Scope checks:
  - offering department must match request department
- Audit:
  - publish/unpublish, archive, high-impact time-limit changes

### Quiz Attempt

- Read:
  - student only own attempts
  - teacher only within assigned offering
  - department admin and auditor by department scope
- Create:
  - student only for own enrollment in quiz offering
- Update:
  - system or student while attempt is `IN_PROGRESS`
- Archive:
  - not routine; admin cleanup path only if later introduced
- Scope checks:
  - enrollment must belong to same offering as quiz
  - student principal must match enrollment student for self actions
- Audit:
  - start, submit, auto-submit, grade changes

### Grading Record

- Read:
  - teacher in assigned offering
  - student only for own graded work later by policy
  - department admin and auditor by department scope
- Create:
  - teacher in assigned offering
  - department admin
- Update:
  - teacher/admin through controlled grading correction path
- Archive:
  - avoid delete; prefer append-only regrade records or superseding records
- Scope checks:
  - target submission or attempt must belong to offering in active department
  - grader must be authorized for that offering
- Audit:
  - mandatory for every grading and grading change
- Step-up:
  - required for regrade actions

## Audit Requirements

- `Assignment`
  - publish
  - unpublish or close
  - archive
- `AssignmentSubmission`
  - upload/create
  - resubmission
  - file attachment changes
- `Quiz`
  - publish
  - unpublish or close
  - archive
- `QuizAttempt`
  - submit
  - auto-submit
- `GradingRecord`
  - initial grading
  - grading change
  - regrade action

## NestJS Scaffolding

### assignment

Folder shape:

```text
assignment/
  application/
    ports/
    services/
  contracts/
  domain/
```

Public contracts:

- `AssignmentRecord`
- `AssignmentSubmissionRecord`
- `SubmissionFileRecord`
- `SubmissionEvaluationHook`
- `GradingRecordFoundation`

Repository boundary:

- assignment repository port owns assignment, submission, submission-file, and grading persistence for assignment targets
- file authorization remains external through file-storage contract
- offering, enrollment, and teacher-assignment validation must come through public contracts, not direct business-layer coupling

Policy names:

- `assignment.record.read`
- `assignment.record.create`
- `assignment.record.update`
- `assignment.record.archive`
- `assignment.submission.read`
- `assignment.submission.create`
- `assignment.submission.update`
- `assignment.submission.grade`
- `assignment.submission.regrade`

Audit event names:

- `assignment.record.created`
- `assignment.record.updated`
- `assignment.record.published`
- `assignment.record.closed`
- `assignment.record.archived`
- `assignment.submission.created`
- `assignment.submission.updated`
- `assignment.submission.resubmitted`
- `assignment.submission.file-attached`
- `assignment.submission.graded`
- `assignment.submission.regraded`

### quiz

Public contracts:

- `QuizRecord`
- `QuizQuestionRecord`
- `QuizOptionRecord`
- `QuizAttemptRecord`
- `QuizResponseRecord`
- `QuizEvaluationHook`
- `GradingRecordFoundation`

Repository boundary:

- quiz repository port owns quiz, question, option, attempt, response, and grading persistence for quiz targets
- offering and enrollment validation remains via public contracts from academic core
- auto-grading integration stays behind evaluation hook/config boundary

Policy names:

- `quiz.record.read`
- `quiz.record.create`
- `quiz.record.update`
- `quiz.record.archive`
- `quiz.attempt.read`
- `quiz.attempt.start`
- `quiz.attempt.submit`
- `quiz.attempt.grade`
- `quiz.attempt.regrade`

Audit event names:

- `quiz.record.created`
- `quiz.record.updated`
- `quiz.record.published`
- `quiz.record.closed`
- `quiz.record.archived`
- `quiz.attempt.started`
- `quiz.attempt.submitted`
- `quiz.attempt.auto-submitted`
- `quiz.attempt.graded`
- `quiz.attempt.regraded`

