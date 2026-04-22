export const QUIZ_AUDIT_EVENTS = {
  RECORD_CREATED: "quiz.record.created",
  RECORD_UPDATED: "quiz.record.updated",
  RECORD_PUBLISHED: "quiz.record.published",
  RECORD_CLOSED: "quiz.record.closed",
  RECORD_ARCHIVED: "quiz.record.archived",
  ATTEMPT_STARTED: "quiz.attempt.started",
  ATTEMPT_SUBMITTED: "quiz.attempt.submitted",
  ATTEMPT_AUTO_SUBMITTED: "quiz.attempt.auto-submitted",
  ATTEMPT_GRADED: "quiz.attempt.graded",
  ATTEMPT_REGRADED: "quiz.attempt.regraded"
} as const;
