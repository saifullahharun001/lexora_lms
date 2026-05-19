import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AttendanceImportBatchStatus,
  AttendanceRecordStatus,
  AttendanceSourceType,
  ClassSessionStatus,
  Prisma,
  TeacherAssignmentStatus
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { AttendanceImportBatchRecord, AttendanceRecordEntry } from "../../contracts/attendance.contracts";
import { ATTENDANCE_AUDIT_EVENTS } from "../../domain/attendance.audit-events";
import { ATTENDANCE_REPOSITORY } from "../../domain/attendance.constants";
import type {
  AttendanceImportBatchListFilters,
  AttendanceRecordListFilters,
  AttendanceRepositoryPort,
  CreateAttendanceImportBatchInput,
  SaveAttendanceRecordInput
} from "../ports/attendance.repository.port";

interface AuditMetadata {
  [key: string]: unknown;
}

type SessionForAttendance = {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  status: ClassSessionStatus;
};

type EnrollmentForAttendance = {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  studentUserId: string;
};

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  async createImportBatch(input: Omit<CreateAttendanceImportBatchInput, "departmentId" | "uploadedByUserId">) {
    const departmentId = this.getDepartmentId();
    let courseOfferingId = input.courseOfferingId ?? null;

    if (input.classSessionId) {
      const session = await this.assertClassSessionInDepartment(input.classSessionId);

      if (courseOfferingId && courseOfferingId !== session.courseOfferingId) {
        throw new BadRequestException("Import batch course offering must match class session");
      }

      courseOfferingId = session.courseOfferingId;
    }

    if (courseOfferingId) {
      await this.assertCourseOfferingInDepartment(courseOfferingId);
    }

    this.assertDateWindow(input.importWindowStartAt, input.importWindowEndAt);
    this.assertNoBiometricPayload(input.validationSummaryJson);

    const batch = await this.repository.saveImportBatch({
      departmentId,
      uploadedByUserId: this.getActorId(),
      ...input,
      courseOfferingId
    });

    await this.writeAudit(ATTENDANCE_AUDIT_EVENTS.IMPORT_BATCH_RECEIVED, "attendance_import_batch", batch, {
      courseOfferingId,
      classSessionId: input.classSessionId ?? null,
      sourceType: input.sourceType
    });

    return batch;
  }

  listImportBatches(filters: Omit<AttendanceImportBatchListFilters, "departmentId">) {
    this.assertNotStudentBroadEndpoint();

    return this.repository.findImportBatches({
      departmentId: this.getDepartmentId(),
      ...filters,
      ...(this.shouldConstrainToTeacher() ? { assignedTeacherUserId: this.getActorId() } : {})
    });
  }

  async getImportBatch(id: string) {
    this.assertNotStudentBroadEndpoint();
    const batch = await this.findVisibleImportBatch(id);

    if (!batch) {
      throw new NotFoundException("Attendance import batch not found");
    }

    return batch;
  }

  async cancelImportBatch(id: string) {
    const current = await this.repository.findImportBatchById(this.getDepartmentId(), id);

    if (!current) {
      throw new NotFoundException("Attendance import batch not found");
    }

    if (
      current.status !== AttendanceImportBatchStatus.RECEIVED &&
      current.status !== AttendanceImportBatchStatus.VALIDATING
    ) {
      throw new BadRequestException("Only received or validating import batches can be canceled");
    }

    const batch = await this.repository.cancelImportBatch(this.getDepartmentId(), id, this.getActorId());

    if (!batch) {
      throw new BadRequestException("Attendance import batch cannot be canceled");
    }

    await this.writeAudit(ATTENDANCE_AUDIT_EVENTS.IMPORT_BATCH_CANCELED, "attendance_import_batch", batch, {
      previousStatus: current.status,
      status: AttendanceImportBatchStatus.CANCELED
    });

    return batch;
  }

  async captureAttendance(input: Omit<SaveAttendanceRecordInput, "departmentId" | "markedByUserId">) {
    this.assertTeacherCapturePrincipal();
    this.assertNotStudentSelfMarking(input.studentUserId);
    const session = await this.assertClassSessionInDepartment(input.classSessionId);
    const enrollment = await this.assertEnrollmentInDepartment(input.enrollmentId);

    await this.assertTeacherCanUseOffering(session.courseOfferingId);
    this.assertRecordMatchesEnrollmentAndSession(input, session, enrollment);
    this.assertNoBiometricPayload(input.sourcePayloadJson);

    if (session.status !== ClassSessionStatus.ACTIVE) {
      throw new BadRequestException("Attendance can only be captured for active class sessions");
    }

    const record = await this.repository.saveAttendanceRecord({
      departmentId: this.getDepartmentId(),
      markedByUserId: this.getActorId(),
      ...input
    });

    await this.writeAudit(ATTENDANCE_AUDIT_EVENTS.RECORD_CAPTURED, "attendance_record", record, {
      classSessionId: input.classSessionId,
      enrollmentId: input.enrollmentId,
      sourceType: input.sourceType
    });

    return record;
  }

  listAttendanceRecords(filters: Omit<AttendanceRecordListFilters, "departmentId">) {
    this.assertNotStudentBroadEndpoint();

    return this.repository.findAttendanceRecords({
      departmentId: this.getDepartmentId(),
      ...filters,
      ...(this.shouldConstrainToTeacher() ? { assignedTeacherUserId: this.getActorId() } : {})
    });
  }

  async getAttendanceRecord(id: string) {
    this.assertNotStudentBroadEndpoint();
    const record = await this.findVisibleAttendanceRecord(id);

    if (!record) {
      throw new NotFoundException("Attendance record not found");
    }

    return record;
  }

  listMyAttendanceRecords(filters: Omit<AttendanceRecordListFilters, "departmentId" | "studentUserId" | "sourceType" | "enrollmentId">) {
    if (!this.hasRole("student")) {
      throw new ForbiddenException("Student attendance endpoint is only available to students");
    }

    return this.repository.findAttendanceRecords({
      departmentId: this.getDepartmentId(),
      studentUserId: this.getActorId(),
      ...filters
    });
  }

  async overrideAttendance(id: string, input: { status: AttendanceRecordStatus; overrideReason: string }) {
    if (!input.overrideReason.trim()) {
      throw new BadRequestException("overrideReason is required");
    }

    const existing = await this.repository.findAttendanceRecordById(this.getDepartmentId(), id);

    if (!existing) {
      throw new NotFoundException("Attendance record not found");
    }

    const record = await this.repository.overrideAttendanceRecord(this.getDepartmentId(), id, {
      status: input.status,
      sourceType: AttendanceSourceType.MANUAL,
      overrideByUserId: this.getActorId(),
      overrideReason: input.overrideReason
    });

    if (!record) {
      throw new NotFoundException("Attendance record not found");
    }

    await this.writeAudit(ATTENDANCE_AUDIT_EVENTS.RECORD_OVERRIDDEN, "attendance_record", record, {
      previousStatus: existing.status,
      status: input.status,
      previousSourceType: existing.sourceType,
      sourceType: AttendanceSourceType.MANUAL,
      overrideReason: input.overrideReason
    });

    return record;
  }

  private findVisibleImportBatch(id: string) {
    return this.repository.findImportBatchById(
      this.getDepartmentId(),
      id,
      this.shouldConstrainToTeacher() ? this.getActorId() : undefined
    );
  }

  private findVisibleAttendanceRecord(id: string) {
    return this.repository.findAttendanceRecordById(
      this.getDepartmentId(),
      id,
      this.shouldConstrainToTeacher() ? this.getActorId() : undefined
    );
  }

  private async assertClassSessionInDepartment(classSessionId: string) {
    const session = await this.prisma.classSession.findFirst({
      where: {
        id: classSessionId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: {
        id: true,
        departmentId: true,
        courseOfferingId: true,
        status: true
      }
    });

    if (!session) {
      throw new NotFoundException("Class session not found");
    }

    return session as SessionForAttendance;
  }

  private async assertEnrollmentInDepartment(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: {
        id: true,
        departmentId: true,
        courseOfferingId: true,
        studentUserId: true
      }
    });

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment as EnrollmentForAttendance;
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

  private assertRecordMatchesEnrollmentAndSession(
    input: Pick<SaveAttendanceRecordInput, "studentUserId">,
    session: SessionForAttendance,
    enrollment: EnrollmentForAttendance
  ) {
    if (enrollment.courseOfferingId !== session.courseOfferingId) {
      throw new BadRequestException("Enrollment must belong to the class session course offering");
    }

    if (input.studentUserId !== enrollment.studentUserId) {
      throw new BadRequestException("studentUserId must match the enrollment student");
    }
  }

  private async assertTeacherCanUseOffering(courseOfferingId: string) {
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

  private assertTeacherCapturePrincipal() {
    if (!this.hasRole("teacher") || this.hasRole("department_admin")) {
      throw new ForbiddenException("Only assigned teachers can capture attendance");
    }
  }

  private assertDateWindow(startAt?: Date | null, endAt?: Date | null) {
    if (startAt && endAt && endAt <= startAt) {
      throw new BadRequestException("importWindowEndAt must be after importWindowStartAt");
    }
  }

  private assertNoBiometricPayload(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    const forbiddenFragments = [
      "fingerprint",
      "finger_print",
      "biometrictemplate",
      "biometric_template",
      "fingertemplate",
      "finger_template",
      "minutiae",
      "template"
    ];

    const stack: unknown[] = [value];

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current || typeof current !== "object") {
        continue;
      }

      for (const [key, childValue] of Object.entries(current)) {
        const normalizedKey = key.replaceAll(/[^a-zA-Z0-9_]/g, "").toLowerCase();

        if (forbiddenFragments.some((fragment) => normalizedKey.includes(fragment))) {
          throw new BadRequestException(
            "Attendance payloads must not include fingerprint or biometric template data"
          );
        }

        if (childValue && typeof childValue === "object") {
          stack.push(childValue);
        }
      }
    }
  }

  private assertNotStudentBroadEndpoint() {
    if (this.hasRole("student") && !this.hasRole("department_admin") && !this.hasRole("teacher")) {
      throw new ForbiddenException("Students must use the attendance self endpoint");
    }
  }

  private assertNotStudentSelfMarking(studentUserId: string) {
    if (this.hasRole("student") || this.getActorId() === studentUserId) {
      throw new ForbiddenException("Students cannot mark their own attendance");
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
    targetType: string,
    target: AttendanceImportBatchRecord | AttendanceRecordEntry,
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
        targetId: target.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
