import type { PermissionGrant, PlatformRole } from "@lexora/types";

export interface AuthenticatedUserRecord {
  id: string;
  departmentId: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  departmentId: string;
  refreshTokenHash: string;
  deviceFingerprintHash: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastIpAddress: string | null;
  userAgent: string | null;
  lastUserAgent: string | null;
  status: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface VerificationRecord {
  id: string;
  userId: string;
  departmentId: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface PasswordResetRecord extends VerificationRecord {}

export interface AuthProfile {
  user: AuthenticatedUserRecord;
  roles: PlatformRole[];
  permissions: PermissionGrant[];
  twoFactorEnabled: boolean;
}

export interface IdentityAccessRepositoryPort {
  findDepartmentByCodeOrSlug(input: string): Promise<{ id: string; code: string; slug: string; status: string } | null>;
  findUserByEmailAndDepartment(
    normalizedEmail: string,
    departmentId: string
  ): Promise<AuthenticatedUserRecord | null>;
  findUserById(userId: string): Promise<AuthenticatedUserRecord | null>;
  createUser(input: {
    departmentId: string;
    email: string;
    normalizedEmail: string;
    passwordHash: string;
    displayName: string;
  }): Promise<AuthenticatedUserRecord>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  updateUserStatus(userId: string, status: string): Promise<void>;
  updateUserLastLoginAt(userId: string, lastLoginAt: Date): Promise<void>;
  findRoleByCode(
    departmentId: string,
    code: string
  ): Promise<{ id: string; code: string } | null>;
  assignRoleToUser(input: {
    userId: string;
    roleId: string;
    departmentId: string;
  }): Promise<void>;
  loadAuthProfile(userId: string): Promise<AuthProfile | null>;
  createSession(input: {
    userId: string;
    departmentId: string;
    refreshTokenHash: string;
    deviceFingerprintHash: string | null;
    deviceLabel: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findSessionById(sessionId: string): Promise<SessionRecord | null>;
  updateSessionRotation(input: {
    sessionId: string;
    refreshTokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<void>;
  revokeSession(sessionId: string, revokedAt: Date, reason: string): Promise<void>;
  createLoginAttempt(input: {
    userId: string | null;
    departmentId: string | null;
    normalizedEmail: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceFingerprintHash: string | null;
    outcome: "SUCCESS" | "FAILURE" | "LOCKED" | "STEP_UP_REQUIRED" | "BLOCKED";
    failureReason: string | null;
  }): Promise<void>;
  countRecentLoginFailures(input: {
    normalizedEmail: string;
    departmentId: string | null;
    since: Date;
  }): Promise<number>;
  findMostRecentLockout(input: {
    normalizedEmail: string;
    departmentId: string | null;
    since: Date;
  }): Promise<Date | null>;
  createSuspiciousLoginEvent(input: {
    userId: string;
    departmentId: string;
    reason:
      | "NEW_DEVICE"
      | "NEW_IP"
      | "IMPOSSIBLE_TRAVEL"
      | "EXCESSIVE_FAILURES"
      | "RAPID_SESSION_CHURN"
      | "STEP_UP_FAILURE";
    ipAddress: string | null;
    userAgent: string | null;
    deviceFingerprintHash: string | null;
    riskScore: number;
    requiresStepUp: boolean;
    resolutionNotes: string | null;
  }): Promise<void>;
  createEmailVerification(input: {
    userId: string;
    departmentId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationRecord>;
  findPendingEmailVerificationByTokenHash(
    tokenHash: string
  ): Promise<VerificationRecord | null>;
  consumeEmailVerification(recordId: string, verifiedAt: Date): Promise<void>;
  createPasswordReset(input: {
    userId: string;
    departmentId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord>;
  findPendingPasswordResetByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetRecord | null>;
  consumePasswordReset(recordId: string, consumedAt: Date): Promise<void>;
}
