import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** Exported academic read/lock boundary for the Attendance /5 aggregate. */
@Injectable()
export class AttendanceAcademicContextService {
  async lock(tx: Prisma.TransactionClient, departmentId: string, actorUserId: string, courseOfferingId: string, enrollmentId: string) {
    const offerings = await tx.$queryRaw<Array<{ studentBatchId: string; academicTermId: string }>>(Prisma.sql`
      SELECT student_batch_id AS "studentBatchId", academic_term_id AS "academicTermId"
      FROM course_offerings WHERE id = ${courseOfferingId} AND department_id = ${departmentId}
      AND archived_at IS NULL AND status NOT IN ('CANCELED','ARCHIVED') AND student_batch_id IS NOT NULL FOR UPDATE
    `);
    const offering = offerings[0];
    if (!offering) throw new NotFoundException("Attendance scope not found");
    const assignments = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a.id FROM batch_coordinator_assignments a
      JOIN departments d ON d.id = a.department_id
      JOIN users u ON u.id = a.coordinator_user_id AND u.department_id = d.id
      JOIN student_batches b ON b.id = a.student_batch_id AND b.department_id = d.id
      JOIN academic_terms t ON t.id = a.academic_term_id AND t.department_id = d.id
      JOIN academic_programs p ON p.id = b.academic_program_id AND p.department_id = d.id
      JOIN academic_sessions s ON s.id = b.academic_session_id AND s.department_id = d.id
      WHERE a.department_id = ${departmentId} AND a.coordinator_user_id = ${actorUserId}
        AND a.student_batch_id = ${offering.studentBatchId} AND a.academic_term_id = ${offering.academicTermId}
        AND a.status = 'ACTIVE' AND a.assigned_at <= clock_timestamp()
        AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp()) AND a.unassigned_at IS NULL AND a.archived_at IS NULL
        AND d.status = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
        AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
        AND b.archived_at IS NULL AND t.archived_at IS NULL AND p.archived_at IS NULL AND s.archived_at IS NULL
      FOR SHARE OF a, d, u, b, t, p, s
    `);
    if (assignments.length !== 1) throw new NotFoundException("Attendance scope not found");
    const enrollments = await tx.$queryRaw<Array<{ studentUserId: string }>>(Prisma.sql`
      SELECT student_user_id AS "studentUserId" FROM enrollments
      WHERE id = ${enrollmentId} AND department_id = ${departmentId} AND course_offering_id = ${courseOfferingId}
      AND academic_term_id = ${offering.academicTermId} AND status = 'APPROVED' AND archived_at IS NULL AND dropped_at IS NULL FOR SHARE
    `);
    if (enrollments.length !== 1) throw new NotFoundException("Attendance scope not found");
    const components = await tx.$queryRaw<Array<{ templateId: string; version: number; code: string; maximum: Prisma.Decimal; total: Prisma.Decimal; required: boolean }>>(Prisma.sql`
      SELECT t.id AS "templateId", t.version_number AS version, c.code, c.maximum_marks AS maximum,
        t.total_marks AS total, c.is_required AS required
      FROM course_offerings o JOIN curriculum_courses cc ON cc.id = o.curriculum_course_id AND cc.department_id = o.department_id AND cc.course_id = o.course_id
      JOIN course_assessment_templates t ON t.id = cc.assessment_template_id AND t.department_id = cc.department_id
      JOIN assessment_template_components c ON c.assessment_template_id = t.id AND c.department_id = t.department_id
      WHERE o.id = ${courseOfferingId} AND o.department_id = ${departmentId} AND t.archived_at IS NULL
      ORDER BY c.code FOR SHARE OF cc, t, c
    `);
    const expected: Record<string, string> = { FORMATIVE_ACTIVITIES: "30", ATTENDANCE: "5", COMPREHENSIVE_EXAMINATION: "5", SUMMATIVE_EXAMINATION: "60" };
    if (components.length !== 4 || components.some((c) => !c.required || !expected[c.code] || !c.maximum.eq(expected[c.code]!) || !c.total.eq(100))) {
      throw new BadRequestException("A bound standard 30/5/5/60 assessment template is required");
    }
    return { departmentId, actorUserId, courseOfferingId, enrollmentId, ...offering,
      studentUserId: enrollments[0]!.studentUserId, coordinatorAssignmentId: assignments[0]!.id,
      configurationJson: JSON.parse(JSON.stringify(components)) as Prisma.InputJsonValue };
  }
}
