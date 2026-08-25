import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { RequestContextService } from "@/common/request-context/request-context.service";

import {
  BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY,
  type BatchCoordinatorAssignmentRepositoryPort,
} from "../ports/batch-coordinator-assignment.repository.port";

@Injectable()
export class BatchCoordinatorAuthorityService {
  constructor(
    @Inject(BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY)
    private readonly repository: BatchCoordinatorAssignmentRepositoryPort,
    private readonly requestContextService: RequestContextService,
  ) {}

  /**
   * Non-locking current-state predicate only. A state-changing Coordinator
   * workflow must revalidate and lock this exact assignment in its write
   * transaction so unassign/archive cannot race the protected mutation.
   */
  hasExactAuthority(input: {
    studentBatchId: string;
    academicTermId: string;
  }): Promise<boolean> {
    const principal = this.requestContextService.get()?.principal;
    if (
      !principal ||
      principal.isAuthenticated !== true ||
      principal.actorType !== "user" ||
      !principal.actorId ||
      !principal.activeDepartmentId
    ) {
      throw new BadRequestException(
        "Authenticated department context is required",
      );
    }

    return this.repository.hasActiveAuthority({
      departmentId: principal.activeDepartmentId,
      coordinatorUserId: principal.actorId,
      studentBatchId: input.studentBatchId,
      academicTermId: input.academicTermId,
      evaluatedAt: new Date(),
    });
  }
}
