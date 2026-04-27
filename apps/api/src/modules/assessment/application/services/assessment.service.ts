import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AssignmentStatus,
  EnrollmentStatus,
  Prisma,
  QuizAttemptStatus,
  QuizStatus,
  TeacherAssignmentStatus
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { PrincipalContext } from "@lexora/types";
import type {
  AssessmentRepositoryPort,
  AssignmentListFilters,
  CreateAssignmentInput,
  CreateQuizInput,
  QuizListFilters,
  SubmissionListFilters,
  UpdateAssignmentInput
} from "../ports/assessment.repository.port";
import { ASSESSMENT_AUDIT_EVENTS } from "../../domain/assessment.audit-events";
import { ASSESSMENT_REPOSITORY } from "../../domain/assessment.constants";

type AssignmentRecord = {
  id: string;
  courseOfferingId: string;
  availableFrom: Date | null;
  dueAt: Date | null;
  closeAt: Date | null;
  allowLateSubmission: boolean;
  maxLateMinutes: number | null;
  maxSubmissionCount: number;
};

type EnrollmentRecord = {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  studentUserId: string;
  status: EnrollmentStatus;
};

type QuizRecord = {
  id: string;
  courseOfferingId: string;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  startsAt: Date | null;
  closeAt: Date | null;
};

type QuizAttemptRecord = {
  id: string;
  enrollmentId: string;
  status: QuizAttemptStatus;
};

interface AuditMetadata {
  [key: string]: unknown;
}

@Injectable()
export class AssessmentService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly repository: AssessmentRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  listAssignments(filters: Omit<AssignmentListFilters, "departmentId">) {
    return this.repository.findAssignments({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getAssignment(id: string) {
    const assignment = await this.repository.findAssignmentById(this.getDepartmentId(), id);

    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    return assignment;
  }

  async createAssignment(input: Omit<CreateAssignmentInput, "departmentId">) {
    await this.assertCourseOfferingInDepartment(input.courseOfferingId);
    await this.assertTeacherCanManageOffering(input.courseOfferingId);
    this.assertDateWindow(input.availableFrom, input.dueAt, input.closeAt);

    const assignment = await this.repository.createAssignment({
      departmentId: this.getDepartmentId(),
      status: AssignmentStatus.DRAFT,
      ...input
    });

    await this.writeAudit(ASSESSMENT_AUDIT_EVENTS.ASSIGNMENT_CREATED, "assignment", assignment, {
      courseOfferingId: input.courseOfferingId
    });

    return assignment;
  }

  async updateAssignment(id: string, input: UpdateAssignmentInput) {
    const existing = (await this.repository.findAssignmentById(
      this.getDepartmentId(),
      id
    )) as AssignmentRecord | null;

    if (!existing) {
      throw new NotFoundException("Assignment not found");
    }

    const courseOfferingId = input.courseOfferingId ?? existing.courseOfferingId;
    await this.assertCourseOfferingInDepartment(courseOfferingId);
    await this.assertTeacherCanManageOffering(courseOfferingId);
    this.assertDateWindow(input.availableFrom, input.dueAt, input.closeAt);

    const assignment = await this.repository.updateAssignment(this.getDepartmentId(), id, input);

    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    await this.writeAudit(ASSESSMENT_AUDIT_EVENTS.ASSIGNMENT_UPDATED, "assignment", assignment, {
      updatedFields: Object.keys(input)
    });

    return assignment;
  }

  listSubmissions(filters: Omit<SubmissionListFilters, "departmentId" | "studentUserId">) {
    return this.repository.findSubmissions({
      departmentId: this.getDepartmentId(),
      studentUserId: this.isStudent() ? this.getActorId() : undefined,
      ...filters
    });
  }

  async getSubmission(id: string) {
    const submission = await this.repository.findSubmissionById(this.getDepartmentId(), id);

    if (!submission) {
      throw new NotFoundException("Assignment submission not found");
    }

    await this.assertCanReadEnrollment((submission as { enrollmentId: string }).enrollmentId);
    return submission;
  }

  async createSubmission(input: { assignmentId: string; enrollmentId: string; notes?: string }) {
    const departmentId = this.getDepartmentId();
    const now = new Date();
    const assignment = (await this.repository.findAssignmentById(
      departmentId,
      input.assignmentId
    )) as AssignmentRecord | null;

    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const enrollment = await this.assertEnrollmentForOffering(
      input.enrollmentId,
      assignment.courseOfferingId
    );
    this.assertStudentOwnsEnrollment(enrollment);

    const timing = this.resolveSubmissionTiming(assignment, now);
    const previousAttempts = await this.repository.countSubmissions({
      departmentId,
      assignmentId: assignment.id,
      enrollmentId: enrollment.id
    });
    const attemptNumber = previousAttempts + 1;

    if (attemptNumber > assignment.maxSubmissionCount) {
      throw new ConflictException("Assignment submission attempt limit reached");
    }

    try {
      const submission = await this.repository.createSubmission({
        departmentId,
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        attemptNumber,
        status: timing.isLate ? "LATE" : attemptNumber > 1 ? "RESUBMITTED" : "SUBMITTED",
        submittedAt: now,
        isLate: timing.isLate,
        lateByMinutes: timing.lateByMinutes,
        notes: input.notes
      });

      await this.writeAudit(
        ASSESSMENT_AUDIT_EVENTS.SUBMISSION_CREATED,
        "assignment_submission",
        submission,
        {
          assignmentId: assignment.id,
          enrollmentId: enrollment.id,
          attemptNumber
        }
      );

      return submission;
    } catch (error) {
      this.rethrowKnownError(error, "Assignment submission attempt already exists");
    }
  }

  listQuizzes(filters: Omit<QuizListFilters, "departmentId">) {
    return this.repository.findQuizzes({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getQuiz(id: string) {
    const quiz = await this.repository.findQuizById(this.getDepartmentId(), id);

    if (!quiz) {
      throw new NotFoundException("Quiz not found");
    }

    return quiz;
  }

  async createQuiz(input: Omit<CreateQuizInput, "departmentId">) {
    await this.assertCourseOfferingInDepartment(input.courseOfferingId);
    await this.assertTeacherCanManageOffering(input.courseOfferingId);
    this.assertDateWindow(input.availableFrom, input.dueAt, input.closeAt);

    const quiz = await this.repository.createQuiz({
      departmentId: this.getDepartmentId(),
      status: QuizStatus.DRAFT,
      ...input
    });

    await this.writeAudit(ASSESSMENT_AUDIT_EVENTS.QUIZ_CREATED, "quiz", quiz, {
      courseOfferingId: input.courseOfferingId
    });

    return quiz;
  }

  async startQuizAttempt(input: { quizId: string; enrollmentId: string }) {
    const departmentId = this.getDepartmentId();
    const now = new Date();
    const quiz = (await this.repository.findQuizById(departmentId, input.quizId)) as
      | QuizRecord
      | null;

    if (!quiz) {
      throw new NotFoundException("Quiz not found");
    }

    if (quiz.closeAt && now > quiz.closeAt) {
      throw new BadRequestException("Quiz is closed");
    }

    if (quiz.startsAt && now < quiz.startsAt) {
      throw new BadRequestException("Quiz is not open yet");
    }

    const enrollment = await this.assertEnrollmentForOffering(
      input.enrollmentId,
      quiz.courseOfferingId
    );
    this.assertStudentOwnsEnrollment(enrollment);

    const previousAttempts = await this.repository.countQuizAttempts({
      departmentId,
      quizId: quiz.id,
      enrollmentId: enrollment.id
    });
    const attemptNumber = previousAttempts + 1;

    if (attemptNumber > quiz.maxAttempts) {
      throw new ConflictException("Quiz attempt limit reached");
    }

    try {
      const attempt = await this.repository.createQuizAttempt({
        departmentId,
        courseOfferingId: quiz.courseOfferingId,
        quizId: quiz.id,
        enrollmentId: enrollment.id,
        attemptNumber,
        timeLimitMinutesSnapshot: quiz.timeLimitMinutes ?? undefined
      });

      await this.writeAudit(ASSESSMENT_AUDIT_EVENTS.ATTEMPT_STARTED, "quiz_attempt", attempt, {
        quizId: quiz.id,
        enrollmentId: enrollment.id,
        attemptNumber
      });

      return attempt;
    } catch (error) {
      this.rethrowKnownError(error, "Quiz attempt already exists");
    }
  }

  async submitQuizAttempt(input: { quizAttemptId: string }) {
    const departmentId = this.getDepartmentId();
    const existing = (await this.repository.findQuizAttemptById(
      departmentId,
      input.quizAttemptId
    )) as QuizAttemptRecord | null;

    if (!existing) {
      throw new NotFoundException("Quiz attempt not found");
    }

    await this.assertCanReadEnrollment(existing.enrollmentId);

    if (existing.status !== QuizAttemptStatus.IN_PROGRESS) {
      throw new ConflictException("Quiz attempt is not in progress");
    }

    const attempt = await this.repository.submitQuizAttempt(
      departmentId,
      input.quizAttemptId,
      new Date()
    );

    if (!attempt) {
      throw new ConflictException("Quiz attempt is not in progress");
    }

    await this.writeAudit(ASSESSMENT_AUDIT_EVENTS.ATTEMPT_SUBMITTED, "quiz_attempt", attempt);
    return attempt;
  }

  async getQuizAttempt(id: string) {
    const attempt = await this.repository.findQuizAttemptById(this.getDepartmentId(), id);

    if (!attempt) {
      throw new NotFoundException("Quiz attempt not found");
    }

    await this.assertCanReadEnrollment((attempt as { enrollmentId: string }).enrollmentId);
    return attempt;
  }

  private resolveSubmissionTiming(assignment: AssignmentRecord, now: Date) {
    if (assignment.availableFrom && now < assignment.availableFrom) {
      throw new BadRequestException("Assignment is not open yet");
    }

    if (assignment.closeAt && now > assignment.closeAt) {
      throw new BadRequestException("Assignment is closed");
    }

    if (!assignment.dueAt || now <= assignment.dueAt) {
      return {
        isLate: false,
        lateByMinutes: undefined
      };
    }

    if (!assignment.allowLateSubmission) {
      throw new BadRequestException("Late submissions are not allowed");
    }

    const lateByMinutes = Math.ceil((now.getTime() - assignment.dueAt.getTime()) / 60_000);

    if (assignment.maxLateMinutes !== null && lateByMinutes > assignment.maxLateMinutes) {
      throw new BadRequestException("Late submission window has expired");
    }

    return {
      isLate: true,
      lateByMinutes
    };
  }

  private async assertCourseOfferingInDepartment(courseOfferingId: string) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: {
        id: true
      }
    });

    if (!offering) {
      throw new BadRequestException("Course offering does not belong to the active department");
    }

    return offering;
  }

  private async assertEnrollmentForOffering(enrollmentId: string, courseOfferingId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        archivedAt: null,
        status: EnrollmentStatus.APPROVED
      },
      select: {
        id: true,
        departmentId: true,
        courseOfferingId: true,
        studentUserId: true,
        status: true
      }
    });

    if (!enrollment) {
      throw new BadRequestException("Enrollment does not belong to this course offering");
    }

    return enrollment;
  }

  private async assertCanReadEnrollment(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        departmentId: this.getDepartmentId(),
        archivedAt: null,
        status: EnrollmentStatus.APPROVED
      },
      select: {
        id: true,
        studentUserId: true,
        status: true
      }
    });

    if (!enrollment) {
      throw new NotFoundException("Approved enrollment not found");
    }

    if (this.isStudent() && enrollment.studentUserId !== this.getActorId()) {
      throw new ForbiddenException("Students can only access their own assessment records");
    }
  }

  private assertStudentOwnsEnrollment(enrollment: EnrollmentRecord) {
    if (this.isStudent() && enrollment.studentUserId !== this.getActorId()) {
      throw new ForbiddenException("Students can only submit their own work");
    }
  }

  private async assertTeacherCanManageOffering(courseOfferingId: string) {
    if (this.hasRole("department_admin")) {
      return;
    }

    if (!this.isTeacher()) {
      throw new ForbiddenException("Only assigned teachers can manage this course offering");
    }

    const assignment = await this.prisma.teacherCourseAssignment.findFirst({
      where: {
        departmentId: this.getDepartmentId(),
        courseOfferingId,
        teacherUserId: this.getActorId(),
        status: TeacherAssignmentStatus.ACTIVE,
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

  private assertDateWindow(start?: Date, due?: Date, close?: Date) {
    if (start && due && start > due) {
      throw new BadRequestException("Available date must be before due date");
    }

    if (due && close && due > close) {
      throw new BadRequestException("Due date must be before close date");
    }
  }

  private isTeacher() {
    return this.hasRole("teacher");
  }

  private isStudent() {
    return this.hasRole("student");
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
