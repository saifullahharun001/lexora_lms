export const STEP_UP_POLICY_NAMES = {
  SESSION_FORCE_LOGOUT: "session.force_logout",
  ROLE_ASSIGNMENT: "user.role_assignment",
  ROLE_REVOCATION: "user.role_revocation",
  USER_ARCHIVE: "user.archive",
  PASSWORD_RESET_ASSIST: "identity.password_reset_assist",
  ACCOUNT_UNLOCK: "identity.account_unlock",
  DEPARTMENT_SETTINGS_UPDATE: "department.settings_update",
  SECURITY_CONFIGURATION_UPDATE: "security.configuration_update",
  RESULT_OVERRIDE: "result.override",
  TRANSCRIPT_ISSUE: "transcript.issue",
  TRANSCRIPT_REVOKE: "transcript.revoke",
  AUDIT_EXPORT: "audit.export",
  OVERRIDE_APPROVE: "override.approve",
  OVERRIDE_EXECUTE: "override.execute",
  FILE_DELETE: "file.delete",
  FILE_QUARANTINE: "file.quarantine",
  SUSPICIOUS_LOGIN_CONFIRMATION: "identity.suspicious_login_confirmation"
} as const;

export type StepUpPolicyName =
  (typeof STEP_UP_POLICY_NAMES)[keyof typeof STEP_UP_POLICY_NAMES];

export type StepUpMethod = "totp" | "email_otp" | "re_auth";

export interface StepUpRequirementDescriptor {
  policy: StepUpPolicyName;
  methods: StepUpMethod[];
  maxAgeSeconds: number;
  mandatoryForRoles?: string[];
}

