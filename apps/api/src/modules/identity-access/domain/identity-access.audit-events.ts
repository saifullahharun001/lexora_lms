export const IDENTITY_ACCESS_AUDIT_EVENTS = {
  AUTH_REGISTERED: "identity-access.auth.registered",
  AUTH_LOGIN_SUCCEEDED: "identity-access.auth.login_succeeded",
  AUTH_LOGIN_FAILED: "identity-access.auth.login_failed",
  AUTH_LOGOUT_SUCCEEDED: "identity-access.auth.logout_succeeded",
  AUTH_REFRESH_SUCCEEDED: "identity-access.auth.refresh_succeeded",
  EMAIL_VERIFICATION_REQUESTED: "identity-access.email-verification.requested",
  EMAIL_VERIFIED: "identity-access.email-verification.verified",
  PASSWORD_RESET_REQUESTED: "identity-access.password-reset.requested",
  PASSWORD_RESET_COMPLETED: "identity-access.password-reset.completed"
} as const;
