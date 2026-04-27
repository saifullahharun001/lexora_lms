import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  EligibilityStatus,
  Prisma,
  ResultAmendmentStatus,
  ResultPublicationBatchStatus,
  ResultRecordStatus,
  TeacherAssignmentStatus
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { PrincipalContext } from "@lexora/types";
import type {
  CreateGradeScaleInput,
  GradeRuleInput,
  ResultFilters,
  ResultProcessingRepositoryPort,
  UpdateGradeScaleInput
} from "../ports/result-processing.repository.port";
import { RESULT_PROCESSING_AUDIT_EVENTS } from "../../domain/result-processing.audit-events";
import { RESULT_PROCESSING_REPOSITORY } from "../../domain/result-processing.constants";
import { RESULT_PROCESSING_ROLE_NAMES } from "../../domain/result-processing.roles";

type GradeRuleRecord = {
  minPercentage: Prisma.Decimal;
  maxPercentage: Prisma.Decimal;
  letterGrade: string;
  gradePoint: Prisma.Decimal;
};

type GradeScaleRecord = {
  id: string;
  gradeRules: GradeRuleRecord[];
};

type OfferingRecord = {
  id: string;
  academicTermId: string;
  course: {
    creditHours: Prisma.Decimal;
  };
};

type ResultRecord = {
  id: string;
  academicTermId: string;
  courseOfferingId: string;
  enrollmentId: string;
  status: ResultRecordStatus;
  normalizedPercentage: Prisma.Decimal | null;
  letterGrade: string | null;
  gradePoint: Prisma.Decimal | null;
  creditHoursSnapshot: Prisma.Decimal;
  qualityPoints: Prisma.Decimal | null;
};

type GradingRecordWithSource = {
  id: string;
  targetType: string;
  pointsAwarded: Prisma.Decimal;
  assignmentSubmissionId: string | null;
  quizAttemptId: string | null;
  assignmentSubmission: {
    enrollmentId: string;
    assignmentId: string;
    assignment: {
      title: string;
      maxPoints: Prisma.Decimal;
    };
  } | null;
  quizAttempt: {
    enrollmentId: string;
    quizId: string;
    quiz: {
      title: string;
      maxPoints: Prisma.Decimal;
    };
  } | null;
};

const EXAM_OFFICE_ROLES = [
  RESULT_PROCESSING_ROLE_NAMES.DEPARTMENT_ADMIN,
  RESULT_PROCESSING_ROLE_NAMES.EXAM_OFFICE
] as const;

interface AuditMetadata {
  [key: string]: unknown;
}

@Injectable()
export class ResultProcessingService {
  constructor(
    @Inject(RESULT_PROCESSING_REPOSITORY)
    private readonly repository: ResultProcessingRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  listGradeScales(filters: { isActive?: boolean }) {
    return this.repository.findGradeScales({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getGradeScale(id: string) {
    const scale = await this.repository.findGradeScaleById(this.getDepartmentId(), id);

    if (!scale) {
      throw new NotFoundException("Grade scale not found");
    }

    return scale;
  }

  async createGradeScale(input: Omit<CreateGradeScaleInput, "departmentId" | "updatedByUserId">) {
    this.assertAdminOrExamOffice("Only exam office or department admins can manage grade scales");

    try {
      const scale = await this.repository.createGradeScale({
        departmentId: this.getDepartmentId(),
        updatedByUserId: this.getActorId(),
        ...input
      });

      await this.writeAudit(
        RESULT_PROCESSING_AUDIT_EVENTS.GRADE_SCALE_CREATED,
        "grade_scale",
        scale,
        { code: input.code }
      );

      return scale;
    } catch (error) {
      this.rethrowKnownError(error, "Grade scale code already exists in this department");
    }
  }

  async updateGradeScale(id: string, input: UpdateGradeScaleInput) {
    this.assertAdminOrExamOffice("Only exam office or department admins can manage grade scales");

    try {
      const scale = await this.repository.updateGradeScale(this.getDepartmentId(), id, {
        ...input,
        updatedByUserId: this.getActorId()
      });

      if (!scale) {
        throw new NotFoundException("Grade scale not found");
      }

      await this.writeAudit(
        RESULT_PROCESSING_AUDIT_EVENTS.GRADE_SCALE_UPDATED,
        "grade_scale",
        scale,
        { updatedFields: Object.keys(input) }
      );

      return scale;
    } catch (error) {
      this.rethrowKnownError(error, "Grade scale code already exists in this department");
    }
  }

  listResults(filters: Omit<ResultFilters, "departmentId" | "studentUserId">) {
    return this.repository.findResults({
      departmentId: this.getDepartmentId(),
      studentUserId: this.isStudent() ? this.getActorId() : undefined,
      ...filters
    });
  }

  async getResult(id: string) {
    const result = await this.repository.findResultById(this.getDepartmentId(), id);

    if (!result) {
      throw new NotFoundException("Result record not found");
    }

    this.assertCanReadResult(result as { enrollment?: { studentUserId: string } });
    return result;
  }

  async computeResults(input: {
    courseOfferingId: string;
    enrollmentId?: string;
    gradeScaleId?: string;
    componentRules?: GradeRuleInput[];
  }) {
    await this.assertCanComputeOffering(input.courseOfferingId);
    const departmentId = this.getDepartmentId();
    const offering = await this.assertOfferingInDepartment(input.courseOfferingId);
    const gradeScale = await this.resolveGradeScale(input.gradeScaleId);
    const enrollments = await this.findApprovedEnrollments(input.courseOfferingId, input.enrollmentId);

    if (enrollments.length === 0) {
      throw new BadRequestException("No approved enrollment found for result computation");
    }

    const gradingRecords = await this.findGradingRecords(input.courseOfferingId);
    const computed = [];

    for (const enrollment of enrollments) {
      const records = gradingRecords.filter((record) => this.recordEnrollmentId(record) === enrollment.id);

      if (records.length === 0) {
        if (input.enrollmentId) {
          throw new BadRequestException("No grading records found for this enrollment");
        }
        continue;
      }

      const components = this.buildComponents(records);
      const percentage = components.reduce(
        (sum, component) => sum + Number(component.weightedScore),
        0
      );
      const totalRawScore = records.reduce((sum, record) => sum + record.pointsAwarded.toNumber(), 0);
      const gradeRule = this.mapGradeRule(gradeScale, percentage);
      const creditHours = offering.course.creditHours.toNumber();
      const gradePoint = gradeRule.gradePoint.toNumber();
      const qualityPoints = gradePoint * creditHours;
      const eligibilityStatus = enrollment.eligibilityStatus as EligibilityStatus;
      const eligibilityReason =
        eligibilityStatus === EligibilityStatus.ELIGIBLE
          ? undefined
          : "Enrollment eligibility is not marked eligible";

      const result = await this.repository.upsertDraftResult({
        departmentId,
        academicTermId: offering.academicTermId,
        courseOfferingId: offering.id,
        enrollmentId: enrollment.id,
        gradeScaleId: gradeScale.id,
        eligibilityStatus,
        eligibilityReason,
        totalRawScore: this.formatDecimal(totalRawScore),
        normalizedPercentage: this.formatDecimal(percentage),
        letterGrade: gradeRule.letterGrade,
        gradePoint: this.formatDecimal(gradePoint),
        creditHoursSnapshot: this.formatDecimal(creditHours),
        qualityPoints: this.formatDecimal(qualityPoints),
        computedByUserId: this.getActorId(),
        computedSnapshotJson: {
          formulaVersion: "mvp-weighted-components",
          source: "grading_records",
          componentCount: components.length,
          eligibilityStatus
        }
      });

      if (!result) {
        throw new ConflictException("Published, locked, verified, or amended results require amendment flow");
      }

      await this.repository.replaceResultComponents(
        departmentId,
        (result as { id: string }).id,
        components.map((component) => ({
          departmentId,
          resultRecordId: (result as { id: string }).id,
          ...component
        }))
      );

      await this.writeAudit(
        RESULT_PROCESSING_AUDIT_EVENTS.RESULT_COMPUTED,
        "result_record",
        result,
        {
          courseOfferingId: offering.id,
          enrollmentId: enrollment.id,
          componentCount: components.length
        }
      );

      computed.push(result);
    }

    return computed;
  }

  async verifyResult(id: string) {
    this.assertAdminOrExamOffice("Only exam office or department admins can verify results");
    const result = await this.repository.verifyResult(this.getDepartmentId(), id, this.getActorId());

    if (!result) {
      throw new ConflictException("Only computed results can be verified");
    }

    await this.writeAudit(RESULT_PROCESSING_AUDIT_EVENTS.RESULT_VERIFIED, "result_record", result);
    return result;
  }

  async publishResult(id: string) {
    this.assertAdminOrExamOffice("Only exam office or department admins can publish results");
    const result = await this.repository.publishResult(this.getDepartmentId(), id, this.getActorId());

    if (!result) {
      throw new ConflictException("Only verified results can be published");
    }

    await this.writeAudit(RESULT_PROCESSING_AUDIT_EVENTS.RESULT_PUBLISHED, "result_record", result);
    return result;
  }

  async computeTermGpa(input: { academicTermId: string; studentUserId?: string }) {
    this.assertAdminOrExamOffice("Only exam office or department admins can compute GPA records");
    await this.assertAcademicTermInDepartment(input.academicTermId);
    const grouped = await this.findPublishedResultsByStudent(input.academicTermId, input.studentUserId);
    const records = [];

    for (const [studentUserId, results] of grouped.entries()) {
      const totals = this.calculateGpaTotals(results);
      const record = await this.repository.upsertGpaRecord({
        departmentId: this.getDepartmentId(),
        academicTermId: input.academicTermId,
        studentUserId,
        attemptedCredits: this.formatDecimal(totals.attemptedCredits),
        earnedCredits: this.formatDecimal(totals.earnedCredits),
        qualityPoints: this.formatDecimal(totals.qualityPoints),
        gpa: this.formatDecimal(totals.gpa),
        resultCount: results.length,
        computedByUserId: this.getActorId(),
        computedSnapshotJson: {
          formulaVersion: "mvp-credit-weighted-gpa",
          resultIds: results.map((result) => result.id)
        }
      });

      await this.writeAudit(RESULT_PROCESSING_AUDIT_EVENTS.GPA_COMPUTED, "gpa_record", record, {
        academicTermId: input.academicTermId,
        studentUserId
      });

      records.push(record);
    }

    return records;
  }

  listGpa(filters: { academicTermId?: string; studentUserId?: string }) {
    return this.repository.findGpaRecords({
      departmentId: this.getDepartmentId(),
      studentUserId: this.isStudent() ? this.getActorId() : filters.studentUserId,
      academicTermId: filters.academicTermId
    });
  }

  async listCgpa(filters: { studentUserId?: string; asOfAcademicTermId?: string }) {
    if (!filters.studentUserId && this.isAdminOrExamOffice()) {
      return this.repository.findCgpaRecords({
        departmentId: this.getDepartmentId(),
        asOfAcademicTermId: filters.asOfAcademicTermId
      });
    }

    const studentUserId = this.isStudent() ? this.getActorId() : filters.studentUserId;

    if (!studentUserId) {
      return [];
    }

    await this.computeCgpaForStudent(studentUserId, filters.asOfAcademicTermId);
    return this.repository.findCgpaRecords({
      departmentId: this.getDepartmentId(),
      studentUserId,
      asOfAcademicTermId: filters.asOfAcademicTermId
    });
  }

  async createPublicationBatch(input: {
    academicTermId: string;
    batchCode: string;
    name: string;
    resultIds?: string[];
  }) {
    this.assertAdminOrExamOffice("Only exam office or department admins can manage publications");
    await this.assertAcademicTermInDepartment(input.academicTermId);

    const batch = await this.repository.createPublicationBatch({
      departmentId: this.getDepartmentId(),
      academicTermId: input.academicTermId,
      batchCode: input.batchCode,
      name: input.name,
      initiatedByUserId: this.getActorId(),
      selectionSnapshotJson: {
        resultIds: input.resultIds ?? []
      }
    });

    await this.writeAudit(
      RESULT_PROCESSING_AUDIT_EVENTS.PUBLICATION_BATCH_CREATED,
      "result_publication_batch",
      batch,
      { academicTermId: input.academicTermId }
    );

    return batch;
  }

  listPublicationBatches(filters: {
    academicTermId?: string;
    status?: ResultPublicationBatchStatus;
  }) {
    return this.repository.findPublicationBatches({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getPublicationBatch(id: string) {
    const batch = await this.repository.findPublicationBatchById(this.getDepartmentId(), id);

    if (!batch) {
      throw new NotFoundException("Result publication batch not found");
    }

    return batch;
  }

  async requestAmendment(input: {
    resultRecordId: string;
    reason: string;
    proposedNormalizedPercentage?: string;
    proposedLetterGrade?: string;
    proposedGradePoint?: string;
  }) {
    const result = (await this.repository.findResultById(
      this.getDepartmentId(),
      input.resultRecordId
    )) as ResultRecord | null;

    if (!result) {
      throw new NotFoundException("Result record not found");
    }

    if (
      result.status !== ResultRecordStatus.PUBLISHED &&
      result.status !== ResultRecordStatus.LOCKED
    ) {
      throw new BadRequestException("Only published or locked results can be amended");
    }

    const amendment = await this.repository.createAmendment({
      departmentId: this.getDepartmentId(),
      resultRecordId: result.id,
      reason: input.reason,
      requestedByUserId: this.getActorId(),
      requestSnapshotJson: {
        normalizedPercentage: input.proposedNormalizedPercentage,
        letterGrade: input.proposedLetterGrade,
        gradePoint: input.proposedGradePoint
      },
      previousSnapshotJson: {
        normalizedPercentage: result.normalizedPercentage?.toString(),
        letterGrade: result.letterGrade,
        gradePoint: result.gradePoint?.toString(),
        qualityPoints: result.qualityPoints?.toString()
      }
    });

    await this.writeAudit(
      RESULT_PROCESSING_AUDIT_EVENTS.AMENDMENT_REQUESTED,
      "result_amendment_record",
      amendment,
      { resultRecordId: result.id }
    );

    return amendment;
  }

  listAmendments(filters: { resultRecordId?: string; status?: ResultAmendmentStatus }) {
    return this.repository.findAmendments({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async approveAmendment(id: string) {
    this.assertAdminOrExamOffice("Only exam office or department admins can approve amendments");
    const amendment = await this.repository.approveAmendment(
      this.getDepartmentId(),
      id,
      this.getActorId()
    );

    if (!amendment) {
      throw new ConflictException("Only requested amendments can be approved");
    }

    await this.writeAudit(
      RESULT_PROCESSING_AUDIT_EVENTS.AMENDMENT_APPROVED,
      "result_amendment_record",
      amendment
    );
    return amendment;
  }

  async applyAmendment(id: string) {
    this.assertAdminOrExamOffice("Only exam office or department admins can apply amendments");
    const amendment = await this.repository.applyAmendment(this.getDepartmentId(), id, this.getActorId(), {
      appliedByUserId: this.getActorId(),
      appliedAt: new Date().toISOString()
    });

    if (!amendment) {
      throw new ConflictException("Only approved amendments for published or locked results can be applied");
    }

    await this.writeAudit(
      RESULT_PROCESSING_AUDIT_EVENTS.AMENDMENT_APPLIED,
      "result_amendment_record",
      amendment
    );
    return amendment;
  }

  private buildComponents(records: GradingRecordWithSource[]) {
    const weight = 100 / records.length;

    return records.map((record, index) => {
      const assignment = record.assignmentSubmission?.assignment;
      const quiz = record.quizAttempt?.quiz;
      const maxScore = (assignment?.maxPoints ?? quiz?.maxPoints ?? record.pointsAwarded).toNumber();
      const rawScore = record.pointsAwarded.toNumber();
      const normalizedPercentage = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
      const weightedScore = (normalizedPercentage * weight) / 100;

      return {
        gradingRecordId: record.id,
        sourceType: assignment ? "ASSIGNMENT" as const : quiz ? "QUIZ" as const : "MANUAL" as const,
        sourceEntityId: record.assignmentSubmissionId ?? record.quizAttemptId ?? undefined,
        componentCode: `${assignment ? "ASSIGNMENT" : quiz ? "QUIZ" : "MANUAL"}_${index + 1}`,
        componentName: assignment?.title ?? quiz?.title ?? `Component ${index + 1}`,
        weightPercent: this.formatDecimal(weight),
        rawScore: this.formatDecimal(rawScore),
        maxScore: this.formatDecimal(maxScore),
        normalizedPercentage: this.formatDecimal(normalizedPercentage),
        weightedScore: this.formatDecimal(weightedScore),
        sourceSnapshotJson: {
          gradingRecordId: record.id,
          targetType: record.targetType
        }
      };
    });
  }

  private mapGradeRule(scale: GradeScaleRecord, percentage: number) {
    const rule = scale.gradeRules.find((candidate) => {
      return percentage >= candidate.minPercentage.toNumber() && percentage <= candidate.maxPercentage.toNumber();
    });

    if (!rule) {
      throw new BadRequestException("No grade rule matches computed percentage");
    }

    return rule;
  }

  private recordEnrollmentId(record: GradingRecordWithSource) {
    return record.assignmentSubmission?.enrollmentId ?? record.quizAttempt?.enrollmentId ?? null;
  }

  private calculateGpaTotals(results: ResultRecord[]) {
    const attemptedCredits = results.reduce(
      (sum, result) => sum + result.creditHoursSnapshot.toNumber(),
      0
    );
    const qualityPoints = results.reduce(
      (sum, result) => sum + (result.qualityPoints?.toNumber() ?? 0),
      0
    );
    const earnedCredits = results.reduce((sum, result) => {
      return sum + ((result.gradePoint?.toNumber() ?? 0) > 0 ? result.creditHoursSnapshot.toNumber() : 0);
    }, 0);

    return {
      attemptedCredits,
      earnedCredits,
      qualityPoints,
      gpa: attemptedCredits > 0 ? qualityPoints / attemptedCredits : 0
    };
  }

  private async computeCgpaForStudent(studentUserId: string, asOfAcademicTermId?: string) {
    const gpaRecords = await this.repository.findGpaRecords({
      departmentId: this.getDepartmentId(),
      studentUserId
    }) as Array<{
      academicTermId: string;
      attemptedCredits: Prisma.Decimal;
      earnedCredits: Prisma.Decimal;
      qualityPoints: Prisma.Decimal;
    }>;

    const filtered = asOfAcademicTermId
      ? gpaRecords.filter((record) => record.academicTermId <= asOfAcademicTermId)
      : gpaRecords;
    const attemptedCredits = filtered.reduce((sum, record) => sum + record.attemptedCredits.toNumber(), 0);
    const earnedCredits = filtered.reduce((sum, record) => sum + record.earnedCredits.toNumber(), 0);
    const qualityPoints = filtered.reduce((sum, record) => sum + record.qualityPoints.toNumber(), 0);
    const cgpa = attemptedCredits > 0 ? qualityPoints / attemptedCredits : 0;

    const record = await this.repository.upsertCgpaRecord({
      departmentId: this.getDepartmentId(),
      studentUserId,
      asOfAcademicTermId,
      attemptedCredits: this.formatDecimal(attemptedCredits),
      earnedCredits: this.formatDecimal(earnedCredits),
      cumulativeQualityPoints: this.formatDecimal(qualityPoints),
      cgpa: this.formatDecimal(cgpa),
      termCount: filtered.length,
      computedByUserId: this.getActorId(),
      computedSnapshotJson: {
        formulaVersion: "mvp-cumulative-gpa",
        termCount: filtered.length
      }
    });

    await this.writeAudit(RESULT_PROCESSING_AUDIT_EVENTS.CGPA_COMPUTED, "cgpa_record", record, {
      studentUserId,
      asOfAcademicTermId
    });
  }

  private async findPublishedResultsByStudent(academicTermId: string, studentUserId?: string) {
    const results = (await this.repository.findResults({
      departmentId: this.getDepartmentId(),
      academicTermId,
      studentUserId,
      status: ResultRecordStatus.PUBLISHED
    })) as Array<ResultRecord & { enrollment: { studentUserId: string } }>;
    const grouped = new Map<string, ResultRecord[]>();

    for (const result of results) {
      const key = result.enrollment.studentUserId;
      grouped.set(key, [...(grouped.get(key) ?? []), result]);
    }

    return grouped;
  }

  private async findGradingRecords(courseOfferingId: string): Promise<GradingRecordWithSource[]> {
    return this.prisma.gradingRecord.findMany({
      where: {
        departmentId: this.getDepartmentId(),
        courseOfferingId
      },
      include: {
        assignmentSubmission: {
          include: {
            assignment: true
          }
        },
        quizAttempt: {
          include: {
            quiz: true
          }
        }
      },
      orderBy: {
        gradedAt: "asc"
      }
    });
  }

  private async findApprovedEnrollments(courseOfferingId: string, enrollmentId?: string) {
    return this.prisma.enrollment.findMany({
      where: {
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        status: "APPROVED",
        archivedAt: null,
        ...(enrollmentId ? { id: enrollmentId } : {})
      },
      select: {
        id: true,
        eligibilityStatus: true
      }
    });
  }

  private async resolveGradeScale(gradeScaleId?: string) {
    const scale = gradeScaleId
      ? await this.repository.findGradeScaleById(this.getDepartmentId(), gradeScaleId)
      : await this.prisma.gradeScale.findFirst({
          where: {
            departmentId: this.getDepartmentId(),
            archivedAt: null,
            isActive: true,
            isDefault: true
          },
          include: {
            gradeRules: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" }
            }
          }
        });

    if (!scale) {
      throw new BadRequestException("Active grade scale is required for result computation");
    }

    return scale as GradeScaleRecord;
  }

  private async assertOfferingInDepartment(courseOfferingId: string): Promise<OfferingRecord> {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      include: {
        course: true
      }
    });

    if (!offering) {
      throw new BadRequestException("Course offering does not belong to the active department");
    }

    return offering;
  }

  private async assertAcademicTermInDepartment(academicTermId: string) {
    const term = await this.prisma.academicTerm.findFirst({
      where: {
        id: academicTermId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: { id: true }
    });

    if (!term) {
      throw new BadRequestException("Academic term does not belong to the active department");
    }
  }

  private async assertCanComputeOffering(courseOfferingId: string) {
    await this.assertOfferingInDepartment(courseOfferingId);

    if (this.isAdminOrExamOffice()) {
      return;
    }

    if (!this.isTeacher()) {
      throw new ForbiddenException("Only assigned teachers can compute draft results");
    }

    const assignment = await this.prisma.teacherCourseAssignment.findFirst({
      where: {
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        teacherUserId: this.getActorId(),
        status: TeacherAssignmentStatus.ACTIVE,
        archivedAt: null
      },
      select: { id: true }
    });

    if (!assignment) {
      throw new ForbiddenException("Teacher is not assigned to this course offering");
    }
  }

  private assertCanReadResult(result: { enrollment?: { studentUserId: string } }) {
    if (this.isStudent() && result.enrollment?.studentUserId !== this.getActorId()) {
      throw new ForbiddenException("Students can only read their own results");
    }
  }

  private assertAdminOrExamOffice(message: string) {
    if (!this.isAdminOrExamOffice()) {
      throw new ForbiddenException(message);
    }
  }

  private isAdminOrExamOffice() {
    return EXAM_OFFICE_ROLES.some((role) => this.hasRole(role));
  }

  private isTeacher() {
    return this.hasRole(RESULT_PROCESSING_ROLE_NAMES.TEACHER);
  }

  private isStudent() {
    return this.hasRole(RESULT_PROCESSING_ROLE_NAMES.STUDENT);
  }

  private hasRole(role: string) {
    return this.getPrincipal().roleAssignments.some((assignment) => assignment.role === role);
  }

  private getDepartmentId() {
    const activeDepartmentId = this.getPrincipal().activeDepartmentId;

    if (!activeDepartmentId) {
      throw new BadRequestException("Active department context is required");
    }

    return activeDepartmentId;
  }

  private getActorId() {
    const actorId = this.getPrincipal().actorId;

    if (!actorId) {
      throw new BadRequestException("Authenticated actor is required");
    }

    return actorId;
  }

  private getPrincipal(): PrincipalContext {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.isAuthenticated) {
      throw new BadRequestException("Authenticated principal is required");
    }

    return principal;
  }

  private formatDecimal(value: number) {
    return value.toFixed(2);
  }

  private async writeAudit(
    action: string,
    targetType: string,
    target: unknown,
    metadata?: AuditMetadata
  ) {
    const requestContext = this.requestContextService.get();
    const targetId = (target as { id?: string }).id ?? null;

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

  private rethrowKnownError(error: unknown, message: string): never {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }

    throw error;
  }
}
