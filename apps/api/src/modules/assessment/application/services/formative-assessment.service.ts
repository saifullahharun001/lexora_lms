import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { FORMATIVE_POLICIES } from "../../domain/formative.policy-names";
import { FORMATIVE_AUDIT_EVENTS } from "../../domain/formative.audit-events";
import { deriveTeacherSubmission, formativeDecimal, FORMATIVE_METHODS, weightedMark } from "../../domain/formative.rules";

export interface ActivityInput {
  title: string;
  method: string;
  rawMaximum: string;
  assignedWeight: string;
}

export interface MarkInput {
  rawMark: string | null;
  feedback?: string;
  feedbackCompleted: boolean;
  integrityStatus: "CLEAR" | "PENDING_REVIEW" | "BLOCKED";
}

interface Authority {
  departmentId: string;
  actorUserId: string;
  teacherAssignmentId: string;
  assignmentAssignedAt: Date;
  configuration: Prisma.InputJsonObject;
}

@Injectable()
export class FormativeAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  createActivity(courseOfferingId: string, input: ActivityInput) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.MANAGE, async (tx, authority) => {
      await this.assertSchemeEditable(tx, authority.departmentId, courseOfferingId);
      const activity = await tx.formativeActivity.create({ data: {
        ...this.activityData(input), departmentId: authority.departmentId, courseOfferingId,
      } });
      await this.audit(tx, authority, FORMATIVE_AUDIT_EVENTS.ACTIVITY_CREATED, activity.id);
      return activity;
    });
  }

  updateActivity(courseOfferingId: string, activityId: string, input: ActivityInput) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.MANAGE, async (tx, authority) => {
      const activity = await this.activity(tx, authority.departmentId, courseOfferingId, activityId);
      await this.assertSchemeEditable(tx, authority.departmentId, courseOfferingId);
      if (activity.status !== "DRAFT") throw new ConflictException("Only draft activities can be edited");
      const revised = await tx.formativeActivity.update({ where: { id: activity.id }, data: {
        ...this.activityData(input), version: { increment: 1 },
      } });
      await this.audit(tx, authority, FORMATIVE_AUDIT_EVENTS.ACTIVITY_UPDATED, activity.id, { previousVersion: activity.version, version: revised.version });
      return revised;
    });
  }

  startMarking(courseOfferingId: string, activityId: string) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.MANAGE, async (tx, authority) => {
      const activity = await this.activity(tx, authority.departmentId, courseOfferingId, activityId);
      await this.assertSchemeEditable(tx, authority.departmentId, courseOfferingId);
      if (activity.status !== "DRAFT") throw new ConflictException("Activity is already in marking");
      const revised = await tx.formativeActivity.update({ where: { id: activity.id }, data: {
        status: "MARKING", version: { increment: 1 },
      } });
      await this.audit(tx, authority, FORMATIVE_AUDIT_EVENTS.ACTIVITY_MARKING_STARTED, activity.id);
      return revised;
    });
  }

  read(courseOfferingId: string, enrollmentId: string) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.READ, async (tx, authority) => {
      await this.enrollment(tx, authority.departmentId, courseOfferingId, enrollmentId);
      const where = { departmentId: authority.departmentId, courseOfferingId, enrollmentId };
      return {
        activities: await tx.formativeActivity.findMany({ where: { departmentId: authority.departmentId, courseOfferingId }, orderBy: { id: "asc" } }),
        markHistory: await tx.formativeMarkEvidence.findMany({ where, orderBy: [{ activityId: "asc" }, { revision: "asc" }] }),
        submission: await tx.formativeTeacherSubmission.findFirst({ where, include: { items: true } }),
      };
    });
  }

  listActivities(courseOfferingId: string) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.READ, (tx, authority) =>
      tx.formativeActivity.findMany({ where: { departmentId: authority.departmentId, courseOfferingId }, orderBy: { id: "asc" } }));
  }

  saveMark(courseOfferingId: string, activityId: string, enrollmentId: string, input: MarkInput) {
    return this.writeMark(courseOfferingId, activityId, enrollmentId, input);
  }

  adjustMark(courseOfferingId: string, activityId: string, enrollmentId: string, input: MarkInput & { reason: string }) {
    const reason = input.reason?.trim();
    if (!reason || reason.length > 2000) throw new BadRequestException("An adjustment reason of at most 2000 characters is required");
    return this.writeMark(courseOfferingId, activityId, enrollmentId, input, reason);
  }

  private writeMark(courseOfferingId: string, activityId: string, enrollmentId: string, input: MarkInput, reason?: string) {
    return this.withOffering(courseOfferingId, reason ? FORMATIVE_POLICIES.ADJUST : FORMATIVE_POLICIES.MANAGE, async (tx, authority) => {
      const { departmentId } = authority;
      const activity = await this.activity(tx, departmentId, courseOfferingId, activityId);
      await this.enrollment(tx, departmentId, courseOfferingId, enrollmentId);
      await this.assertNotSubmitted(tx, departmentId, courseOfferingId, enrollmentId);
      if (activity.status !== "MARKING") throw new ConflictException("Activity is not in marking");
      if (!["CLEAR", "PENDING_REVIEW", "BLOCKED"].includes(input.integrityStatus) || typeof input.feedbackCompleted !== "boolean") {
        throw new BadRequestException("Invalid mark evidence");
      }
      const feedback = input.feedback?.trim() || null;
      if ((feedback?.length ?? 0) > 10000 || (input.feedbackCompleted && !feedback)) {
        throw new BadRequestException("Completed feedback requires written feedback evidence");
      }
      const rawMark = input.rawMark === null ? null : formativeDecimal(input.rawMark);
      const derived = rawMark === null ? null : weightedMark(rawMark, activity.rawMaximum, activity.assignedWeight);
      const previous = await tx.formativeMarkEvidence.findFirst({
        where: { departmentId, courseOfferingId, enrollmentId, activityId }, orderBy: { revision: "desc" },
      });
      if (reason && !previous) throw new BadRequestException("An existing mark is required for adjustment");
      if (previous && previous.integrityStatus !== "CLEAR" && input.integrityStatus === "CLEAR") {
        throw new ForbiddenException("Resolution authority for recorded integrity cases is not implemented");
      }
      // Missing -> first entered mark is ordinary entry. Revising any entered value requires exact adjustment permission.
      if (previous?.rawMark !== null && previous?.rawMark !== undefined &&
          (rawMark === null || !previous.rawMark.eq(rawMark)) && !reason) {
        throw new ForbiddenException("Use the explicitly authorised adjustment endpoint to revise a mark");
      }
      const evidence = await tx.formativeMarkEvidence.create({ data: {
        departmentId, courseOfferingId, enrollmentId, activityId,
        revision: (previous?.revision ?? 0) + 1, previousId: previous?.id,
        rawMaximum: activity.rawMaximum, assignedWeight: activity.assignedWeight,
        rawMark, weightedMark: derived, feedback, feedbackCompleted: input.feedbackCompleted,
        integrityStatus: input.integrityStatus, reason, actorUserId: authority.actorUserId,
        teacherAssignmentId: authority.teacherAssignmentId, assignmentAssignedAt: authority.assignmentAssignedAt,
      } });
      await this.audit(tx, authority, reason ? FORMATIVE_AUDIT_EVENTS.MARK_ADJUSTED : FORMATIVE_AUDIT_EVENTS.MARK_RECORDED, evidence.id, {
        previousEvidenceId: previous?.id ?? null, revision: evidence.revision,
      });
      return evidence;
    });
  }

  submit(courseOfferingId: string, enrollmentId: string) {
    return this.withOffering(courseOfferingId, FORMATIVE_POLICIES.SUBMIT, async (tx, authority) => {
      const { departmentId } = authority;
      await this.enrollment(tx, departmentId, courseOfferingId, enrollmentId);
      await this.assertNotSubmitted(tx, departmentId, courseOfferingId, enrollmentId);
      const activities = await tx.formativeActivity.findMany({
        where: { departmentId, courseOfferingId }, orderBy: { id: "asc" },
        include: { marks: { where: { departmentId, courseOfferingId, enrollmentId }, orderBy: { revision: "desc" }, take: 1 } },
      });
      const derived = deriveTeacherSubmission(activities.map((activity) => ({
        activityId: activity.id, status: activity.status, rawMaximum: activity.rawMaximum,
        assignedWeight: activity.assignedWeight, mark: activity.marks[0] ?? null,
      })));
      const snapshot = activities.map((activity) => {
        const mark = activity.marks[0]!;
        return {
          activityId: activity.id, activityVersion: activity.version, title: activity.title, method: activity.method,
          rawMaximum: activity.rawMaximum.toFixed(2), assignedWeight: activity.assignedWeight.toFixed(2),
          markEvidenceId: mark.id, markRevision: mark.revision, rawMark: mark.rawMark!.toFixed(2),
          weightedMark: mark.weightedMark!.toFixed(2), feedback: mark.feedback,
          feedbackCompleted: mark.feedbackCompleted, integrityStatus: mark.integrityStatus,
        };
      });
      const submission = await tx.formativeTeacherSubmission.create({ data: {
        departmentId, courseOfferingId, enrollmentId, totalWeightedMark: derived.total,
        totalWeight: derived.weights, ruleVersionCode: derived.ruleVersionCode,
        sourceSnapshotJson: { configuration: authority.configuration, activities: snapshot }, actorUserId: authority.actorUserId,
        teacherAssignmentId: authority.teacherAssignmentId, assignmentAssignedAt: authority.assignmentAssignedAt,
      } });
      await tx.formativeSubmissionItem.createMany({ data: snapshot.map((source) => ({
        departmentId, courseOfferingId, enrollmentId, submissionId: submission.id,
        activityId: source.activityId, markEvidenceId: source.markEvidenceId,
      })) });
      await this.audit(tx, authority, FORMATIVE_AUDIT_EVENTS.ACTIVITIES_TEACHER_SUBMITTED, submission.id, {
        enrollmentId, ruleVersionCode: derived.ruleVersionCode, total: derived.total.toFixed(2),
      });
      return submission;
    });
  }

  private activityData(input: ActivityInput) {
    if (!input.title?.trim() || input.title.trim().length > 255 ||
        !(FORMATIVE_METHODS as readonly string[]).includes(input.method)) throw new BadRequestException("Invalid activity");
    const rawMaximum = formativeDecimal(input.rawMaximum);
    const assignedWeight = formativeDecimal(input.assignedWeight);
    weightedMark("0", rawMaximum, assignedWeight);
    return { title: input.title.trim(), method: input.method, rawMaximum, assignedWeight };
  }

  private async activity(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string, id: string) {
    const activity = await tx.formativeActivity.findFirst({ where: { id, departmentId, courseOfferingId } });
    if (!activity) throw new NotFoundException("Formative activity not found");
    return activity;
  }

  private async enrollment(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string, id: string) {
    const enrollments = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM enrollments WHERE id = ${id} AND department_id = ${departmentId}
      AND course_offering_id = ${courseOfferingId} AND status = 'APPROVED' AND archived_at IS NULL FOR SHARE
    `);
    if (enrollments.length !== 1) throw new NotFoundException("Approved enrollment not found");
    return enrollments[0]!;
  }

  private async assertSchemeEditable(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string) {
    if (await tx.formativeTeacherSubmission.findFirst({ where: { departmentId, courseOfferingId } })) {
      throw new ConflictException("Activity configuration is frozen after the first Teacher submission");
    }
  }

  private async assertNotSubmitted(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string, enrollmentId: string) {
    if (await tx.formativeTeacherSubmission.findFirst({ where: { departmentId, courseOfferingId, enrollmentId } })) {
      throw new ConflictException("Activities have already been submitted; correction authority is not implemented");
    }
  }

  private async withOffering<T>(courseOfferingId: string, policy: string, work: (tx: Prisma.TransactionClient, authority: Authority) => Promise<T>): Promise<T> {
    const principal = this.context.get()?.principal;
    const departmentId = principal?.activeDepartmentId;
    if (!principal?.isAuthenticated || principal.actorType !== "user" || !principal.actorId || !departmentId ||
        !this.authorization.isAllowed(principal, policy)) throw new ForbiddenException("Formative access denied");
    const role = principal.roleAssignments.find((assignment) => assignment.role === "teacher" &&
      assignment.departmentId === departmentId && assignment.userRoleId && assignment.roleId);
    if (!role || principal.roleAssignments.some((assignment) => assignment.role === "student" && assignment.departmentId === departmentId)) {
      throw new ForbiddenException("Assigned Course Teacher authority is required");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        // One offering mutex orders activity configuration, revisions and submissions.
        const offerings = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM course_offerings WHERE id = ${courseOfferingId} AND department_id = ${departmentId}
          AND archived_at IS NULL AND status NOT IN ('CANCELED', 'ARCHIVED') FOR UPDATE
        `);
        if (offerings.length !== 1) throw new NotFoundException("Course offering not found");
        const authorities = await tx.$queryRaw<Array<{ id: string; assignedAt: Date }>>(Prisma.sql`
          SELECT a.id, a.assigned_at AS "assignedAt" FROM teacher_course_assignments a
          JOIN users u ON u.id = a.teacher_user_id AND u.department_id = a.department_id
          JOIN departments d ON d.id = a.department_id
          JOIN user_roles ur ON ur.user_id = u.id AND ur.department_id = a.department_id
          JOIN roles r ON r.id = ur.role_id AND r.department_id = a.department_id
          WHERE a.department_id = ${departmentId} AND a.course_offering_id = ${courseOfferingId}
          AND a.teacher_user_id = ${principal.actorId} AND a.status = 'ACTIVE'
          AND a.assigned_at <= CURRENT_TIMESTAMP AND a.unassigned_at IS NULL AND a.archived_at IS NULL
          AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
          AND d.status = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
          AND ur.id = ${role.userRoleId!} AND r.id = ${role.roleId!} AND r.code = 'teacher'
          AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
          AND r.archived_at IS NULL ORDER BY a.id LIMIT 1 FOR SHARE OF a, u, d, ur, r
        `);
        const assignment = authorities[0];
        if (!assignment) throw new NotFoundException("Assigned course offering not found");
        if (policy === FORMATIVE_POLICIES.ADJUST) {
          const permissions = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT p.id FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role_id = ${role.roleId!} AND p.resource = 'formative.mark'
            AND p.action = 'adjust' AND p.scope = 'DEPARTMENT' FOR SHARE OF p, rp
          `);
          if (!permissions.length) throw new ForbiddenException("Exact formative adjustment permission is required");
        }
        const configuration = policy === FORMATIVE_POLICIES.READ ? {} : await this.standardConfiguration(tx, departmentId, courseOfferingId);
        return work(tx, { departmentId, actorUserId: principal.actorId, teacherAssignmentId: assignment.id, assignmentAssignedAt: assignment.assignedAt, configuration });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new ConflictException("Concurrent or duplicate formative operation; reload before retrying");
      }
      throw error;
    }
  }

  private async standardConfiguration(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string): Promise<Prisma.InputJsonObject> {
    const components = await tx.$queryRaw<Array<{
      templateId: string; templateVersion: number; componentId: string; code: string;
      maximumMarks: Prisma.Decimal; totalMarks: Prisma.Decimal; isRequired: boolean;
    }>>(Prisma.sql`
      SELECT t.id AS "templateId", t.version_number AS "templateVersion", c.id AS "componentId",
        c.code, c.maximum_marks AS "maximumMarks", t.total_marks AS "totalMarks", c.is_required AS "isRequired"
      FROM course_offerings o JOIN curriculum_courses cc ON cc.id = o.curriculum_course_id AND cc.department_id = o.department_id AND cc.course_id = o.course_id
      JOIN course_assessment_templates t ON t.id = cc.assessment_template_id AND t.department_id = cc.department_id
      JOIN assessment_template_components c ON c.assessment_template_id = t.id AND c.department_id = t.department_id
      WHERE o.id = ${courseOfferingId} AND o.department_id = ${departmentId}
        AND t.archived_at IS NULL ORDER BY c.code FOR SHARE OF cc, t, c
    `);
    const expected: Record<string, string> = { FORMATIVE_ACTIVITIES: "30", ATTENDANCE: "5", COMPREHENSIVE_EXAMINATION: "5", SUMMATIVE_EXAMINATION: "60" };
    if (components.length !== 4 || components.some((component) => !component.isRequired || !expected[component.code] ||
      !component.maximumMarks.eq(expected[component.code]!) || !component.totalMarks.eq(100))) {
      throw new BadRequestException("A bound standard 30/5/5/60 assessment template is required");
    }
    return { templateId: components[0]!.templateId, templateVersion: components[0]!.templateVersion,
      components: components.map((component) => ({ id: component.componentId, code: component.code, maximum: component.maximumMarks.toFixed(2) })) };
  }

  private async audit(tx: Prisma.TransactionClient, authority: Authority, action: string, targetId: string, metadata: Prisma.InputJsonObject = {}) {
    const context = this.context.get();
    await tx.auditLog.create({ data: {
      departmentId: authority.departmentId, actorUserId: authority.actorUserId, actorType: "USER",
      requestId: context?.requestId, action, targetType: "formative", targetId, outcome: "SUCCESS",
      contextJson: { ...metadata, teacherAssignmentId: authority.teacherAssignmentId },
    } });
  }
}
