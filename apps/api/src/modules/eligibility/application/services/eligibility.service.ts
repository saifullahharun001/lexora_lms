import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { AttendanceRecordStatus, EligibilityStatus, EnrollmentStatus, Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type {
  EligibilityComputationResult,
  EligibilityComputationSnapshot,
  EligibilityCounts,
  EligibilityCourseOfferingSummary
} from "../../contracts/eligibility.contracts";
import { ELIGIBILITY_AUDIT_EVENTS } from "../../domain/eligibility.audit-events";
import { ELIGIBILITY_REPOSITORY } from "../../domain/eligibility.constants";
import type { EligibilityRepositoryPort } from "../ports/eligibility.repository.port";

interface AuditMetadata {
  [key: string]: unknown;
}

type EnrollmentForEligibility = {
  id: string;
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  studentUserId: string;
  status: EnrollmentStatus;
  eligibilityStatus: EligibilityStatus;
  eligibilitySnapshotJson: Prisma.JsonValue | null;
};

type AttendanceRecordForEligibility = {
  status: AttendanceRecordStatus;
};

const ATTENDANCE_THRESHOLD_PERCENTAGE = 75;
const CONDITIONAL_THRESHOLD_PERCENTAGE = 65;

@Injectable()
export class EligibilityService {
  constructor(
    @Inject(ELIGIBILITY_REPOSITORY)
    private readonly repository: EligibilityRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  async computeEnrollment(enrollmentId: string): Promise<EligibilityComputationResult> {
    this.assertCanCompute();

    const enrollment = await this.getDepartmentEnrollment(enrollmentId);
    const result = await this.computeAndPersist(enrollment);

    await this.writeAudit(ELIGIBILITY_AUDIT_EVENTS.RESULT_COMPUTED, "enrollment", enrollment.id, {
      courseOfferingId: enrollment.courseOfferingId,
      eligibilityStatus: result.eligibilityStatus
    });

    return result;
  }

  async computeCourseOffering(courseOfferingId: string): Promise<EligibilityCourseOfferingSummary> {
    this.assertCanCompute();
    const departmentId = this.getDepartmentId();
    const offering = await this.repository.findCourseOfferingById(departmentId, courseOfferingId);

    if (!offering) {
      throw new NotFoundException("Course offering not found");
    }

    const enrollments = (await this.repository.findEnrollments({
      departmentId,
      courseOfferingId,
      statuses: [EnrollmentStatus.APPROVED]
    })) as EnrollmentForEligibility[];

    const summary: EligibilityCourseOfferingSummary = {
      totalEnrollments: enrollments.length,
      computedCount: 0,
      eligibleCount: 0,
      conditionalCount: 0,
      ineligibleCount: 0,
      pendingReviewCount: 0
    };

    for (const enrollment of enrollments) {
      const result = await this.computeAndPersist(enrollment);
      summary.computedCount += 1;
      this.incrementSummary(summary, result.eligibilityStatus);
    }

    await this.writeAudit(
      ELIGIBILITY_AUDIT_EVENTS.COURSE_OFFERING_COMPUTED,
      "course_offering",
      courseOfferingId,
      summary as unknown as AuditMetadata
    );

    return summary;
  }

  async getEnrollmentEligibility(enrollmentId: string) {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    let enrollment: unknown | null = null;

    if (this.hasRole("department_admin")) {
      enrollment = await this.repository.findEnrollmentById(departmentId, enrollmentId);
    } else if (this.hasRole("teacher")) {
      enrollment = await this.repository.findEnrollmentByIdForTeacher(
        departmentId,
        enrollmentId,
        actorId
      );
    } else if (this.hasRole("student")) {
      enrollment = await this.repository.findEnrollmentByIdForStudent(
        departmentId,
        enrollmentId,
        actorId
      );
    } else {
      throw new ForbiddenException("Eligibility result is not available to this principal");
    }

    if (!enrollment) {
      throw new NotFoundException("Eligibility result not found");
    }

    return enrollment;
  }

  listMyEligibility(filters: { courseOfferingId?: string; academicTermId?: string }) {
    if (!this.hasRole("student")) {
      throw new ForbiddenException("Student eligibility endpoint is only available to students");
    }

    return this.repository.findEnrollments({
      departmentId: this.getDepartmentId(),
      studentUserId: this.getActorId(),
      courseOfferingId: filters.courseOfferingId,
      academicTermId: filters.academicTermId
    });
  }

  async overrideEnrollment(
    enrollmentId: string,
    input: { eligibilityStatus: EligibilityStatus; overrideReason: string }
  ) {
    if (!this.hasRole("department_admin")) {
      throw new ForbiddenException("Only department admins can override eligibility");
    }

    const overrideReason = input.overrideReason.trim();

    if (!overrideReason) {
      throw new BadRequestException("overrideReason is required");
    }

    const enrollment = await this.getDepartmentEnrollment(enrollmentId);
    const snapshot = {
      overriddenBy: this.getActorId(),
      overriddenAt: new Date().toISOString(),
      overrideReason,
      eligibilityStatus: input.eligibilityStatus,
      previousEligibilityStatus: enrollment.eligibilityStatus,
      previousEligibilitySnapshotJson: enrollment.eligibilitySnapshotJson,
      courseOfferingId: enrollment.courseOfferingId,
      enrollmentId: enrollment.id
    };

    const updated = await this.repository.updateEnrollmentEligibility(this.getDepartmentId(), enrollmentId, {
      eligibilityStatus: input.eligibilityStatus,
      eligibilitySnapshotJson: snapshot as Prisma.InputJsonValue
    });

    if (!updated) {
      throw new NotFoundException("Enrollment not found");
    }

    await this.writeAudit(ELIGIBILITY_AUDIT_EVENTS.RESULT_OVERRIDDEN, "enrollment", enrollment.id, {
      previousEligibilityStatus: enrollment.eligibilityStatus,
      eligibilityStatus: input.eligibilityStatus,
      overrideReason
    });

    return updated;
  }

  private async computeAndPersist(
    enrollment: EnrollmentForEligibility
  ): Promise<EligibilityComputationResult> {
    const attendanceRecords = (await this.repository.listAttendanceRecordsForEnrollment(
      this.getDepartmentId(),
      enrollment.id,
      enrollment.courseOfferingId
    )) as AttendanceRecordForEligibility[];

    const counts = this.countAttendance(attendanceRecords);
    const attendancePercentage =
      counts.totalCountedSessions === 0
        ? null
        : Number(
            (
              ((counts.presentCount + counts.lateCount + counts.excusedCount) /
                counts.totalCountedSessions) *
              100
            ).toFixed(2)
          );
    const eligibilityStatus = this.resolveEligibilityStatus(attendancePercentage);
    const snapshot: EligibilityComputationSnapshot = {
      computedBy: this.getActorId(),
      computedAt: new Date().toISOString(),
      rule: {
        type: "attendance_percentage",
        thresholdPercentage: ATTENDANCE_THRESHOLD_PERCENTAGE,
        conditionalThresholdPercentage: CONDITIONAL_THRESHOLD_PERCENTAGE
      },
      counts,
      attendancePercentage,
      courseOfferingId: enrollment.courseOfferingId,
      enrollmentId: enrollment.id
    };

    const updated = await this.repository.updateEnrollmentEligibility(this.getDepartmentId(), enrollment.id, {
      eligibilityStatus,
      eligibilitySnapshotJson: snapshot as unknown as Prisma.InputJsonValue
    });

    if (!updated) {
      throw new NotFoundException("Enrollment not found");
    }

    return {
      enrollmentId: enrollment.id,
      courseOfferingId: enrollment.courseOfferingId,
      eligibilityStatus,
      snapshot,
      enrollment: updated
    };
  }

  private countAttendance(records: AttendanceRecordForEligibility[]): EligibilityCounts {
    const counts: EligibilityCounts = {
      totalCountedSessions: records.length,
      presentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      absentCount: 0
    };

    for (const record of records) {
      switch (record.status) {
        case AttendanceRecordStatus.PRESENT:
          counts.presentCount += 1;
          break;
        case AttendanceRecordStatus.LATE:
          counts.lateCount += 1;
          break;
        case AttendanceRecordStatus.EXCUSED:
          counts.excusedCount += 1;
          break;
        case AttendanceRecordStatus.ABSENT:
          counts.absentCount += 1;
          break;
      }
    }

    return counts;
  }

  private resolveEligibilityStatus(attendancePercentage: number | null) {
    if (attendancePercentage === null) {
      return EligibilityStatus.PENDING_REVIEW;
    }

    if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENTAGE) {
      return EligibilityStatus.ELIGIBLE;
    }

    if (attendancePercentage >= CONDITIONAL_THRESHOLD_PERCENTAGE) {
      return EligibilityStatus.CONDITIONAL;
    }

    return EligibilityStatus.INELIGIBLE;
  }

  private incrementSummary(summary: EligibilityCourseOfferingSummary, status: EligibilityStatus) {
    switch (status) {
      case EligibilityStatus.ELIGIBLE:
        summary.eligibleCount += 1;
        break;
      case EligibilityStatus.CONDITIONAL:
        summary.conditionalCount += 1;
        break;
      case EligibilityStatus.INELIGIBLE:
        summary.ineligibleCount += 1;
        break;
      case EligibilityStatus.PENDING_REVIEW:
        summary.pendingReviewCount += 1;
        break;
    }
  }

  private async getDepartmentEnrollment(enrollmentId: string) {
    const enrollment = (await this.repository.findEnrollmentById(
      this.getDepartmentId(),
      enrollmentId
    )) as EnrollmentForEligibility | null;

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment;
  }

  private assertCanCompute() {
    if (!this.hasRole("department_admin")) {
      throw new ForbiddenException("Only authorized staff can compute eligibility");
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
    targetType: string,
    targetId: string,
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
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}

