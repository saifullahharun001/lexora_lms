import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, UserStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { validatePasswordPolicy } from "@/modules/identity-access/domain/password-policy";
import { PasswordHasherService } from "@/modules/identity-access/infrastructure/password-hasher.service";
import {
  isManagedUserRoleCode,
  type ManagedUserRoleCode
} from "../../domain/user-management.constants";
import { USER_MANAGEMENT_AUDIT_EVENTS } from "../../domain/user-management.audit-events";

interface CreateManagedUserInput {
  email: string;
  displayName: string;
  roleCode: ManagedUserRoleCode;
  temporaryPassword: string;
  status?: UserStatus;
}

interface UpdateManagedUserStatusInput {
  status: UserStatus;
}

const SAFE_INITIAL_USER_STATUSES: readonly UserStatus[] = [
  UserStatus.ACTIVE,
  UserStatus.INVITED
];

@Injectable()
export class UserManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly configService: ConfigService,
    private readonly authorizationService: AuthorizationService
  ) {}

  async listUsers() {
    const departmentId = this.getDepartmentId();
    const users = await this.prisma.user.findMany({
      where: {
        departmentId,
        deletedAt: null
      },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      include: this.safeUserInclude()
    });

    return users.map((user) => this.toManagedUser(user));
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        departmentId: this.getDepartmentId(),
        deletedAt: null
      },
      include: this.safeUserInclude()
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toManagedUser(user);
  }

  async createUser(input: CreateManagedUserInput) {
    if (!isManagedUserRoleCode(input.roleCode)) {
      throw new BadRequestException("Only student and teacher users can be created here");
    }

    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const email = input.email.trim();
    const displayName = input.displayName.trim();
    const normalizedEmail = email.toLowerCase();
    const status = input.status ?? UserStatus.ACTIVE;

    if (!email) {
      throw new BadRequestException("Email is required");
    }

    if (!displayName) {
      throw new BadRequestException("Display name is required");
    }

    if (!SAFE_INITIAL_USER_STATUSES.includes(status)) {
      throw new BadRequestException("Initial status must be ACTIVE or INVITED");
    }

    this.assertAllowedEmailDomain(normalizedEmail);

    try {
      validatePasswordPolicy(input.temporaryPassword);
    } catch {
      throw new BadRequestException("Temporary password does not meet password policy");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        normalizedEmail
      },
      select: {
        id: true
      }
    });

    if (existingUser) {
      throw new ConflictException("An account already exists for that email");
    }

    const passwordHash = await this.passwordHasher.hash(input.temporaryPassword);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const role = await this.ensureDepartmentRole(tx, departmentId, input.roleCode);
        const user = await tx.user.create({
          data: {
            departmentId,
            email,
            normalizedEmail,
            passwordHash,
            displayName,
            status
          }
        });

        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            departmentId,
            assignedByUserId: actorId
          }
        });

        await this.writeAuditWithClient(tx, {
          action: USER_MANAGEMENT_AUDIT_EVENTS.USER_CREATED,
          targetType: "user",
          targetId: user.id,
          metadata: {
            email: user.email,
            roleCode: input.roleCode,
            status: user.status
          }
        });

        await this.writeAuditWithClient(tx, {
          action: USER_MANAGEMENT_AUDIT_EVENTS.USER_ROLE_ASSIGNED,
          targetType: "user_role",
          targetId: user.id,
          metadata: {
            roleCode: input.roleCode
          }
        });

        return tx.user.findFirstOrThrow({
          where: {
            id: user.id,
            departmentId
          },
          include: this.safeUserInclude()
        });
      });

      this.authorizationService.clearPrincipalCache(created.id);

      return this.toManagedUser(created);
    } catch (error) {
      this.rethrowKnownError(error, "An account already exists for that email");
    }
  }

  async updateUserStatus(id: string, input: UpdateManagedUserStatusInput) {
    const departmentId = this.getDepartmentId();
    const existingUser = await this.prisma.user.findFirst({
      where: {
        id,
        departmentId,
        deletedAt: null,
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            role: {
              code: {
                in: ["student", "teacher"]
              }
            }
          },
          none: {
            departmentId,
            revokedAt: null,
            role: {
              code: {
                notIn: ["student", "teacher"]
              }
            }
          }
        }
      },
      select: {
        id: true
      }
    });

    if (!existingUser) {
      throw new NotFoundException("User not found");
    }

    const user = await this.prisma.user.update({
      where: {
        id
      },
      data: {
        status: input.status
      },
      include: this.safeUserInclude()
    });

    await this.writeAudit({
      action: USER_MANAGEMENT_AUDIT_EVENTS.USER_STATUS_UPDATED,
      targetType: "user",
      targetId: user.id,
      metadata: {
        status: input.status
      }
    });
    this.authorizationService.clearPrincipalCache(user.id);

    return this.toManagedUser(user);
  }

  private safeUserInclude() {
    return {
      userRoles: {
        where: {
          departmentId: this.getDepartmentId(),
          revokedAt: null
        },
        include: {
          role: true
        }
      }
    } satisfies Prisma.UserInclude;
  }

  private async ensureDepartmentRole(
    tx: Prisma.TransactionClient,
    departmentId: string,
    roleCode: ManagedUserRoleCode
  ) {
    const existingRole = await tx.role.findUnique({
      where: {
        departmentId_code: {
          departmentId,
          code: roleCode
        }
      }
    });

    if (existingRole) {
      return existingRole;
    }

    return tx.role.create({
      data: {
        departmentId,
        code: roleCode,
        name: roleCode === "student" ? "Student" : "Teacher",
        description: `Department-scoped ${roleCode} role`
      }
    });
  }

  private toManagedUser(
    user: Prisma.UserGetPayload<{
      include: ReturnType<UserManagementService["safeUserInclude"]>;
    }>
  ) {
    return {
      id: user.id,
      departmentId: user.departmentId,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: user.userRoles.map((userRole) => userRole.role.code),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null
    };
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
      throw new BadRequestException("User email must use an official university domain");
    }
  }

  private getDepartmentId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.activeDepartmentId) {
      throw new BadRequestException("Active department context is required");
    }

    return principal.activeDepartmentId;
  }

  private getActorId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.actorId) {
      throw new BadRequestException("Authenticated actor is required");
    }

    return principal.actorId;
  }

  private async writeAudit(entry: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.writeAuditWithClient(this.prisma, entry);
  }

  private async writeAuditWithClient(
    client: Prisma.TransactionClient | PrismaService,
    entry: {
      action: string;
      targetType: string;
      targetId: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const requestContext = this.requestContextService.get();

    await client.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: this.getActorId(),
        actorType: "USER",
        departmentId: this.getDepartmentId(),
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: entry.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private rethrowKnownError(error: unknown, message: string): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(message);
    }

    throw error;
  }
}
