export const POLICY_NAMES = {
  USER_SELF: "user.self",
  USER_DEPARTMENT_ADMIN: "user.department_admin",
  USER_SUPPORT_UPDATE: "user.support_update",
  DEPARTMENT_UPDATE: "department.update",
  COURSE_ASSIGNED_TEACHER: "course.assigned_teacher",
  ENROLLMENT_SELF: "enrollment.self",
  SESSION_SELF: "session.self",
  SESSION_FORCE_LOGOUT: "session.force_logout",
  ATTENDANCE_ASSIGNED_TEACHER: "attendance.assigned_teacher",
  ASSIGNMENT_ASSIGNED_TEACHER: "assignment.assigned_teacher",
  SUBMISSION_SELF: "submission.self",
  SUBMISSION_GRADE_ASSIGNED: "submission.grade_assigned",
  QUIZ_ASSIGNED_TEACHER: "quiz.assigned_teacher",
  RESULT_SELF: "result.self",
  RESULT_OVERRIDE: "result.override",
  TRANSCRIPT_SELF: "transcript.self",
  TRANSCRIPT_ISSUE: "transcript.issue",
  FILE_OWNER: "file.owner",
  FILE_PUBLIC_VERIFICATION: "file.public_verification",
  DISCUSSION_OWNER: "discussion.owner",
  AUDIT_READ: "audit.read",
  OVERRIDE_APPROVAL: "override.approval"
} as const;

export type PolicyName = (typeof POLICY_NAMES)[keyof typeof POLICY_NAMES];

