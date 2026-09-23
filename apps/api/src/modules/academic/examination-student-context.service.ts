import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** Public, transaction-scoped academic consistency projection. It never determines candidate category. */
@Injectable()
export class ExaminationStudentContextService {
  async validate(tx: Prisma.TransactionClient, departmentId: string, examinationId: string,
    academicProgramId: string, academicTermId: string, studentUserId: string, curriculumAssignmentId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT s.id FROM student_curriculum_assignments s JOIN users u ON u.id=s.student_user_id
      JOIN curriculum_versions cv ON cv.id=s.curriculum_version_id AND cv.department_id=s.department_id
      JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=u.department_id
      JOIN roles r ON r.id=ur.role_id AND r.department_id=ur.department_id
      WHERE s.id=${curriculumAssignmentId} AND s.department_id=${departmentId} AND s.student_user_id=${studentUserId}
      AND s.academic_program_id=${academicProgramId} AND cv.academic_program_id=${academicProgramId}
      AND cv.archived_at IS NULL AND u.department_id=${departmentId} AND u.status='ACTIVE'
      AND u.archived_at IS NULL AND u.deleted_at IS NULL AND r.code='student' AND r.archived_at IS NULL
      AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp())
      FOR SHARE OF s,u,cv,ur,r`);
    if (!rows.length) throw new NotFoundException("Eligible examination student not found");
    const courses = await tx.$queryRaw<Array<{ examinationCourseId: string; enrollmentId: string }>>(Prisma.sql`
      SELECT ec.id AS "examinationCourseId", e.id AS "enrollmentId"
      FROM enrollments e JOIN examination_courses ec ON ec.course_offering_id=e.course_offering_id
       AND ec.department_id=e.department_id AND ec.curriculum_course_id=e.curriculum_course_id
      JOIN student_curriculum_assignments s ON s.id=e.student_curriculum_assignment_id
       AND s.curriculum_version_id=ec.curriculum_version_id AND s.student_user_id=e.student_user_id
      JOIN course_offerings o ON o.id=e.course_offering_id AND o.department_id=e.department_id
      WHERE ec.examination_id=${examinationId} AND e.department_id=${departmentId} AND e.student_user_id=${studentUserId}
      AND e.student_curriculum_assignment_id=${curriculumAssignmentId} AND e.academic_term_id=${academicTermId}
      AND ec.academic_term_id=${academicTermId} AND ec.academic_program_id=${academicProgramId}
      AND e.status='APPROVED' AND e.enrolled_at IS NOT NULL AND e.dropped_at IS NULL AND e.archived_at IS NULL
      AND ec.archived_at IS NULL AND o.archived_at IS NULL AND o.status NOT IN ('ARCHIVED','CANCELED')
      ORDER BY ec.id FOR SHARE OF e,ec,s,o`);
    if (!courses.length) throw new NotFoundException("Current examination enrollments not found");
    return courses;
  }
}
