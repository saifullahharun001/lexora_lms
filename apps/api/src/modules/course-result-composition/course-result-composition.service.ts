import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { composeCourseResult, COURSE_COMPOSITION_AUDIT, COURSE_COMPOSITION_RULE } from "./domain/course-result-composition.rules";
import { compositionAuditSources, validateCompositionSources } from "./course-result-composition.contract";

/** Intentionally shared immutable SQL projection; no repository access to private source tables. */
export interface CourseCompositionSources {
  departmentId: string; examinationId: string; examinationCourseId: string; courseOfferingId: string;
  enrollmentId: string; studentUserId: string; academicProgramId: string; academicSessionId: string;
  academicTermId: string; studentBatchId: string; curriculumAssignmentId: string;
  curriculumVersionId: string; curriculumCourseId: string; syllabusVersionId: string; assessmentTemplateId: string;
  candidateListId: string; candidateListVersion: number; registrationId: string; registrationVersion: number;
  candidateCourseId: string; candidateCategory: string; formativeResultId: string; summativeCandidateId: string;
  chairmanApprovalId: string; calculatedMarkId: string; calculatedMarkVersion: number;
  formativeRule: string; summativeRule: string; candidateRule: string;
  formativeMark: string; formativeFullMark: string; summativeMark: string; summativeFullMark: string;
  provenanceJson: Prisma.InputJsonObject;
}

@Injectable()
export class CourseResultCompositionService {
  /** Source-owner-only entry point: caller supplies its existing Serializable transaction.
   * No standalone reconciliation, controller, client source IDs, marks or human approval.
   */
  async reconcileInTransaction(tx: Prisma.TransactionClient, departmentId: string, examinationId: string,
    examinationCourseId: string, enrollmentId: string) {
    // Both owners lock Examination first. Advance its row version to force a stale waiter to retry.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE examinations SET id=id WHERE id=${examinationId} AND department_id=${departmentId} RETURNING id`);
    if (locked.length !== 1) throw new NotFoundException("Examination not found");
    const state = await this.inspectInTransaction(tx, departmentId, examinationId, examinationCourseId, enrollmentId);
    if (state.status !== "READY") return state;
    const { sources } = state;
    const marks = composeCourseResult(sources.formativeMark, sources.summativeMark, sources.formativeFullMark, sources.summativeFullMark);
    const result = await tx.courseResultComposition.create({ data: { ...sources, ...marks, ruleVersionCode: COURSE_COMPOSITION_RULE } });
    await tx.auditLog.create({ data: { departmentId, actorType: "SERVICE", action: COURSE_COMPOSITION_AUDIT,
      targetType: "course_result_composition", targetId: result.id, outcome: "SUCCESS",
      contextJson: { ...compositionAuditSources(sources), aggregateId: result.id, ruleVersionCode: COURSE_COMPOSITION_RULE,
        totalMark: marks.totalMark.toFixed(6), totalFullMark: "100.000000", formativePassed: marks.formativePassed,
        summativePassed: marks.summativePassed, coursePassed: marks.coursePassed },
    } });
    return { status: "CREATED" as const, result };
  }

  /** Read-only operational discovery in a caller-owned snapshot. Never log the returned sources. */
  async inspectInTransaction(tx: Prisma.TransactionClient, departmentId: string, examinationId: string,
    examinationCourseId: string, enrollmentId: string) {
    const [row] = await tx.$queryRaw<Array<{ sources: CourseCompositionSources | null }>>(Prisma.sql`
      SELECT course_composition_sources(${departmentId},${examinationId},${examinationCourseId},${enrollmentId}) AS sources`);
    const sources = row?.sources;
    const existing = await tx.courseResultComposition.findUnique({ where: {
      departmentId_examinationCourseId_enrollmentId: { departmentId, examinationCourseId, enrollmentId },
    } });
    if (!sources) {
      if (existing) throw new ConflictException("Authoritative course-result source package changed");
      return { status: "NOT_READY" as const };
    }
    validateCompositionSources(sources);
    if (sources.departmentId !== departmentId || sources.examinationId !== examinationId ||
      sources.examinationCourseId !== examinationCourseId || sources.enrollmentId !== enrollmentId || sources.candidateCategory !== "REGULAR")
      throw new ConflictException("Invalid course-result source scope");
    composeCourseResult(sources.formativeMark, sources.summativeMark, sources.formativeFullMark, sources.summativeFullMark);
    if (existing) {
      const [match] = await tx.$queryRaw<Array<{ matches: boolean }>>(Prisma.sql`
        SELECT course_composition_matches(${existing.id},${JSON.stringify(sources)}::jsonb) AS matches`);
      if (!match?.matches) throw new ConflictException("Authoritative course-result source package changed");
      return { status: "EXISTING" as const, result: existing };
    }
    return { status: "READY" as const, sources };
  }
}
