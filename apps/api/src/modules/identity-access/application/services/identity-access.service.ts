import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type { AuditWriter } from "@/common/audit/audit.contract";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { AuthProfile, IdentityAccessRepositoryPort } from "../ports/identity-access.repository.port";
import type { PlatformRole } from "@lexora/types";

import { PLATFORM_ROLES } from "../../authorization/roles.constants";
import { IDENTITY_ACCESS_AUDIT_EVENTS } from "../../domain/identity-access.audit-events";
import { validatePasswordPolicy } from "../../domain/password-policy";
import { PasswordHasherService } from "../../infrastructure/password-hasher.service";
import { TokenHasherService } from "../../infrastructure/token-hasher.service";

interface RegisterInput {
  departmentCode: string;
  email: string;
  displayName: string;
  password: string;
  deviceLabel?: string;
}

interface LoginInput {
  departmentCode: string;
  email: string;
  password: string;
  deviceLabel?: string;
  deviceFingerprint?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResponse {
  user: {
    id: string;
    departmentId: string;
    email: string;
    displayName: string;
    status: string;
    roles: PlatformRole[];
    permissions: string[];
  };
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  twoFactor: {
    enabled: boolean;
    required: boolean;
    availableMethods: string[];
  };
}

interface RefreshTokenPayload {
  sub: string;
  sid: string;
  did: string;
  typ: "refresh";
  jti: string;
}

type DurationString = `${number}${"s" | "m" | "h" | "d"}`;

@Injectable()
export class IdentityAccessService {
  constructor(
    @Inject("IdentityAccessRepositoryPort")
    private readonly repository: IdentityAccessRepositoryPort,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenHasher: TokenHasherService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly requestContextService: RequestContextService,
    @Inject("AuditWriter")
    private readonly auditWriter: AuditWriter
  ) {}

  async register(input: RegisterInput) {
    const department = await this.getActiveDepartment(input.departmentCode);
    const normalizedEmail = input.email.trim().toLowerCase();

    this.assertAllowedEmailDomain(normalizedEmail);
    validatePasswordPolicy(input.password);

    const existingUser = await this.repository.findUserByEmailAndDepartment(
      normalizedEmail,
      department.id
    );

    if (existingUser) {
      throw new ConflictException("An account already exists for that email in this department");
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.repository.createUser({
      departmentId: department.id,
      email: input.email.trim(),
      normalizedEmail,
      passwordHash,
      displayName: input.displayName.trim()
    });

    const studentRole = await this.repository.findRoleByCode(
      department.id,
      PLATFORM_ROLES.STUDENT
    );

    if (studentRole) {
      await this.repository.assignRoleToUser({
        userId: user.id,
        roleId: studentRole.id,
        departmentId: department.id
      });
    }

    const verificationToken = this.tokenHasher.generateOpaqueToken();
    await this.repository.createEmailVerification({
      userId: user.id,
      departmentId: department.id,
      email: user.email,
      tokenHash: this.tokenHasher.hash(verificationToken),
      expiresAt: this.getFutureDate(this.configService.getOrThrow<number>("auth.otpTtlSeconds") * 1000)
    });

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.AUTH_REGISTERED,
      actorId: user.id,
      targetId: user.id,
      departmentId: department.id,
      outcome: "success",
      metadata: {
        email: user.email,
        defaultStudentRoleProvisioned: Boolean(studentRole)
      }
    });

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.EMAIL_VERIFICATION_REQUESTED,
      actorId: user.id,
      targetId: user.id,
      departmentId: department.id,
      outcome: "success",
      metadata: {
        email: user.email
      }
    });

    return {
      user: this.toSafeUser({
        ...user,
        roles: studentRole ? [PLATFORM_ROLES.STUDENT] : [],
        permissions: []
      }),
      emailVerificationRequired: true,
      verificationToken:
        this.configService.getOrThrow<string>("app.nodeEnv") === "production"
          ? undefined
          : verificationToken
    };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const department = await this.getActiveDepartment(input.departmentCode);
    const normalizedEmail = input.email.trim().toLowerCase();
    const deviceFingerprintHash = input.deviceFingerprint
      ? this.tokenHasher.hash(input.deviceFingerprint)
      : null;

    await this.assertLoginNotLocked(normalizedEmail, department.id);

    const authProfile = await this.resolveAuthProfile(normalizedEmail, department.id);

    if (!authProfile?.user.passwordHash) {
      await this.recordLoginFailure({
        userId: authProfile?.user.id ?? null,
        departmentId: department.id,
        normalizedEmail,
        deviceFingerprintHash,
        reason: "invalid_credentials"
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await this.passwordHasher.compare(
      input.password,
      authProfile.user.passwordHash
    );

    if (!passwordMatches) {
      await this.recordLoginFailure({
        userId: authProfile.user.id,
        departmentId: department.id,
        normalizedEmail,
        deviceFingerprintHash,
        reason: "invalid_credentials"
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    if (authProfile.user.status !== "ACTIVE") {
      throw new ForbiddenException("Email verification is required before login");
    }

    const tokens = await this.issueSessionTokens({
      userId: authProfile.user.id,
      departmentId: authProfile.user.departmentId,
      deviceFingerprintHash,
      deviceLabel: input.deviceLabel ?? null
    });

    await this.repository.updateUserLastLoginAt(authProfile.user.id, new Date());
    await this.repository.createLoginAttempt({
      userId: authProfile.user.id,
      departmentId: department.id,
      normalizedEmail,
      ipAddress: this.requestContextService.get()?.audit.ipAddress ?? null,
      userAgent: this.requestContextService.get()?.audit.userAgent ?? null,
      deviceFingerprintHash,
      outcome: "SUCCESS",
      failureReason: null
    });

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.AUTH_LOGIN_SUCCEEDED,
      actorId: authProfile.user.id,
      targetId: authProfile.user.id,
      departmentId: department.id,
      outcome: "success",
      metadata: {
        roles: authProfile.roles
      }
    });

    return this.buildAuthResponse(authProfile, tokens);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { success: true };
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(payload.sid);

    if (session && session.status === "ACTIVE" && !session.revokedAt) {
      await this.repository.revokeSession(session.id, new Date(), "logout");
      await this.writeAudit({
        action: IDENTITY_ACCESS_AUDIT_EVENTS.AUTH_LOGOUT_SUCCEEDED,
        actorId: session.userId,
        targetId: session.id,
        departmentId: session.departmentId,
        outcome: "success",
        metadata: {
          reason: "logout"
        }
      });
    }

    return { success: true };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(payload.sid);

    if (!session || session.status !== "ACTIVE" || session.revokedAt) {
      throw new UnauthorizedException("Session is no longer active");
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    const presentedRefreshTokenHash = this.tokenHasher.hash(refreshToken);

    if (!this.tokenHasher.compareHashes(presentedRefreshTokenHash, session.refreshTokenHash)) {
      throw new UnauthorizedException("Refresh token rotation mismatch");
    }

    const authProfile = await this.repository.loadAuthProfile(payload.sub);

    if (!authProfile || authProfile.user.status !== "ACTIVE") {
      throw new UnauthorizedException("User is no longer active");
    }

    const tokens = await this.rotateSessionTokens(session.id, {
      userId: authProfile.user.id,
      departmentId: authProfile.user.departmentId
    });

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.AUTH_REFRESH_SUCCEEDED,
      actorId: authProfile.user.id,
      targetId: session.id,
      departmentId: authProfile.user.departmentId,
      outcome: "success",
      metadata: {
        rotated: true
      }
    });

    return this.buildAuthResponse(authProfile, tokens);
  }

  async requestPasswordReset(input: { departmentCode: string; email: string }) {
    const department = await this.getActiveDepartment(input.departmentCode);
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.repository.findUserByEmailAndDepartment(
      normalizedEmail,
      department.id
    );

    let resetToken: string | undefined;

    if (user) {
      resetToken = this.tokenHasher.generateOpaqueToken();
      await this.repository.createPasswordReset({
        userId: user.id,
        departmentId: department.id,
        tokenHash: this.tokenHasher.hash(resetToken),
        expiresAt: this.getFutureDate(this.configService.getOrThrow<number>("auth.otpTtlSeconds") * 1000)
      });

      await this.writeAudit({
        action: IDENTITY_ACCESS_AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
        actorId: user.id,
        targetId: user.id,
        departmentId: department.id,
        outcome: "success",
        metadata: {
          email: user.email
        }
      });
    }

    return {
      success: true,
      resetToken:
        resetToken &&
        this.configService.getOrThrow<string>("app.nodeEnv") !== "production"
          ? resetToken
          : undefined
    };
  }

  async resetPassword(input: { token: string; newPassword: string }) {
    validatePasswordPolicy(input.newPassword);
    const tokenHash = this.tokenHasher.hash(input.token);
    const record = await this.repository.findPendingPasswordResetByTokenHash(tokenHash);

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Password reset token is invalid or expired");
    }

    const newPasswordHash = await this.passwordHasher.hash(input.newPassword);
    await this.repository.updateUserPassword(record.userId, newPasswordHash);
    await this.repository.consumePasswordReset(record.id, new Date());

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
      actorId: record.userId,
      targetId: record.userId,
      departmentId: record.departmentId,
      outcome: "success",
      metadata: {
        resetRecordId: record.id
      }
    });

    return { success: true };
  }

  async verifyEmail(input: { token: string }) {
    const tokenHash = this.tokenHasher.hash(input.token);
    const record = await this.repository.findPendingEmailVerificationByTokenHash(tokenHash);

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Email verification token is invalid or expired");
    }

    await this.repository.consumeEmailVerification(record.id, new Date());
    await this.repository.updateUserStatus(record.userId, "ACTIVE");

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.EMAIL_VERIFIED,
      actorId: record.userId,
      targetId: record.userId,
      departmentId: record.departmentId,
      outcome: "success",
      metadata: {
        verificationRecordId: record.id
      }
    });

    return { success: true };
  }

  private async resolveAuthProfile(
    normalizedEmail: string,
    departmentId: string
  ): Promise<AuthProfile | null> {
    const user = await this.repository.findUserByEmailAndDepartment(
      normalizedEmail,
      departmentId
    );

    if (!user) {
      return null;
    }

    return this.repository.loadAuthProfile(user.id);
  }

  private assertAllowedEmailDomain(normalizedEmail: string) {
    const allowedDomains = this.configService.getOrThrow<string[]>(
      "auth.universityEmailDomains"
    );

    if (allowedDomains.length === 0) {
      return;
    }

    const [, emailDomain] = normalizedEmail.split("@");

    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      throw new BadRequestException("Registration requires an official university email address");
    }
  }

  private async assertLoginNotLocked(normalizedEmail: string, departmentId: string) {
    const lockoutDurationMinutes = this.configService.getOrThrow<number>(
      "auth.lockoutDurationMinutes"
    );
    const recentLockout = await this.repository.findMostRecentLockout({
      normalizedEmail,
      departmentId,
      since: this.getPastDate(lockoutDurationMinutes * 60 * 1000)
    });

    if (recentLockout) {
      throw new UnauthorizedException("Account temporarily locked due to repeated failed sign-in attempts");
    }
  }

  private async recordLoginFailure(input: {
    userId: string | null;
    departmentId: string | null;
    normalizedEmail: string;
    deviceFingerprintHash: string | null;
    reason: string;
  }) {
    const requestContext = this.requestContextService.get();
    const now = new Date();
    const failureWindowMinutes = this.configService.getOrThrow<number>(
      "auth.lockoutWindowMinutes"
    );
    const failureThreshold = this.configService.getOrThrow<number>(
      "auth.lockoutFailureThreshold"
    );

    await this.repository.createLoginAttempt({
      userId: input.userId,
      departmentId: input.departmentId,
      normalizedEmail: input.normalizedEmail,
      ipAddress: requestContext?.audit.ipAddress ?? null,
      userAgent: requestContext?.audit.userAgent ?? null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      outcome: "FAILURE",
      failureReason: input.reason
    });

    const failureCount = await this.repository.countRecentLoginFailures({
      normalizedEmail: input.normalizedEmail,
      departmentId: input.departmentId,
      since: this.getPastDate(failureWindowMinutes * 60 * 1000)
    });

    await this.writeAudit({
      action: IDENTITY_ACCESS_AUDIT_EVENTS.AUTH_LOGIN_FAILED,
      actorId: input.userId ?? "anonymous",
      targetId: input.userId ?? undefined,
      departmentId: input.departmentId ?? undefined,
      outcome: "failure",
      metadata: {
        failureCount,
        reason: input.reason
      }
    });

    if (failureCount >= failureThreshold && input.userId && input.departmentId) {
      await this.repository.createLoginAttempt({
        userId: input.userId,
        departmentId: input.departmentId,
        normalizedEmail: input.normalizedEmail,
        ipAddress: requestContext?.audit.ipAddress ?? null,
        userAgent: requestContext?.audit.userAgent ?? null,
        deviceFingerprintHash: input.deviceFingerprintHash,
        outcome: "LOCKED",
        failureReason: "temporary_lockout"
      });

      await this.repository.createSuspiciousLoginEvent({
        userId: input.userId,
        departmentId: input.departmentId,
        reason: "EXCESSIVE_FAILURES",
        ipAddress: requestContext?.audit.ipAddress ?? null,
        userAgent: requestContext?.audit.userAgent ?? null,
        deviceFingerprintHash: input.deviceFingerprintHash,
        riskScore: 80,
        requiresStepUp: true,
        resolutionNotes: "Lockout threshold exceeded"
      });
    }

  }

  private async issueSessionTokens(input: {
    userId: string;
    departmentId: string;
    deviceFingerprintHash: string | null;
    deviceLabel: string | null;
  }): Promise<AuthTokens> {
    const refreshTokenExpiresAt = this.getFutureDate(this.getRefreshTtlMs());
    const refreshTokenPlaceholder = "pending";
    const session = await this.repository.createSession({
      userId: input.userId,
      departmentId: input.departmentId,
      refreshTokenHash: refreshTokenPlaceholder,
      deviceFingerprintHash: input.deviceFingerprintHash,
      deviceLabel: input.deviceLabel,
      ipAddress: this.requestContextService.get()?.audit.ipAddress ?? null,
      userAgent: this.requestContextService.get()?.audit.userAgent ?? null,
      expiresAt: refreshTokenExpiresAt
    });

    const refreshToken = await this.signRefreshToken({
      sub: input.userId,
      sid: session.id,
      did: input.departmentId,
      typ: "refresh",
      jti: randomUUID()
    });

    await this.repository.updateSessionRotation({
      sessionId: session.id,
      refreshTokenHash: this.tokenHasher.hash(refreshToken),
      ipAddress: this.requestContextService.get()?.audit.ipAddress ?? null,
      userAgent: this.requestContextService.get()?.audit.userAgent ?? null,
      expiresAt: refreshTokenExpiresAt
    });

    return {
      accessToken: await this.signAccessToken({
        sub: input.userId,
        did: input.departmentId
      }),
      refreshToken,
      refreshTokenExpiresAt
    };
  }

  private async rotateSessionTokens(
    sessionId: string,
    input: { userId: string; departmentId: string }
  ): Promise<AuthTokens> {
    const refreshTokenExpiresAt = this.getFutureDate(this.getRefreshTtlMs());
    const refreshToken = await this.signRefreshToken({
      sub: input.userId,
      sid: sessionId,
      did: input.departmentId,
      typ: "refresh",
      jti: randomUUID()
    });

    await this.repository.updateSessionRotation({
      sessionId,
      refreshTokenHash: this.tokenHasher.hash(refreshToken),
      ipAddress: this.requestContextService.get()?.audit.ipAddress ?? null,
      userAgent: this.requestContextService.get()?.audit.userAgent ?? null,
      expiresAt: refreshTokenExpiresAt
    });

    return {
      accessToken: await this.signAccessToken({
        sub: input.userId,
        did: input.departmentId
      }),
      refreshToken,
      refreshTokenExpiresAt
    };
  }

  private async signAccessToken(payload: { sub: string; did: string }) {
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.getOrThrow<DurationString>("auth.accessTtl")
    });
  }

  private signRefreshToken(payload: RefreshTokenPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("auth.refreshSecret"),
      expiresIn: this.configService.getOrThrow<DurationString>("auth.refreshTtl")
    });
  }

  private verifyRefreshToken(token: string) {
    return this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>("auth.refreshSecret")
    });
  }

  private buildAuthResponse(authProfile: AuthProfile, tokens: AuthTokens): AuthResponse {
    const permissionCodes = authProfile.permissions.map(
      (permission) => `${permission.resource}.${permission.action}`
    );

    return {
      user: this.toSafeUser({
        ...authProfile.user,
        roles: authProfile.roles,
        permissions: permissionCodes
      }),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
      twoFactor: {
        enabled: authProfile.twoFactorEnabled,
        required: false,
        availableMethods: authProfile.twoFactorEnabled ? ["totp", "email_otp"] : []
      }
    };
  }

  private toSafeUser(authProfile: {
    id: string;
    departmentId: string;
    email: string;
    displayName: string;
    status: string;
    roles: PlatformRole[];
    permissions: string[];
  }) {
    return {
      id: authProfile.id,
      departmentId: authProfile.departmentId,
      email: authProfile.email,
      displayName: authProfile.displayName,
      status: authProfile.status,
      roles: authProfile.roles,
      permissions: authProfile.permissions
    };
  }

  private async getActiveDepartment(input: string) {
    const department = await this.repository.findDepartmentByCodeOrSlug(input.trim());

    if (!department || department.status !== "ACTIVE") {
      throw new BadRequestException("Active department not found");
    }

    return department;
  }

  private getRefreshTtlMs() {
    return this.parseDurationToMs(
      this.configService.getOrThrow<string>("auth.refreshTtl")
    );
  }

  private parseDurationToMs(input: string): number {
    const match = input.match(/^(\d+)([smhd])$/);
    const durationUnitMap = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000
    } as const;

    if (!match) {
      throw new Error(`Unsupported duration format: ${input}`);
    }

    const value = Number(match[1]);
    const unit = match[2] as keyof typeof durationUnitMap;
    const unitMs = durationUnitMap[unit];

    if (!unitMs) {
      throw new Error(`Unsupported duration unit: ${unit}`);
    }

    return value * unitMs;
  }

  private getFutureDate(offsetMs: number) {
    return new Date(Date.now() + offsetMs);
  }

  private getPastDate(offsetMs: number) {
    return new Date(Date.now() - offsetMs);
  }

  private async writeAudit(input: {
    action: string;
    actorId: string;
    targetId?: string;
    departmentId?: string;
    outcome: "success" | "failure";
    metadata?: Record<string, unknown>;
  }) {
    const requestContext = this.requestContextService.get();

    await this.auditWriter.write({
      action: input.action,
      actorId: input.actorId,
      actorType: "user",
      departmentId: input.departmentId ?? requestContext?.audit.departmentId ?? null,
      targetType: "identity_access",
      targetId: input.targetId,
      outcome: input.outcome,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
      requestId: requestContext?.requestId,
      metadata: input.metadata
    });
  }
}
