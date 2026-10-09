import { CourseResultCompositionService } from "@/modules/course-result-composition/course-result-composition.service";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";
import { composeFinalFormative, FINAL_FORMATIVE_AUDIT_EVENTS, FINAL_FORMATIVE_RULE } from "./domain/final-formative.rules";

// Explicit shared authoritative read projection. SQL validates complete source lineage;
// neither this contract nor any public API accepts marks or component source IDs.
export interface FinalFormativeSources {
  departmentId: string; examinationId: string; examinationCourseId: string; courseOfferingId: string;
  enrollmentId: string; studentUserId: string; academicProgramId: string; academicSessionId: string;
  academicTermId: string; studentBatchId: string;
  activitiesFinalisationId: string; activitiesResultId: string;
  attendanceGenerationId: string; attendanceVersionId: string;
  comprehensiveFinalisationId: string; comprehensiveResultId: string;
  activitiesMark: string; activitiesFullMark: string; attendanceMark: string; attendanceFullMark: string;
  comprehensiveMark: string; comprehensiveFullMark: string;
  provenanceJson: Prisma.InputJsonObject;
}

@Injectable()
export class FinalFormativeService {
  constructor(private readonly prisma: PrismaService, @Inject(CourseResultCompositionService) private readonly composition: Pick<CourseResultCompositionService, "reconcileInTransaction">) {}

  /** Operational reconciliation only; no HTTP controller or academic approval lifecycle. */
  reconcile(departmentId: string, examinationId: string) {
    return evidenceTransaction(this.prisma, (tx) => this.reconcileInTransaction(tx, departmentId, examinationId));
  }

  /** Existing operational /40 command retains its original mutation scope. */
  reconcileFormativeOnly(departmentId: string, examinationId: string) {
    return evidenceTransaction(this.prisma, (tx) => this.reconcileInTransaction(tx, departmentId, examinationId, false));
  }

  /** Call only within the source owner's Serializable transaction after completing its package/audit. */
  async reconcileInTransaction(tx: Prisma.TransactionClient, departmentId: string, examinationId: string, composeCourse = true) {
    // All three source owners already lock Examination first. Writing a neutral row version
    // forces a waiting Serializable transaction to retry with a fresh source snapshot.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE examinations SET id=id WHERE id=${examinationId} AND department_id=${departmentId} RETURNING id`);
    if (locked.length !== 1) throw new NotFoundException("Examination not found");
    const contexts = await tx.$queryRaw<Array<{ examinationCourseId: string; enrollmentId: string }>>(Prisma.sql`
      SELECT ec.id AS "examinationCourseId", e.id AS "enrollmentId"
      FROM examination_courses ec JOIN enrollments e ON e.course_offering_id=ec.course_offering_id
      WHERE ec.examination_id=${examinationId} AND ec.department_id=${departmentId}
      ORDER BY ec.id COLLATE "C", e.id COLLATE "C"`);
    const outcomes = [];
    for (const context of contexts) outcomes.push(await this.materialiseInTransaction(tx, departmentId, context.examinationCourseId, context.enrollmentId, composeCourse));
    return outcomes;
  }

  /** Internal per-context entry point. The caller holds the Examination mutex and Serializable transaction. */
  async materialiseInTransaction(tx: Prisma.TransactionClient, departmentId: string, examinationCourseId: string, enrollmentId: string, composeCourse = true) {
    const [row] = await tx.$queryRaw<Array<{ sources: FinalFormativeSources | null }>>(Prisma.sql`
      SELECT final_formative_sources(${departmentId},${examinationCourseId},${enrollmentId}) AS sources`);
    const sources = row?.sources;
    const existing = await tx.formativeFinalResult.findUnique({ where: {
      departmentId_examinationCourseId_enrollmentId: { departmentId, examinationCourseId, enrollmentId },
    } });
    if (!sources) {
      if (existing) throw new ConflictException("Authoritative Final Formative source package changed");
      return { status: "NOT_READY" as const, examinationCourseId, enrollmentId };
    }
    if (sources.departmentId !== departmentId || sources.examinationCourseId !== examinationCourseId || sources.enrollmentId !== enrollmentId ||
      !new Prisma.Decimal(sources.activitiesFullMark).eq(30) || !new Prisma.Decimal(sources.attendanceFullMark).eq(5) ||
      !new Prisma.Decimal(sources.comprehensiveFullMark).eq(5)) throw new ConflictException("Invalid Final Formative source scope");
    const mark = composeFinalFormative(sources.activitiesMark, sources.attendanceMark, sources.comprehensiveMark);
    const data = { ...sources, mark, fullMark: new Prisma.Decimal(40), ruleVersionCode: FINAL_FORMATIVE_RULE };
    if (existing) {
      // Compare the complete persisted identity/provenance, not only the numerical total.
      const [match] = await tx.$queryRaw<Array<{ matches: boolean }>>(Prisma.sql`
        SELECT final_formative_matches(${existing.id}, ${JSON.stringify(sources)}::jsonb) AS matches`);
      if (!match?.matches || !existing.mark.eq(mark) || existing.ruleVersionCode !== FINAL_FORMATIVE_RULE)
        throw new ConflictException("Authoritative Final Formative source package changed");
      if (composeCourse) await this.composition.reconcileInTransaction(tx, departmentId, sources.examinationId, examinationCourseId, enrollmentId);
      return { status: "EXISTING" as const, result: existing };
    }
    const result = await tx.formativeFinalResult.create({ data });
    await tx.auditLog.create({ data: { departmentId, actorType: "SERVICE", action: FINAL_FORMATIVE_AUDIT_EVENTS.MATERIALISED,
      targetType: "formative_final_result", targetId: result.id, outcome: "SUCCESS",
      contextJson: { aggregateId: result.id, ...sources, ruleVersionCode: FINAL_FORMATIVE_RULE, mark: mark.toFixed(6), fullMark: "40.00" },
    } });
    if (composeCourse) await this.composition.reconcileInTransaction(tx, departmentId, sources.examinationId, examinationCourseId, enrollmentId);
    return { status: "CREATED" as const, result };
  }
}
