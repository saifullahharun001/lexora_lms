import { Injectable } from "@nestjs/common";

import type {
  AuthProfile,
  AuthenticatedUserRecord,
  IdentityAccessRepositoryPort,
  PasswordResetRecord,
  SessionRecord,
  VerificationRecord
} from "../../application/ports/identity-access.repository.port";
import type { PermissionGrant, PlatformRole } from "@lexora/types";

import { PrismaService } from "@/common/prisma/prisma.service";

@Injectable()
export class PrismaIdentityAccessRepository
  implements IdentityAccessRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  findDepartmentByCodeOrSlug(input: string) {
    return this.prisma.department.findFirst({
      where: {
        OR: [{ code: input }, { slug: input }],
        deletedAt: null
      },
      select: {
        id: true,
        code: true,
        slug: true,
        status: true
      }
    });
  }

  findUserByEmailAndDepartment(normalizedEmail: string, departmentId: string) {
    return this.prisma.user.findFirst({
      where: {
        normalizedEmail,
        departmentId,
        deletedAt: null
      },
      select: {
        id: true,
        departmentId: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        displayName: true,
        status: true,
        lastLoginAt: true
      }
    }) as Promise<AuthenticatedUserRecord | null>;
  }

  findUserById(userId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      select: {
        id: true,
        departmentId: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        displayName: true,
        status: true,
        lastLoginAt: true
      }
    }) as Promise<AuthenticatedUserRecord | null>;
  }

  createUser(input: {
    departmentId: string;
    email: string;
    normalizedEmail: string;
    passwordHash: string;
    displayName: string;
  }) {
    return this.prisma.user.create({
      data: {
        departmentId: input.departmentId,
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        status: "INVITED"
      },
      select: {
        id: true,
        departmentId: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        displayName: true,
        status: true,
        lastLoginAt: true
      }
    }) as Promise<AuthenticatedUserRecord>;
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
  }

  async updateUserStatus(userId: string, status: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: status as never }
    });
  }

  async updateUserLastLoginAt(userId: string, lastLoginAt: Date) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt }
    });
  }

  findRoleByCode(departmentId: string, code: string) {
    return this.prisma.role.findFirst({
      where: {
        departmentId,
        code
      },
      select: {
        id: true,
        code: true
      }
    });
  }

  async assignRoleToUser(input: {
    userId: string;
    roleId: string;
    departmentId: string;
  }) {
    await this.prisma.userRole.upsert({
      where: {
        userId_roleId_departmentId: {
          userId: input.userId,
          roleId: input.roleId,
          departmentId: input.departmentId
        }
      },
      update: {
        revokedAt: null
      },
      create: {
        userId: input.userId,
        roleId: input.roleId,
        departmentId: input.departmentId
      }
    });
  }

  async loadAuthProfile(userId: string): Promise<AuthProfile | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      include: {
        userRoles: {
          where: {
            revokedAt: null
          },
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        },
        twoFactorMethods: {
          where: {
            disabledAt: null
          },
          select: {
            verifiedAt: true
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    const roles = user.userRoles.map((userRole) => userRole.role.code as PlatformRole);
    const permissions: PermissionGrant[] = user.userRoles.flatMap((userRole) =>
      userRole.role.rolePermissions.map((rolePermission) => ({
        resource: rolePermission.permission.resource,
        action: rolePermission.permission.action,
        scope: rolePermission.permission.scope.toLowerCase() as PermissionGrant["scope"]
      }))
    );

    return {
      user: {
        id: user.id,
        departmentId: user.departmentId,
        email: user.email,
        normalizedEmail: user.normalizedEmail,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        status: user.status,
        lastLoginAt: user.lastLoginAt
      },
      roles,
      permissions,
      twoFactorEnabled: user.twoFactorMethods.some((method) => Boolean(method.verifiedAt))
    };
  }

  createSession(input: {
    userId: string;
    departmentId: string;
    refreshTokenHash: string;
    deviceFingerprintHash: string | null;
    deviceLabel: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }) {
    return this.prisma.session.create({
      data: {
        userId: input.userId,
        departmentId: input.departmentId,
        refreshTokenHash: input.refreshTokenHash,
        deviceFingerprintHash: input.deviceFingerprintHash,
        deviceLabel: input.deviceLabel,
        ipAddress: input.ipAddress,
        lastIpAddress: input.ipAddress,
        userAgent: input.userAgent,
        lastUserAgent: input.userAgent,
        expiresAt: input.expiresAt,
        status: "ACTIVE"
      },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        refreshTokenHash: true,
        deviceFingerprintHash: true,
        deviceLabel: true,
        ipAddress: true,
        lastIpAddress: true,
        userAgent: true,
        lastUserAgent: true,
        status: true,
        expiresAt: true,
        revokedAt: true
      }
    }) as Promise<SessionRecord>;
  }

  findSessionById(sessionId: string) {
    return this.prisma.session.findFirst({
      where: {
        id: sessionId
      },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        refreshTokenHash: true,
        deviceFingerprintHash: true,
        deviceLabel: true,
        ipAddress: true,
        lastIpAddress: true,
        userAgent: true,
        lastUserAgent: true,
        status: true,
        expiresAt: true,
        revokedAt: true
      }
    }) as Promise<SessionRecord | null>;
  }

  async updateSessionRotation(input: {
    sessionId: string;
    refreshTokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }) {
    await this.prisma.session.update({
      where: { id: input.sessionId },
      data: {
        refreshTokenHash: input.refreshTokenHash,
        lastSeenAt: new Date(),
        lastIpAddress: input.ipAddress,
        lastUserAgent: input.userAgent,
        expiresAt: input.expiresAt
      }
    });
  }

  async revokeSession(sessionId: string, revokedAt: Date, reason: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "REVOKED",
        revokedAt,
        revokedReason: reason
      }
    });
  }

  async createLoginAttempt(input: {
    userId: string | null;
    departmentId: string | null;
    normalizedEmail: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceFingerprintHash: string | null;
    outcome: "SUCCESS" | "FAILURE" | "LOCKED" | "STEP_UP_REQUIRED" | "BLOCKED";
    failureReason: string | null;
  }) {
    await this.prisma.loginAttempt.create({
      data: input
    });
  }

  countRecentLoginFailures(input: {
    normalizedEmail: string;
    departmentId: string | null;
    since: Date;
  }) {
    return this.prisma.loginAttempt.count({
      where: {
        normalizedEmail: input.normalizedEmail,
        departmentId: input.departmentId,
        occurredAt: {
          gte: input.since
        },
        outcome: {
          in: ["FAILURE", "LOCKED"]
        }
      }
    });
  }

  async findMostRecentLockout(input: {
    normalizedEmail: string;
    departmentId: string | null;
    since: Date;
  }): Promise<Date | null> {
    const row = await this.prisma.loginAttempt.findFirst({
      where: {
        normalizedEmail: input.normalizedEmail,
        departmentId: input.departmentId,
        occurredAt: {
          gte: input.since
        },
        outcome: "LOCKED"
      },
      orderBy: {
        occurredAt: "desc"
      },
      select: {
        occurredAt: true
      }
    });

    return row?.occurredAt ?? null;
  }

  async createSuspiciousLoginEvent(input: {
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
  }) {
    await this.prisma.suspiciousLoginEvent.create({
      data: input
    });
  }

  createEmailVerification(input: {
    userId: string;
    departmentId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.emailVerification.create({
      data: input,
      select: {
        id: true,
        userId: true,
        departmentId: true,
        tokenHash: true,
        status: true,
        expiresAt: true,
        consumedAt: true
      }
    }) as Promise<VerificationRecord>;
  }

  findPendingEmailVerificationByTokenHash(tokenHash: string) {
    return this.prisma.emailVerification.findFirst({
      where: {
        tokenHash,
        status: "PENDING",
        consumedAt: null
      },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        tokenHash: true,
        status: true,
        expiresAt: true,
        consumedAt: true
      }
    }) as Promise<VerificationRecord | null>;
  }

  async consumeEmailVerification(recordId: string, verifiedAt: Date) {
    await this.prisma.emailVerification.update({
      where: { id: recordId },
      data: {
        status: "VERIFIED",
        verifiedAt,
        consumedAt: verifiedAt
      }
    });
  }

  createPasswordReset(input: {
    userId: string;
    departmentId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.passwordReset.create({
      data: input,
      select: {
        id: true,
        userId: true,
        departmentId: true,
        tokenHash: true,
        status: true,
        expiresAt: true,
        consumedAt: true
      }
    }) as Promise<PasswordResetRecord>;
  }

  findPendingPasswordResetByTokenHash(tokenHash: string) {
    return this.prisma.passwordReset.findFirst({
      where: {
        tokenHash,
        status: "PENDING",
        consumedAt: null
      },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        tokenHash: true,
        status: true,
        expiresAt: true,
        consumedAt: true
      }
    }) as Promise<PasswordResetRecord | null>;
  }

  async consumePasswordReset(recordId: string, consumedAt: Date) {
    await this.prisma.passwordReset.update({
      where: { id: recordId },
      data: {
        status: "CONSUMED",
        consumedAt
      }
    });
  }
}
