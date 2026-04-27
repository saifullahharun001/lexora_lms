import { Injectable } from "@nestjs/common";
import { EnrollmentStatus, Prisma, QuizAttemptStatus } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  AssessmentRepositoryPort,
  AssignmentListFilters,
  CreateAssignmentInput,
  CreateQuizAttemptInput,
  CreateQuizInput,
  CreateSubmissionInput,
  QuizListFilters,
  SubmissionListFilters,
  UpdateAssignmentInput
} from "../../application/ports/assessment.repository.port";

@Injectable()
export class PrismaAssessmentRepository implements AssessmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAssignments(filters: AssignmentListFilters) {
    return this.prisma.assignment.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        ...(filters.courseOfferingId ? { courseOfferingId: filters.courseOfferingId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findAssignmentById(departmentId: string, id: string) {
    return this.prisma.assignment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      }
    });
  }

  createAssignment(input: CreateAssignmentInput) {
    return this.prisma.assignment.create({
      data: {
        departmentId: input.departmentId,
        courseOfferingId: input.courseOfferingId,
        title: input.title,
        instructions: input.instructions,
        status: input.status,
        maxPoints: new Prisma.Decimal(input.maxPoints),
        availableFrom: input.availableFrom,
        dueAt: input.dueAt,
        closeAt: input.closeAt,
        allowLateSubmission: input.allowLateSubmission,
        maxLateMinutes: input.maxLateMinutes,
        maxSubmissionCount: input.maxSubmissionCount
      }
    });
  }

  updateAssignment(departmentId: string, id: string, input: UpdateAssignmentInput) {
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.AssignmentUpdateManyMutationInput = {
        ...input,
        maxPoints: input.maxPoints ? new Prisma.Decimal(input.maxPoints) : undefined
      };

      const result = await tx.assignment.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data
      });

      if (result.count === 0) {
        return null;
      }

      return tx.assignment.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        }
      });
    });
  }

  findSubmissions(filters: SubmissionListFilters) {
    return this.prisma.assignmentSubmission.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        assignmentId: filters.assignmentId,
        enrollmentId: filters.enrollmentId,
        enrollment: {
          status: EnrollmentStatus.APPROVED,
          ...(filters.studentUserId ? { studentUserId: filters.studentUserId } : {})
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findSubmissionById(departmentId: string, id: string) {
    return this.prisma.assignmentSubmission.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      }
    });
  }

  countSubmissions(input: { departmentId: string; assignmentId: string; enrollmentId: string }) {
    return this.prisma.assignmentSubmission.count({
      where: {
        departmentId: input.departmentId,
        assignmentId: input.assignmentId,
        enrollmentId: input.enrollmentId,
        archivedAt: null
      }
    });
  }

  createSubmission(input: CreateSubmissionInput) {
    return this.prisma.assignmentSubmission.create({
      data: {
        departmentId: input.departmentId,
        assignmentId: input.assignmentId,
        enrollmentId: input.enrollmentId,
        attemptNumber: input.attemptNumber,
        status: input.status,
        submittedAt: input.submittedAt,
        isLate: input.isLate,
        lateByMinutes: input.lateByMinutes,
        notes: input.notes
      }
    });
  }

  findQuizzes(filters: QuizListFilters) {
    return this.prisma.quiz.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        ...(filters.courseOfferingId ? { courseOfferingId: filters.courseOfferingId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findQuizById(departmentId: string, id: string) {
    return this.prisma.quiz.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      }
    });
  }

  createQuiz(input: CreateQuizInput) {
    return this.prisma.quiz.create({
      data: {
        departmentId: input.departmentId,
        courseOfferingId: input.courseOfferingId,
        title: input.title,
        instructions: input.instructions,
        status: input.status,
        maxPoints: new Prisma.Decimal(input.maxPoints),
        availableFrom: input.availableFrom,
        startsAt: input.startsAt,
        dueAt: input.dueAt,
        closeAt: input.closeAt,
        timeLimitMinutes: input.timeLimitMinutes,
        maxAttempts: input.maxAttempts,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        autoGradingEnabled: input.autoGradingEnabled,
        evaluationConfigJson: input.evaluationConfigJson
      }
    });
  }

  countQuizAttempts(input: { departmentId: string; quizId: string; enrollmentId: string }) {
    return this.prisma.quizAttempt.count({
      where: {
        departmentId: input.departmentId,
        quizId: input.quizId,
        enrollmentId: input.enrollmentId,
        archivedAt: null
      }
    });
  }

  findQuizAttemptById(departmentId: string, id: string) {
    return this.prisma.quizAttempt.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      }
    });
  }

  createQuizAttempt(input: CreateQuizAttemptInput) {
    return this.prisma.quizAttempt.create({
      data: {
        departmentId: input.departmentId,
        courseOfferingId: input.courseOfferingId,
        quizId: input.quizId,
        enrollmentId: input.enrollmentId,
        attemptNumber: input.attemptNumber,
        timeLimitMinutesSnapshot: input.timeLimitMinutesSnapshot
      }
    });
  }

  submitQuizAttempt(departmentId: string, id: string, submittedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.quizAttempt.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
          status: QuizAttemptStatus.IN_PROGRESS
        },
        data: {
          status: QuizAttemptStatus.SUBMITTED,
          submittedAt
        }
      });

      if (result.count === 0) {
        return null;
      }

      return tx.quizAttempt.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        }
      });
    });
  }
}
