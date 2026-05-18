import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ClassSessionStatus, Prisma, TeacherAssignmentStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { ClassSessionRecord } from "../../contracts/class-session.contracts";
import { CLASS_SESSION_AUDIT_EVENTS } from "../../domain/class-session.audit-events";
import { CLASS_SESSION_REPOSITORY } from "../../domain/class-session.constants";
import type {
  ClassSessionRepositoryPort,
  CreateClassSessionInput,
  UpdateClassSessionInput
} from "../ports/class-session.repository.port";

interface AuditMetadata {
  [key: string]: unknown;
}

type LifecycleAction = "activate" | "complete" | "cancel" | "lock" | "archive";

@Injectable()
export class ClassSessionService {
  constructor(
    @Inject(CLASS_SESSION_REPOSITORY)
    private readonly repository: ClassSessionRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  list(filters: Omit<Parameters<ClassSessionRepositoryPort["findMany"]>[0], "departmentId">) {
    return this.repository.findMany({
      departmentId: this.getDepartmentId(),
      ...filters,
      ...(this.shouldConstrainToTeacher() ? { assignedTeacherUserId: this.getActorId() } : {})
    });
  }

  async getById(id: string) {
    const session = await this.findVisibleSession(id);

    if (!session) {
      throw new NotFoundException("Class session not found");
    }

    return session;
  }

  async create(input: Omit<CreateClassSessionInput, "departmentId">) {
    this.assertScheduledRange(input.scheduledStartAt, input.scheduledEndAt);
    await this.assertCourseOfferingInDepartment(input.courseOfferingId);
    await this.assertTeacherCanUseOffering(input.courseOfferingId);
    await this.assertTeacherAssignment(input.courseOfferingId, input.teacherAssignmentId);

    try {
      const session = await this.repository.create({
        departmentId: this.getDepartmentId(),
        ...input
      });

      await this.writeAudit(CLASS_SESSION_AUDIT_EVENTS.RECORD_CREATED, session, {
        courseOfferingId: input.courseOfferingId,
        teacherAssignmentId: input.teacherAssignmentId ?? null,
        sessionCode: input.sessionCode ?? null
      });

      return session;
    } catch (error) {
      this.rethrowKnownError(error, "Class session code already exists for this course offering");
    }
  }

  async update(id: string, input: UpdateClassSessionInput) {
    const current = await this.findVisibleSession(id);

    if (!current) {
      throw new NotFoundException("Class session not found");
    }

    if (
      current.status === ClassSessionStatus.LOCKED ||
      current.status === ClassSessionStatus.ARCHIVED
    ) {
      throw new BadRequestException("Locked or archived class sessions cannot be updated");
    }

    if (
      current.status !== ClassSessionStatus.SCHEDULED &&
      (input.scheduledStartAt || input.scheduledEndAt)
    ) {
      throw new BadRequestException("Scheduled dates can only be updated before activation");
    }

    this.assertScheduledRange(
      input.scheduledStartAt ?? current.scheduledStartAt,
      input.scheduledEndAt ?? current.scheduledEndAt
    );

    await this.assertTeacherAssignment(current.courseOfferingId, input.teacherAssignmentId);

    try {
      const session = await this.repository.update(this.getDepartmentId(), id, input);

      if (!session) {
        throw new NotFoundException("Class session not found");
      }

      await this.writeAudit(CLASS_SESSION_AUDIT_EVENTS.RECORD_UPDATED, session, {
        updatedFields: Object.keys(input)
      });

      return session;
    } catch (error) {
      this.rethrowKnownError(error, "Class session code already exists for this course offering");
    }
  }

  activate(id: string) {
    return this.transition(id, "activate");
  }

  complete(id: string) {
    return this.transition(id, "complete");
  }

  cancel(id: string) {
    return this.transition(id, "cancel");
  }

  lock(id: string) {
    return this.transition(id, "lock");
  }

  archive(id: string) {
    return this.transition(id, "archive");
  }

  private async transition(id: string, action: LifecycleAction) {
    const current = await this.findVisibleSession(id);

    if (!current) {
      throw new NotFoundException("Class session not found");
    }

    const now = new Date();
    const transition = this.buildTransition(action, current, now);
    const session = await this.repository.updateLifecycle(
      this.getDepartmentId(),
      id,
      transition.from,
      transition.data
    );

    if (!session) {
      throw new BadRequestException(`Class session cannot ${action} from ${current.status}`);
    }

    await this.writeAudit(transition.auditEvent, session, {
      previousStatus: current.status,
      status: transition.to
    });

    return session;
  }

  private buildTransition(action: LifecycleAction, current: ClassSessionRecord, now: Date) {
    switch (action) {
      case "activate":
        if (current.status !== ClassSessionStatus.SCHEDULED) {
          throw new BadRequestException("Only scheduled class sessions can be activated");
        }

        return {
          from: ClassSessionStatus.SCHEDULED,
          to: ClassSessionStatus.ACTIVE,
          auditEvent: CLASS_SESSION_AUDIT_EVENTS.RECORD_ACTIVATED,
          data: {
            status: ClassSessionStatus.ACTIVE,
            actualStartAt: current.actualStartAt ?? now
          }
        };
      case "complete":
        if (current.status !== ClassSessionStatus.ACTIVE) {
          throw new BadRequestException("Only active class sessions can be completed");
        }

        return {
          from: ClassSessionStatus.ACTIVE,
          to: ClassSessionStatus.COMPLETED,
          auditEvent: CLASS_SESSION_AUDIT_EVENTS.RECORD_COMPLETED,
          data: {
            status: ClassSessionStatus.COMPLETED,
            actualEndAt: now
          }
        };
      case "cancel":
        if (
          current.status !== ClassSessionStatus.SCHEDULED &&
          current.status !== ClassSessionStatus.ACTIVE
        ) {
          throw new BadRequestException("Only scheduled or active class sessions can be canceled");
        }

        return {
          from: [ClassSessionStatus.SCHEDULED, ClassSessionStatus.ACTIVE],
          to: ClassSessionStatus.CANCELED,
          auditEvent: CLASS_SESSION_AUDIT_EVENTS.RECORD_CANCELED,
          data: {
            status: ClassSessionStatus.CANCELED,
            canceledAt: now
          }
        };
      case "lock":
        if (
          current.status !== ClassSessionStatus.COMPLETED &&
          current.status !== ClassSessionStatus.CANCELED
        ) {
          throw new BadRequestException("Only completed or canceled class sessions can be locked");
        }

        return {
          from: [ClassSessionStatus.COMPLETED, ClassSessionStatus.CANCELED],
          to: ClassSessionStatus.LOCKED,
          auditEvent: CLASS_SESSION_AUDIT_EVENTS.RECORD_LOCKED,
          data: {
            status: ClassSessionStatus.LOCKED,
            lockedAt: now
          }
        };
      case "archive":
        if (
          current.status !== ClassSessionStatus.COMPLETED &&
          current.status !== ClassSessionStatus.CANCELED &&
          current.status !== ClassSessionStatus.LOCKED
        ) {
          throw new BadRequestException(
            "Only completed, canceled, or locked class sessions can be archived"
          );
        }

        return {
          from: [
            ClassSessionStatus.COMPLETED,
            ClassSessionStatus.CANCELED,
            ClassSessionStatus.LOCKED
          ],
          to: ClassSessionStatus.ARCHIVED,
          auditEvent: CLASS_SESSION_AUDIT_EVENTS.RECORD_ARCHIVED,
          data: {
            status: ClassSessionStatus.ARCHIVED,
            archivedAt: now
          }
        };
    }
  }

  private findVisibleSession(id: string) {
    return this.repository.findById(
      this.getDepartmentId(),
      id,
      this.shouldConstrainToTeacher() ? this.getActorId() : undefined
    );
  }

  private async assertCourseOfferingInDepartment(courseOfferingId: string) {
    const courseOffering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: {
        id: true
      }
    });

    if (!courseOffering) {
      throw new NotFoundException("Course offering not found");
    }
  }

  private async assertTeacherAssignment(
    courseOfferingId: string,
    teacherAssignmentId?: string | null
  ) {
    if (teacherAssignmentId === undefined || teacherAssignmentId === null) {
      return;
    }

    const assignment = await this.prisma.teacherCourseAssignment.findFirst({
      where: {
        id: teacherAssignmentId,
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        status: TeacherAssignmentStatus.ACTIVE,
        unassignedAt: null,
        archivedAt: null
      },
      select: {
        id: true
      }
    });

    if (!assignment) {
      throw new BadRequestException("Teacher assignment is not active for this course offering");
    }
  }

  private async assertTeacherCanUseOffering(courseOfferingId: string) {
    if (!this.shouldConstrainToTeacher()) {
      return;
    }

    const assignment = await this.prisma.teacherCourseAssignment.findFirst({
      where: {
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        teacherUserId: this.getActorId(),
        status: TeacherAssignmentStatus.ACTIVE,
        unassignedAt: null,
        archivedAt: null
      },
      select: {
        id: true
      }
    });

    if (!assignment) {
      throw new ForbiddenException("Teacher is not assigned to this course offering");
    }
  }

  private assertScheduledRange(startAt: Date, endAt: Date) {
    if (endAt <= startAt) {
      throw new BadRequestException("scheduledEndAt must be after scheduledStartAt");
    }
  }

  private shouldConstrainToTeacher() {
    return this.hasRole("teacher") && !this.hasRole("department_admin");
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

  private hasRole(role: "department_admin" | "teacher" | "student") {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;

    return Boolean(
      departmentId &&
        principal?.roleAssignments.some(
          (assignment) => assignment.departmentId === departmentId && assignment.role === role
        )
    );
  }

  private async writeAudit(
    action: string,
    target: ClassSessionRecord,
    metadata?: AuditMetadata
  ) {
    const requestContext = this.requestContextService.get();

    await this.prisma.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: this.getActorId(),
        actorType: "USER",
        departmentId: this.getDepartmentId(),
        action,
        targetType: "class_session",
        targetId: target.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private rethrowKnownError(error: unknown, message: string): never {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }

    throw error;
  }
}
