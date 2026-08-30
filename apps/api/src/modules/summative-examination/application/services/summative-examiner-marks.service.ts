import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  SummativeExaminerMarkSubmissionStatus,
  SummativeQuestionConfigurationStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import type { SaveExaminerQuestionMarkDto } from "../../presentation/http/dto/examiner-marks.dto";
import {
  ExaminerAuthorityService,
  type ExaminerMarkingAuthority,
} from "./examiner-authority.service";

const AWARDED_DECIMAL_6_2_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

const submissionSelect = {
  id: true,
  examinationId: true,
  examinationCourseId: true,
  candidateId: true,
  examinerAssignmentId: true,
  examinerSeat: true,
  questionConfigurationId: true,
  versionNumber: true,
  status: true,
  totalMark: true,
  submittedAt: true,
  lockedAt: true,
  createdAt: true,
  updatedAt: true,
  questionMarks: {
    orderBy: { questionItemId: "asc" as const },
    select: {
      id: true,
      questionItemId: true,
      awardedMark: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

type SubmissionRecord = Prisma.SummativeExaminerMarkSubmissionGetPayload<{
  select: typeof submissionSelect;
}>;

interface LockedMarkingScope {
  examinationId: string;
  examinationCourseId: string;
  summativeFullMark: Prisma.Decimal;
  questionConfiguration: {
    id: string;
    versionNumber: number;
    status: SummativeQuestionConfigurationStatus;
  };
}

@Injectable()
export class SummativeExaminerMarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly examinerAuthority: ExaminerAuthorityService,
  ) {}

  async getWorkspace(examinationCourseId: string) {
    const authority =
      await this.examinerAuthority.authorizeMarking(examinationCourseId);
    const course = await this.prisma.examinationCourse.findFirst({
      where: {
        id: authority.examinationCourseId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        archivedAt: null,
        examination: {
          is: {
            id: authority.examinationId,
            departmentId: authority.departmentId,
            archivedAt: null,
          },
        },
        lockedQuestionConfigurationId: { not: null },
        lockedQuestionConfiguration: {
          is: {
            departmentId: authority.departmentId,
            examinationId: authority.examinationId,
            examinationCourseId: authority.examinationCourseId,
            status: SummativeQuestionConfigurationStatus.LOCKED,
            archivedAt: null,
          },
        },
      },
      select: {
        id: true,
        examinationId: true,
        summativeFullMark: true,
        markingDeadline: true,
        lockedQuestionConfiguration: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            lockedAt: true,
            items: {
              where: { isActive: true },
              orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                questionLabel: true,
                subQuestionLabel: true,
                displayOrder: true,
                fullMark: true,
                isRequired: true,
                cloId: true,
                bloomLevel: true,
              },
            },
          },
        },
      },
    });
    if (!course?.lockedQuestionConfiguration) {
      throw new NotFoundException("Examiner marking workspace not found");
    }

    const candidates = await this.prisma.summativeExaminationCandidate.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
      },
      select: { id: true, registeredAt: true },
      orderBy: { id: "asc" },
    });
    const ownSubmissions =
      await this.prisma.summativeExaminerMarkSubmission.findMany({
        where: {
          departmentId: authority.departmentId,
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          examinerAssignmentId: authority.examinerAssignmentId,
          candidateId: { in: candidates.map((candidate) => candidate.id) },
        },
        select: submissionSelect,
        orderBy: [{ candidateId: "asc" }, { versionNumber: "desc" }],
      });
    const latestOwnSubmissionByCandidate = new Map<string, SubmissionRecord>();
    for (const submission of ownSubmissions) {
      if (!latestOwnSubmissionByCandidate.has(submission.candidateId)) {
        latestOwnSubmissionByCandidate.set(submission.candidateId, submission);
      }
    }

    return {
      assignment: {
        id: authority.examinerAssignmentId,
        seat: authority.seat,
      },
      examinationCourse: {
        id: course.id,
        examinationId: course.examinationId,
        summativeFullMark: course.summativeFullMark.toString(),
        markingDeadline: course.markingDeadline,
      },
      questionConfiguration: {
        id: course.lockedQuestionConfiguration.id,
        versionNumber: course.lockedQuestionConfiguration.versionNumber,
        status: course.lockedQuestionConfiguration.status,
        lockedAt: course.lockedQuestionConfiguration.lockedAt,
        items: course.lockedQuestionConfiguration.items.map((item) => ({
          ...item,
          fullMark: item.fullMark.toString(),
        })),
      },
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        registeredAt: candidate.registeredAt,
        ownSubmission: this.serializeSubmission(
          latestOwnSubmissionByCandidate.get(candidate.id) ?? null,
        ),
      })),
    };
  }

  async getOwnSubmission(examinationCourseId: string, candidateId: string) {
    const authority =
      await this.examinerAuthority.authorizeMarking(examinationCourseId);
    await this.assertCandidateReadScope(authority, candidateId);
    const submission = await this.findLatestOwnSubmission(authority, candidateId);
    return { candidateId, submission: this.serializeSubmission(submission) };
  }

  async saveQuestionMark(
    examinationCourseId: string,
    candidateId: string,
    questionItemId: string,
    input: SaveExaminerQuestionMarkDto,
  ) {
    const authority =
      await this.examinerAuthority.authorizeMarking(examinationCourseId);
    const transitionAt = new Date();
    const awardedMark = this.parseAwardedMark(input.awardedMark);

    return this.serializable(async (tx) => {
      const scope = await this.lockMarkingScope(tx, authority, transitionAt);
      await this.lockCandidate(tx, authority, candidateId);
      let submission = await this.lockLatestOwnSubmission(
        tx,
        authority,
        candidateId,
      );

      if (input.awardedMark === undefined) {
        return {
          candidateId,
          submission: this.serializeSubmission(submission),
        };
      }
      if (
        submission?.status === SummativeExaminerMarkSubmissionStatus.LOCKED
      ) {
        throw new ConflictException("Locked Examiner submission is immutable");
      }
      if (!submission && awardedMark === null) {
        return { candidateId, submission: null };
      }
      if (!submission) {
        await this.assertSeatHasNoExistingSubmission(
          tx,
          authority,
          candidateId,
        );
        const created = await tx.summativeExaminerMarkSubmission.create({
          data: {
            departmentId: authority.departmentId,
            examinationId: scope.examinationId,
            examinationCourseId: scope.examinationCourseId,
            candidateId,
            examinerAssignmentId: authority.examinerAssignmentId,
            examinerSeat: authority.seat,
            questionConfigurationId: scope.questionConfiguration.id,
            versionNumber: 1,
            status: SummativeExaminerMarkSubmissionStatus.DRAFT,
          },
          select: submissionSelect,
        });
        await this.writeAudit(
          tx,
          authority,
          created,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS
            .EXAMINER_MARK_SUBMISSION_DRAFT_CREATED,
          {
            statusTransition: "ASSIGNED_TO_DRAFT",
          },
        );
        submission = created;
      }
      this.assertSubmissionUsesScope(submission, scope);

      const item = await this.lockActiveQuestionItem(
        tx,
        authority,
        scope.questionConfiguration.id,
        questionItemId,
      );
      await this.lockQuestionMarks(tx, authority, submission.id);
      const existing = await tx.summativeExaminerQuestionMark.findFirst({
        where: {
          submissionId: submission.id,
          departmentId: authority.departmentId,
          examinationCourseId: authority.examinationCourseId,
          questionConfigurationId: scope.questionConfiguration.id,
          questionItemId,
        },
        select: { id: true },
      });

      if (awardedMark === null) {
        if (existing) {
          await tx.summativeExaminerQuestionMark.delete({
            where: { id: existing.id },
          });
          await this.writeAudit(
            tx,
            authority,
            submission,
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_QUESTION_MARK_CLEARED,
            {
              questionItemId,
              mutation: "CLEAR",
              statusTransition: "DRAFT_TO_DRAFT",
            },
          );
        }
      } else {
        if (awardedMark.gt(item.fullMark)) {
          throw new BadRequestException(
            "Awarded mark exceeds configured question full mark",
          );
        }
        if (existing) {
          await tx.summativeExaminerQuestionMark.update({
            where: { id: existing.id },
            data: { awardedMark },
          });
        } else {
          await tx.summativeExaminerQuestionMark.create({
            data: {
              departmentId: authority.departmentId,
              examinationCourseId: authority.examinationCourseId,
              submissionId: submission.id,
              questionConfigurationId: scope.questionConfiguration.id,
              questionItemId,
              awardedMark,
            },
          });
        }
        await this.writeAudit(
          tx,
          authority,
          submission,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_QUESTION_MARK_SAVED,
          {
            questionItemId,
            mutation: existing ? "UPDATE" : "CREATE",
            statusTransition: "DRAFT_TO_DRAFT",
          },
        );
      }

      const refreshed = await tx.summativeExaminerMarkSubmission.findFirst({
        where: this.ownSubmissionWhere(authority, candidateId, submission.id),
        select: submissionSelect,
      });
      if (!refreshed) throw new NotFoundException("Examiner submission not found");
      return { candidateId, submission: this.serializeSubmission(refreshed) };
    });
  }

  async finalizeSubmission(
    examinationCourseId: string,
    candidateId: string,
  ) {
    const authority =
      await this.examinerAuthority.authorizeMarking(examinationCourseId);
    const transitionAt = new Date();

    return this.serializable(async (tx) => {
      const scope = await this.lockMarkingScope(tx, authority, transitionAt);
      await this.lockCandidate(tx, authority, candidateId);
      const submission = await this.lockLatestOwnSubmission(
        tx,
        authority,
        candidateId,
      );
      if (!submission) {
        throw new BadRequestException("Required question marks are missing");
      }
      this.assertSubmissionUsesScope(submission, scope);
      if (submission.status === SummativeExaminerMarkSubmissionStatus.LOCKED) {
        return {
          candidateId,
          submission: this.serializeSubmission(submission),
        };
      }

      const configuredItems = await this.lockActiveQuestionItems(
        tx,
        authority,
        scope.questionConfiguration.id,
      );
      if (configuredItems.length === 0) {
        throw new BadRequestException(
          "Authoritative question configuration has no active items",
        );
      }
      await this.lockQuestionMarks(tx, authority, submission.id);
      const persistedMarks = await tx.summativeExaminerQuestionMark.findMany({
        where: {
          submissionId: submission.id,
          departmentId: authority.departmentId,
          examinationCourseId: authority.examinationCourseId,
          questionConfigurationId: scope.questionConfiguration.id,
        },
        select: { questionItemId: true, awardedMark: true },
        orderBy: { questionItemId: "asc" },
      });
      const itemById = new Map(configuredItems.map((item) => [item.id, item]));
      const markByItemId = new Map(
        persistedMarks.map((mark) => [mark.questionItemId, mark]),
      );
      const missingRequired = configuredItems.some(
        (item) => item.isRequired && !markByItemId.has(item.id),
      );
      if (missingRequired) {
        throw new BadRequestException("Required question marks are missing");
      }
      if (
        persistedMarks.some((mark) => {
          const item = itemById.get(mark.questionItemId);
          return !item || mark.awardedMark.lt(0) || mark.awardedMark.gt(item.fullMark);
        })
      ) {
        throw new BadRequestException(
          "Submission contains a mark outside the authoritative configuration",
        );
      }

      const total = persistedMarks.reduce(
        (sum, mark) => sum.add(mark.awardedMark),
        new Prisma.Decimal(0),
      );
      if (total.gt(scope.summativeFullMark)) {
        throw new BadRequestException(
          "Examiner total exceeds ExaminationCourse summative full mark",
        );
      }

      const mutation = await tx.summativeExaminerMarkSubmission.updateMany({
        where: {
          id: submission.id,
          departmentId: authority.departmentId,
          examinationCourseId: authority.examinationCourseId,
          examinerAssignmentId: authority.examinerAssignmentId,
          candidateId,
          questionConfigurationId: scope.questionConfiguration.id,
          versionNumber: submission.versionNumber,
          status: SummativeExaminerMarkSubmissionStatus.DRAFT,
          totalMark: null,
          submittedAt: null,
          lockedAt: null,
        },
        data: {
          status: SummativeExaminerMarkSubmissionStatus.LOCKED,
          totalMark: total,
          submittedAt: transitionAt,
          lockedAt: transitionAt,
        },
      });
      if (mutation.count !== 1) {
        throw new ConflictException("Concurrent Examiner submission change");
      }
      const locked = await tx.summativeExaminerMarkSubmission.findFirst({
        where: this.ownSubmissionWhere(authority, candidateId, submission.id),
        select: submissionSelect,
      });
      if (!locked) throw new NotFoundException("Examiner submission not found");
      await this.writeAudit(
        tx,
        authority,
        locked,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_MARK_SUBMISSION_LOCKED,
        {
          statusTransition: "DRAFT_TO_LOCKED",
          activeQuestionCount: configuredItems.length,
          persistedQuestionMarkCount: persistedMarks.length,
        },
      );
      return { candidateId, submission: this.serializeSubmission(locked) };
    });
  }

  private async assertCandidateReadScope(
    authority: ExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const candidate = await this.prisma.summativeExaminationCandidate.findFirst({
      where: {
        id: candidateId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
      },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException("Examination candidate not found");
  }

  private findLatestOwnSubmission(
    authority: ExaminerMarkingAuthority,
    candidateId: string,
  ) {
    return this.prisma.summativeExaminerMarkSubmission.findFirst({
      where: this.ownSubmissionWhere(authority, candidateId),
      select: submissionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  private async lockMarkingScope(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    evaluatedAt: Date,
  ): Promise<LockedMarkingScope> {
    const base = await tx.examinationCourse.findFirst({
      where: {
        id: authority.examinationCourseId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
      },
      select: {
        id: true,
        examinationId: true,
        summativeFullMark: true,
        lockedQuestionConfigurationId: true,
      },
    });
    if (!base) throw new NotFoundException("Examiner marking workspace not found");

    const examinationRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "examinations"
        WHERE "id" = ${authority.examinationId}
          AND "department_id" = ${authority.departmentId}
          AND "archived_at" IS NULL
        FOR UPDATE
      `,
    );
    if (examinationRows.length !== 1) {
      throw new NotFoundException("Examiner marking workspace not found");
    }
    const courseRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_courses"
      WHERE "id" = ${authority.examinationCourseId}
        AND "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (courseRows.length !== 1 || !base.lockedQuestionConfigurationId) {
      throw new NotFoundException("Examiner marking workspace not found");
    }

    await this.examinerAuthority.assertCurrentMarkingAuthority(
      tx,
      authority,
      evaluatedAt,
    );

    const configurationRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "summative_question_configurations"
        WHERE "id" = ${base.lockedQuestionConfigurationId}
          AND "department_id" = ${authority.departmentId}
          AND "examination_id" = ${authority.examinationId}
          AND "examination_course_id" = ${authority.examinationCourseId}
          AND "status" = ${SummativeQuestionConfigurationStatus.LOCKED}::"SummativeQuestionConfigurationStatus"
          AND "archived_at" IS NULL
        FOR UPDATE
      `,
    );
    if (configurationRows.length !== 1) {
      throw new NotFoundException("Examiner marking workspace not found");
    }
    const configuration = await tx.summativeQuestionConfiguration.findFirst({
      where: {
        id: base.lockedQuestionConfigurationId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
        status: SummativeQuestionConfigurationStatus.LOCKED,
        archivedAt: null,
      },
      select: { id: true, versionNumber: true, status: true },
    });
    if (!configuration) {
      throw new NotFoundException("Examiner marking workspace not found");
    }
    return {
      examinationId: authority.examinationId,
      examinationCourseId: authority.examinationCourseId,
      summativeFullMark: base.summativeFullMark,
      questionConfiguration: configuration,
    };
  }

  private async lockCandidate(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_examination_candidates"
      WHERE "id" = ${candidateId}
        AND "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException("Examination candidate not found");
    }
  }

  private async lockLatestOwnSubmission(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    candidateId: string,
  ): Promise<SubmissionRecord | null> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_examiner_mark_submissions"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "candidate_id" = ${candidateId}
        AND "examiner_assignment_id" = ${authority.examinerAssignmentId}
        AND "examiner_seat" = ${authority.seat}::"ExaminationCourseExaminerSeat"
      ORDER BY "version_number", "id"
      FOR UPDATE
    `);
    return tx.summativeExaminerMarkSubmission.findFirst({
      where: this.ownSubmissionWhere(authority, candidateId),
      select: submissionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  private async assertSeatHasNoExistingSubmission(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_examiner_mark_submissions"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "candidate_id" = ${candidateId}
        AND "examiner_seat" = ${authority.seat}::"ExaminationCourseExaminerSeat"
      ORDER BY "version_number", "id"
      FOR UPDATE
    `);
    if (rows.length !== 0) {
      throw new ConflictException(
        "Existing Examiner seat submission requires an authorised correction workflow",
      );
    }
  }

  private async lockActiveQuestionItem(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    configurationId: string,
    questionItemId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_question_configuration_items"
      WHERE "id" = ${questionItemId}
        AND "department_id" = ${authority.departmentId}
        AND "configuration_id" = ${configurationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "is_active" = TRUE
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException("Question item not found");
    }
    const item = await tx.summativeQuestionConfigurationItem.findFirst({
      where: {
        id: questionItemId,
        departmentId: authority.departmentId,
        configurationId,
        examinationCourseId: authority.examinationCourseId,
        isActive: true,
      },
      select: { id: true, fullMark: true, isRequired: true },
    });
    if (!item) throw new NotFoundException("Question item not found");
    return item;
  }

  private async lockActiveQuestionItems(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    configurationId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_question_configuration_items"
      WHERE "department_id" = ${authority.departmentId}
        AND "configuration_id" = ${configurationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "is_active" = TRUE
      ORDER BY "id"
      FOR UPDATE
    `);
    return tx.summativeQuestionConfigurationItem.findMany({
      where: {
        departmentId: authority.departmentId,
        configurationId,
        examinationCourseId: authority.examinationCourseId,
        isActive: true,
      },
      select: { id: true, fullMark: true, isRequired: true },
      orderBy: { id: "asc" },
    });
  }

  private async lockQuestionMarks(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    submissionId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_examiner_question_marks"
      WHERE "submission_id" = ${submissionId}
        AND "department_id" = ${authority.departmentId}
        AND "examination_course_id" = ${authority.examinationCourseId}
      ORDER BY "question_item_id", "id"
      FOR UPDATE
    `);
  }

  private ownSubmissionWhere(
    authority: ExaminerMarkingAuthority,
    candidateId: string,
    submissionId?: string,
  ): Prisma.SummativeExaminerMarkSubmissionWhereInput {
    return {
      ...(submissionId ? { id: submissionId } : {}),
      departmentId: authority.departmentId,
      examinationId: authority.examinationId,
      examinationCourseId: authority.examinationCourseId,
      candidateId,
      examinerAssignmentId: authority.examinerAssignmentId,
      examinerSeat: authority.seat,
    };
  }

  private assertSubmissionUsesScope(
    submission: SubmissionRecord,
    scope: LockedMarkingScope,
  ) {
    if (
      submission.examinationId !== scope.examinationId ||
      submission.examinationCourseId !== scope.examinationCourseId ||
      submission.questionConfigurationId !== scope.questionConfiguration.id
    ) {
      throw new ConflictException(
        "Examiner submission does not use the authoritative question configuration",
      );
    }
  }

  private parseAwardedMark(value: string | null | undefined) {
    if (value === undefined || value === null) return value ?? null;
    if (typeof value !== "string" || !AWARDED_DECIMAL_6_2_PATTERN.test(value)) {
      throw new BadRequestException(
        "awardedMark must be a non-negative decimal string within Decimal(6,2)",
      );
    }
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(
        "awardedMark must be a valid Decimal(6,2) value",
      );
    }
  }

  private serializeSubmission(submission: SubmissionRecord | null) {
    if (!submission) return null;
    const calculatedTotal = submission.questionMarks.reduce(
      (sum, mark) => sum.add(mark.awardedMark),
      new Prisma.Decimal(0),
    );
    return {
      id: submission.id,
      candidateId: submission.candidateId,
      examinationCourseId: submission.examinationCourseId,
      examinerAssignmentId: submission.examinerAssignmentId,
      examinerSeat: submission.examinerSeat,
      questionConfigurationId: submission.questionConfigurationId,
      versionNumber: submission.versionNumber,
      status: submission.status,
      calculatedTotal: calculatedTotal.toString(),
      totalMark: submission.totalMark?.toString() ?? null,
      submittedAt: submission.submittedAt,
      lockedAt: submission.lockedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      questionMarks: submission.questionMarks.map((mark) => ({
        id: mark.id,
        questionItemId: mark.questionItemId,
        awardedMark: mark.awardedMark.toString(),
        createdAt: mark.createdAt,
        updatedAt: mark.updatedAt,
      })),
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    submission: Pick<
      SubmissionRecord,
      "id" | "candidateId" | "versionNumber" | "status"
    >,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType: "summative_examiner_mark_submission",
        targetId: submission.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: submission.candidateId,
          examinerAssignmentId: authority.examinerAssignmentId,
          examinerSeat: authority.seat,
          submissionId: submission.id,
          submissionVersion: submission.versionNumber,
          submissionStatus: submission.status,
          ...metadata,
        },
      },
    });
  }

  private isRetryableTransactionConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" &&
        (error.meta?.code === "40001" || error.meta?.code === "40P01"))
    );
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (attempt >= 2 || !this.isRetryableTransactionConflict(error)) {
          throw error;
        }
      }
    }
  }
}
