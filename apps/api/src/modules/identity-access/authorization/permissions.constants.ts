export const PERMISSIONS = {
  IDENTITY_ACCESS: {
    SESSION_READ_DEPARTMENT: "identity-access.session.read_department",
    SESSION_READ_SELF: "identity-access.session.read_self",
    SESSION_REVOKE_DEPARTMENT: "identity-access.session.revoke_department",
    SESSION_REVOKE_SELF: "identity-access.session.revoke_self",
    SESSION_FORCE_LOGOUT: "identity-access.session.force_logout",
    AUTH_STEP_UP: "identity-access.auth.step_up",
    AUTH_MANAGE_2FA_DEPARTMENT: "identity-access.auth.manage_2fa_department",
    AUTH_MANAGE_2FA_SELF: "identity-access.auth.manage_2fa_self",
    AUTH_PASSWORD_RESET_INITIATE_DEPARTMENT:
      "identity-access.auth.password_reset_initiate_department",
    AUTH_PASSWORD_RESET_INITIATE_SELF:
      "identity-access.auth.password_reset_initiate_self",
    AUTH_PASSWORD_RESET_COMPLETE_SELF:
      "identity-access.auth.password_reset_complete_self",
    AUTH_EMAIL_VERIFICATION_ISSUE_DEPARTMENT:
      "identity-access.auth.email_verification_issue_department",
    AUTH_EMAIL_VERIFICATION_RESEND_SELF:
      "identity-access.auth.email_verification_resend_self",
    AUTH_ACCOUNT_UNLOCK_DEPARTMENT:
      "identity-access.auth.account_unlock_department",
    AUTH_LOGIN_RISK_REVIEW_DEPARTMENT:
      "identity-access.auth.login_risk_review_department"
  },
  USER_MANAGEMENT: {
    USER_READ_DEPARTMENT: "user-management.user.read_department",
    USER_READ_SELF: "user-management.user.read_self",
    USER_CREATE_DEPARTMENT: "user-management.user.create_department",
    USER_UPDATE_DEPARTMENT: "user-management.user.update_department",
    USER_UPDATE_SELF: "user-management.user.update_self",
    USER_ARCHIVE_DEPARTMENT: "user-management.user.archive_department",
    USER_ASSIGN_ROLE_DEPARTMENT: "user-management.user.assign_role_department",
    USER_REVOKE_ROLE_DEPARTMENT: "user-management.user.revoke_role_department",
    USER_READ_ROLES_SELF: "user-management.user.read_roles_self"
  },
  DEPARTMENT_CONFIG: {
    DEPARTMENT_READ_DEPARTMENT: "department-config.department.read_department",
    DEPARTMENT_UPDATE_DEPARTMENT:
      "department-config.department.update_department",
    SETTINGS_READ_DEPARTMENT: "department-config.settings.read_department",
    SETTINGS_UPDATE_DEPARTMENT: "department-config.settings.update_department",
    RULES_READ_DEPARTMENT: "department-config.rules.read_department",
    RULES_UPDATE_DEPARTMENT: "department-config.rules.update_department"
  },
  COURSE_MANAGEMENT: {
    COURSE_READ_DEPARTMENT: "course-management.course.read_department",
    COURSE_READ_ASSIGNED: "course-management.course.read_assigned",
    COURSE_READ_ENROLLED: "course-management.course.read_enrolled",
    COURSE_CREATE_DEPARTMENT: "course-management.course.create_department",
    COURSE_UPDATE_ASSIGNED: "course-management.course.update_assigned",
    COURSE_ARCHIVE_DEPARTMENT: "course-management.course.archive_department"
  },
  ENROLLMENT: {
    ENROLLMENT_READ_DEPARTMENT: "enrollment.enrollment.read_department",
    ENROLLMENT_READ_SELF: "enrollment.enrollment.read_self",
    ENROLLMENT_CREATE_DEPARTMENT: "enrollment.enrollment.create_department",
    ENROLLMENT_UPDATE_DEPARTMENT: "enrollment.enrollment.update_department",
    ENROLLMENT_ARCHIVE_DEPARTMENT: "enrollment.enrollment.archive_department"
  },
  ATTENDANCE: {
    RECORD_READ_DEPARTMENT: "attendance.record.read_department",
    RECORD_READ_ASSIGNED: "attendance.record.read_assigned",
    RECORD_READ_SELF: "attendance.record.read_self",
    RECORD_CREATE_ASSIGNED: "attendance.record.create_assigned",
    RECORD_UPDATE_ASSIGNED: "attendance.record.update_assigned",
    RECORD_ARCHIVE_DEPARTMENT: "attendance.record.archive_department"
  },
  ASSIGNMENT: {
    ASSIGNMENT_READ_DEPARTMENT: "assignment.assignment.read_department",
    ASSIGNMENT_READ_ASSIGNED: "assignment.assignment.read_assigned",
    ASSIGNMENT_READ_SELF: "assignment.assignment.read_self",
    ASSIGNMENT_CREATE_ASSIGNED: "assignment.assignment.create_assigned",
    ASSIGNMENT_UPDATE_ASSIGNED: "assignment.assignment.update_assigned",
    ASSIGNMENT_ARCHIVE_ASSIGNED: "assignment.assignment.archive_assigned",
    SUBMISSION_READ_DEPARTMENT: "assignment.submission.read_department",
    SUBMISSION_READ_ASSIGNED: "assignment.submission.read_assigned",
    SUBMISSION_READ_SELF: "assignment.submission.read_self",
    SUBMISSION_CREATE_SELF: "assignment.submission.create_self",
    SUBMISSION_UPDATE_SELF_DRAFT: "assignment.submission.update_self_draft",
    SUBMISSION_GRADE_ASSIGNED: "assignment.submission.grade_assigned"
  },
  QUIZ: {
    QUIZ_READ_DEPARTMENT: "quiz.quiz.read_department",
    QUIZ_READ_ASSIGNED: "quiz.quiz.read_assigned",
    QUIZ_READ_SELF: "quiz.quiz.read_self",
    QUIZ_CREATE_ASSIGNED: "quiz.quiz.create_assigned",
    QUIZ_UPDATE_ASSIGNED: "quiz.quiz.update_assigned",
    QUIZ_ARCHIVE_ASSIGNED: "quiz.quiz.archive_assigned",
    ATTEMPT_READ_ASSIGNED: "quiz.attempt.read_assigned",
    ATTEMPT_READ_SELF: "quiz.attempt.read_self",
    ATTEMPT_CREATE_SELF: "quiz.attempt.create_self",
    ATTEMPT_SUBMIT_SELF: "quiz.attempt.submit_self",
    ATTEMPT_GRADE_ASSIGNED: "quiz.attempt.grade_assigned"
  },
  RESULT_PROCESSING: {
    RESULT_READ_DEPARTMENT: "result-processing.result.read_department",
    RESULT_READ_SELF: "result-processing.result.read_self",
    RESULT_GENERATE_DEPARTMENT: "result-processing.result.generate_department",
    RESULT_UPDATE_DEPARTMENT: "result-processing.result.update_department",
    RESULT_PUBLISH_DEPARTMENT: "result-processing.result.publish_department",
    RESULT_OVERRIDE_DEPARTMENT: "result-processing.result.override_department"
  },
  TRANSCRIPT_VERIFICATION: {
    TRANSCRIPT_READ_DEPARTMENT:
      "transcript-verification.transcript.read_department",
    TRANSCRIPT_READ_SELF: "transcript-verification.transcript.read_self",
    TRANSCRIPT_ISSUE_DEPARTMENT:
      "transcript-verification.transcript.issue_department",
    TRANSCRIPT_REVOKE_DEPARTMENT:
      "transcript-verification.transcript.revoke_department",
    VERIFICATION_READ_PUBLIC:
      "transcript-verification.verification.read_public",
    VERIFICATION_ISSUE_DEPARTMENT:
      "transcript-verification.verification.issue_department"
  },
  DISCUSSION: {
    THREAD_READ_DEPARTMENT: "discussion.thread.read_department",
    THREAD_READ_ASSIGNED: "discussion.thread.read_assigned",
    THREAD_READ_SELF: "discussion.thread.read_self",
    THREAD_CREATE_ASSIGNED: "discussion.thread.create_assigned",
    THREAD_UPDATE_OWNER: "discussion.thread.update_owner",
    THREAD_MODERATE_DEPARTMENT: "discussion.thread.moderate_department",
    POST_CREATE_ASSIGNED: "discussion.post.create_assigned",
    POST_UPDATE_OWNER: "discussion.post.update_owner",
    POST_MODERATE_DEPARTMENT: "discussion.post.moderate_department"
  },
  NOTIFICATION: {
    NOTIFICATION_READ_DEPARTMENT:
      "notification.notification.read_department",
    NOTIFICATION_READ_SELF: "notification.notification.read_self",
    NOTIFICATION_CREATE_DEPARTMENT:
      "notification.notification.create_department",
    NOTIFICATION_CREATE_ASSIGNED:
      "notification.notification.create_assigned",
    NOTIFICATION_UPDATE_DEPARTMENT:
      "notification.notification.update_department",
    NOTIFICATION_DISMISS_SELF: "notification.notification.dismiss_self"
  },
  FILE_STORAGE: {
    FILE_READ_DEPARTMENT: "file-storage.file.read_department",
    FILE_READ_OWNER: "file-storage.file.read_owner",
    FILE_READ_PUBLIC_VERIFICATION: "file-storage.file.read_public_verification",
    FILE_CREATE_DEPARTMENT: "file-storage.file.create_department",
    FILE_CREATE_SELF: "file-storage.file.create_self",
    FILE_UPDATE_OWNER: "file-storage.file.update_owner",
    FILE_QUARANTINE_DEPARTMENT: "file-storage.file.quarantine_department",
    FILE_DELETE_DEPARTMENT: "file-storage.file.delete_department"
  },
  AUDIT_COMPLIANCE: {
    AUDIT_READ_DEPARTMENT: "audit-compliance.audit.read_department",
    AUDIT_EXPORT_DEPARTMENT: "audit-compliance.audit.export_department",
    OVERRIDE_READ_DEPARTMENT: "audit-compliance.override.read_department",
    OVERRIDE_REQUEST_DEPARTMENT:
      "audit-compliance.override.request_department",
    OVERRIDE_APPROVE_DEPARTMENT:
      "audit-compliance.override.approve_department",
    OVERRIDE_EXECUTE_DEPARTMENT:
      "audit-compliance.override.execute_department"
  },
  REPORTING_DASHBOARD: {
    DASHBOARD_READ_DEPARTMENT:
      "reporting-dashboard.dashboard.read_department",
    DASHBOARD_EXPORT_DEPARTMENT:
      "reporting-dashboard.dashboard.export_department"
  },
  SYSTEM_CONFIGURATION: {
    SECURITY_READ_DEPARTMENT:
      "system-configuration.security.read_department",
    SECURITY_UPDATE_DEPARTMENT:
      "system-configuration.security.update_department",
    INTEGRATION_READ_DEPARTMENT:
      "system-configuration.integration.read_department",
    INTEGRATION_UPDATE_DEPARTMENT:
      "system-configuration.integration.update_department"
  }
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group)
);

export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

