# Assessment Core

**Classification:** implemented generic assignment/quiz API foundation, with recorded server/runtime workflow and visibility/security retests; grading and question-engine integration remain partial/pending. See the [runtime index](runtime-test-checklist.md#current-verified-baseline-index).

This document owns generic assignments, quizzes, submissions, attempts and grading contracts. The Law-specific authoritative Activities /30 and Final Formative /40 pipeline is separate in [Formative Assessment](formative-assessment.md). Generic scores must not be presented as authoritative /40 evidence.

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


## Durable constraints and implementation boundary

Every entity is department-scoped. Assignments/quizzes belong to an offering; submissions/attempts belong to the matching Enrollment. Submission uniqueness is assignment + enrollment + attempt number; attempt uniqueness is quiz + enrollment + attempt number. Teachers require active assigned-course authority; students require their own approved enrollment.

Assignment state, publication/visibility, availableFrom, closeAt, dueAt, late policy, maxLateMinutes and maxSubmissionCount constrain writes. Quiz attempts enforce startsAt, closeAt and maxAttempts; submission transitions only IN_PROGRESS -> SUBMITTED. Students must not discover unpublished/out-of-scope assessments through lists or direct IDs. All guards, principal department and object checks apply; client department headers cannot override scope.

File constraints include maxFileCount, maxFileSizeBytes and allowedMimeTypes. SubmissionFile references only authorized approved FileObject records; secure retrieval and malware scanning remain file-storage responsibilities. A schema reference does not prove the end-to-end upload/submission integration is complete.

**Durable grading design, partial/foundation only:** GradingRecord supports AUTO, MANUAL or MIXED, immutable/superseding regrade history and reasoned corrections. Every grading/change requires audit; regrade requires step-up as a target requirement. Teachers grade only assigned offerings; students read only their own permitted feedback. Quiz timeLimitMinutes snapshots, timed AUTO_SUBMITTED handling, question/response scoring, evaluation hooks, plagiarism and external evaluators are design hooks, not claims of completed automation.

Assignment publish/close/archive/deadline changes, submission/upload/resubmission/file attachment, quiz publish/close/archive, attempt start/submit/auto-submit, and every grade/regrade must be audited. Owning modules expose contracts; no direct business-layer queries of another module's tables.

## Current API

All endpoints below are under /api/v1 and require AuthGuard, PolicyGuard and active department context.

## Endpoints

| Method | Path | Policy | Description |
| --- | --- | --- | --- |
| POST | `/assignments` | `assignment.manage` | Create an assignment for a course offering. |
| GET | `/assignments` | `assignment.read` | List assignments, optionally filtered by `courseOfferingId` and `status`. |
| GET | `/assignments/:id` | `assignment.read` | Get one assignment. |
| PATCH | `/assignments/:id` | `assignment.manage` | Update assignment settings. |
| POST | `/assignment-submissions` | `submission.create` | Submit work for an assignment enrollment. |
| GET | `/assignment-submissions` | `submission.read` | List submissions, optionally filtered by `assignmentId` and `enrollmentId`. Students only see their own enrollment records. |
| GET | `/assignment-submissions/:id` | `submission.read` | Get one submission. |
| POST | `/quizzes` | `quiz.manage` | Create a quiz for a course offering. |
| GET | `/quizzes` | `quiz.read` | List quizzes, optionally filtered by `courseOfferingId` and `status`. |
| GET | `/quizzes/:id` | `quiz.read` | Get one quiz. |
| POST | `/quiz-attempts/start` | `attempt.create` | Start a quiz attempt for an enrollment. |
| POST | `/quiz-attempts/submit` | `attempt.submit` | Mark an in-progress quiz attempt as submitted. |
| GET | `/quiz-attempts/:id` | `attempt.read` | Get one quiz attempt. |

## Policies

Department admins receive wildcard coverage for `assignment.*`, `submission.*`, `quiz.*`, and `attempt.*`.

Teachers receive:

- `assignment.manage`
- `assignment.read`
- `submission.read`
- `quiz.manage`
- `quiz.read`
- `attempt.read`

Students receive:

- `assignment.read`
- `submission.create`
- `submission.read`
- `quiz.read`
- `attempt.create`
- `attempt.submit`
- `attempt.read`


## Current limitations

The API supports scoped CRUD/submission/attempt behaviors above. It does not implement full grading, question-engine, plagiarism, comprehensive auto-grading, transcript, notification, or official result-publication side effects. File and timed-attempt design fields do not prove all lifecycle automation.

The runtime ledger preserves the assessment visibility finding and successful retest, including negative Teacher assignment and Student ownership checks. Full frontend and production readiness remain pending. Historical scaffold policy/event catalogs and schema relations remain in the [preserved source](legacy/phase-1/assessment-core.md); the current API table is the route contract.
