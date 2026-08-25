import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { RequestContextService } from "@/common/request-context/request-context.service";

import {
  BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY,
  type BatchCoordinatorAssignmentListFilters,
  type BatchCoordinatorAssignmentRepositoryPort,
  type BatchCoordinatorAssignmentWriteFailure,
  type BatchCoordinatorManagementAuthority,
} from "../ports/batch-coordinator-assignment.repository.port";
import { BatchCoordinatorManagementAuthorizerService } from "./batch-coordinator-management-authorizer.service";

@Injectable()
export class BatchCoordinatorAssignmentService {
  constructor(
    @Inject(BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY)
    private readonly repository: BatchCoordinatorAssignmentRepositoryPort,
    private readonly authorizer: BatchCoordinatorManagementAuthorizerService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async create(input: {
    studentBatchId: string;
    academicTermId: string;
    coordinatorUserId: string;
    expiresAt?: Date;
  }) {
    const authority = await this.authorizer.authorize();
    const transitionAt = new Date();
    const expiresAt = input.expiresAt ?? null;
    this.assertValidExpiry(expiresAt, transitionAt);
    const result = await this.repository.create({
      ...this.writeContext(authority, transitionAt),
      studentBatchId: input.studentBatchId,
      academicTermId: input.academicTermId,
      coordinatorUserId: input.coordinatorUserId,
      expiresAt,
    });
    if (result.outcome === "CREATED" || result.outcome === "ALREADY_ACTIVE") {
      return result.assignment;
    }
    this.throwWriteFailure(result.outcome);
  }

  async list(
    filters: Omit<BatchCoordinatorAssignmentListFilters, "departmentId">,
  ) {
    const authority = await this.authorizer.authorize();
    return this.repository.findMany({
      departmentId: authority.departmentId,
      ...filters,
    });
  }

  async getById(assignmentId: string) {
    const authority = await this.authorizer.authorize();
    const assignment = await this.repository.findById(
      authority.departmentId,
      assignmentId,
    );
    if (!assignment)
      throw new NotFoundException("Batch Coordinator assignment not found");
    return assignment;
  }

  async update(assignmentId: string, input: { expiresAt?: Date | null }) {
    if (!Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
      throw new BadRequestException(
        "At least one mutable field must be provided",
      );
    }
    const authority = await this.authorizer.authorize();
    const transitionAt = new Date();
    const expiresAt = input.expiresAt ?? null;
    this.assertValidExpiry(expiresAt, transitionAt);
    const result = await this.repository.updateExpiry({
      ...this.writeContext(authority, transitionAt),
      assignmentId,
      expiresAt,
    });
    if (result.outcome === "UPDATED" || result.outcome === "NO_CHANGES") {
      return result.assignment;
    }
    this.throwWriteFailure(result.outcome);
  }

  async unassign(assignmentId: string) {
    const authority = await this.authorizer.authorize();
    const transitionAt = new Date();
    const result = await this.repository.unassign({
      ...this.writeContext(authority, transitionAt),
      assignmentId,
    });
    if (
      result.outcome === "UNASSIGNED" ||
      result.outcome === "ALREADY_INACTIVE"
    ) {
      return result.assignment;
    }
    this.throwWriteFailure(result.outcome);
  }

  async reactivate(assignmentId: string, input: { expiresAt: Date | null }) {
    if (!Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
      throw new BadRequestException(
        "Reactivation expiry intent must be explicitly provided",
      );
    }
    const authority = await this.authorizer.authorize();
    const transitionAt = new Date();
    const expiresAt = input.expiresAt;
    this.assertValidExpiry(expiresAt, transitionAt);
    const result = await this.repository.reactivate({
      ...this.writeContext(authority, transitionAt),
      assignmentId,
      expiresAt,
    });
    if (
      result.outcome === "REACTIVATED" ||
      result.outcome === "ALREADY_ACTIVE"
    ) {
      return result.assignment;
    }
    this.throwWriteFailure(result.outcome);
  }

  async archive(assignmentId: string) {
    const authority = await this.authorizer.authorize();
    const transitionAt = new Date();
    const result = await this.repository.archive({
      ...this.writeContext(authority, transitionAt),
      assignmentId,
    });
    if (
      result.outcome === "ARCHIVED" ||
      result.outcome === "ALREADY_ARCHIVED"
    ) {
      return result.assignment;
    }
    this.throwWriteFailure(result.outcome);
  }

  private writeContext(
    authority: BatchCoordinatorManagementAuthority,
    transitionAt: Date,
  ) {
    const requestContext = this.requestContextService.get();
    return {
      ...authority,
      transitionAt,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    };
  }

  private assertValidExpiry(expiresAt: Date | null, transitionAt: Date) {
    if (
      expiresAt !== null &&
      (!(expiresAt instanceof Date) ||
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt.getTime() <= transitionAt.getTime())
    ) {
      throw new BadRequestException(
        "Expiry must be later than the assignment time",
      );
    }
  }

  private throwWriteFailure(
    outcome: BatchCoordinatorAssignmentWriteFailure,
  ): never {
    switch (outcome) {
      case "MANAGEMENT_AUTHORITY_INVALID":
        throw new ForbiddenException(
          "Batch Coordinator assignment access denied",
        );
      case "ASSIGNMENT_NOT_FOUND":
        throw new NotFoundException("Batch Coordinator assignment not found");
      case "STUDENT_BATCH_NOT_FOUND":
      case "ACADEMIC_TERM_NOT_FOUND":
      case "COORDINATOR_USER_NOT_FOUND":
        throw new NotFoundException(
          "Batch Coordinator assignment dependency not found",
        );
      case "INVALID_EXPIRY":
        throw new BadRequestException(
          "Expiry must be later than the assignment time",
        );
      case "REACTIVATION_REQUIRED":
        throw new ConflictException("Explicit reactivation is required");
      case "CONFIGURATION_CONFLICT":
        throw new ConflictException(
          "Existing assignment configuration conflicts",
        );
      case "NOT_ACTIVE":
        throw new ConflictException("Assignment is not currently active");
      case "NOT_REACTIVATABLE":
        throw new ConflictException(
          "Assignment is not eligible for reactivation",
        );
      case "ASSIGNMENT_ARCHIVED":
        throw new ConflictException("Archived assignment cannot be changed");
      case "CONCURRENT_CONFLICT":
        throw new ConflictException("Concurrent assignment change conflicted");
    }
  }
}
