import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** Public Examination/Committee projection for candidate registration and Comprehensive.
 * No calculated Summative marks are exposed. The caller owns a serializable transaction.
 * Lock order: Examination -> committee -> appointments -> identity/permission -> workflow.
 */
@Injectable()
export class ExaminationContextService {
  async lock(tx: Prisma.TransactionClient, departmentId: string, examinationId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM examinations WHERE id=${examinationId} AND department_id=${departmentId}
      AND archived_at IS NULL FOR UPDATE`);
    if (rows.length !== 1) throw new NotFoundException("Examination not found");
    return tx.examination.findFirstOrThrow({ where: { id: examinationId, departmentId } });
  }

  async committee(tx: Prisma.TransactionClient, departmentId: string, examinationId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM examination_committees WHERE examination_id=${examinationId}
      AND department_id=${departmentId} AND archived_at IS NULL FOR SHARE`);
    if (rows.length !== 1) throw new NotFoundException("Examination Committee not found");
    const committeeId = rows[0]!.id;
    // Lock all historical rows too, preventing an appointment from changing while sources are evaluated.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM examination_committee_assignments
      WHERE committee_id=${committeeId} AND department_id=${departmentId} ORDER BY id FOR SHARE`);
    const now = new Date();
    const assignments = await tx.examinationCommitteeAssignment.findMany({ where: {
      departmentId, examinationId, committeeId, status: "ACTIVE", assignedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], unassignedAt: null, archivedAt: null,
    }, orderBy: { seat: "asc" } });
    return { committeeId, assignments };
  }

  async applicableCourses(tx: Prisma.TransactionClient, departmentId: string, examinationId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM examination_courses WHERE examination_id=${examinationId}
      AND department_id=${departmentId} ORDER BY id FOR SHARE`);
    const courses = await tx.examinationCourse.findMany({ where: { examinationId, departmentId, archivedAt: null },
      include: { assessmentTemplate: { include: { components: true } }, courseOffering: true,
        curriculumCourse: true, syllabusVersion: true }, orderBy: { id: "asc" } });
    const applicable = [];
    for (const course of courses) {
      const component = course.assessmentTemplate.components.find((c) => c.code === "COMPREHENSIVE_EXAMINATION");
      if (!component) continue;
      if (component.departmentId !== departmentId || component.maximumMarks.lte(0) || course.assessmentTemplate.archivedAt ||
        course.courseOffering.archivedAt || ["ARCHIVED", "CANCELED"].includes(course.courseOffering.status) || course.syllabusVersion.archivedAt) {
        throw new BadRequestException("Applicable course configuration is unavailable");
      }
      await tx.$queryRaw(Prisma.sql`SELECT t.id FROM course_assessment_templates t
        JOIN assessment_template_components c ON c.assessment_template_id=t.id
        WHERE t.id=${course.assessmentTemplateId} AND c.id=${component.id} FOR SHARE OF t,c`);
      applicable.push({ course, component });
    }
    if (!applicable.length) throw new BadRequestException("No Comprehensive-applicable examination courses");
    return applicable;
  }
}
