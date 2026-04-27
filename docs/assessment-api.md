# Assessment API

Assessment APIs are exposed under `/api/v1` and require `AuthGuard`, `PolicyGuard`, and an active department context.

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

## Constraints

- Every repository query includes `departmentId`.
- Assignment and quiz creation require the target course offering to belong to the active department.
- Teachers can manage assignments and quizzes only for course offerings where they have an active teacher assignment.
- Assignment submissions require an approved enrollment for the assignment course offering.
- Students can only submit, read submissions, and read quiz attempts for their own approved enrollment records.
- Assignment submissions enforce `availableFrom`, `closeAt`, `dueAt`, `allowLateSubmission`, `maxLateMinutes`, and `maxSubmissionCount`.
- Quiz attempts require an approved enrollment for the quiz course offering and enforce `startsAt`, `closeAt`, and `maxAttempts`.
- Quiz attempt submission only transitions attempts from `IN_PROGRESS` to `SUBMITTED`.
- Create/update actions write audit log records. Result processing, transcripts, notifications, grading, and question-engine workflows are intentionally out of scope.
