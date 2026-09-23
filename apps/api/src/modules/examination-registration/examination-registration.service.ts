import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ExaminationCandidateCategory, ExaminationCandidateRegistration, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceAccessService, EvidenceActor } from "@/common/academic-evidence/evidence-access.service";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { ExaminationContextService } from "../summative-examination/examination-context.service";
import { ExaminationStudentContextService } from "../academic/examination-student-context.service";

type CandidateDraftSnapshot = {
  registrationId: string;
  listId: string;
  studentUserId: string;
  examinationId: string;
  category: ExaminationCandidateCategory;
  curriculumAssignmentId: string;
  version: number;
  recordedByUserId: string;
  recordedPoeAssignmentId: string;
  courseSources: Array<{ examinationCourseId: string; enrollmentId: string }>;
};

export function boundedReason(value: string, maximum = 2000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new BadRequestException("A bounded nonblank source/reason is required");
  return value.trim();
}

@Injectable()
export class ExaminationRegistrationService {
  constructor(private readonly prisma: PrismaService, private readonly access: EvidenceAccessService,
    private readonly examinations: ExaminationContextService, private readonly students: ExaminationStudentContextService) {}

  private run<T>(examinationId: string, work: (tx: Prisma.TransactionClient, actor: EvidenceActor, exam: Awaited<ReturnType<ExaminationContextService["lock"]>>, assignmentId: string) => Promise<T>) {
    const actor = this.access.principal(P.CLASSIFY);
    return evidenceTransaction(this.prisma, async (tx) => {
      const exam = await this.examinations.lock(tx, actor.departmentId, examinationId);
      await this.access.live(tx, actor, P.CLASSIFY);
      const assignments = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM poe_chairman_assignments WHERE department_id=${actor.departmentId}
        AND user_id=${actor.actorUserId} AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
        AND revoked_at IS NULL FOR SHARE`);
      if (assignments.length !== 1) throw new NotFoundException("Current POE Chairman appointment not found");
      return work(tx, actor, exam, assignments[0]!.id);
    });
  }

  workspace(examinationId: string) {
    return this.run(examinationId, async (tx, actor) => tx.examinationCandidateList.findFirst({
      where: { departmentId: actor.departmentId, examinationId }, include: {
        ExaminationCandidateRegistration_list: { include: { ExaminationCandidateCourse_registration: true } },
      },
    }));
  }

  createList(examinationId: string, sourceReference: string) {
    const source = boundedReason(sourceReference, 500);
    return this.run(examinationId, async (tx, actor, exam, assignmentId) => {
      const existing = await tx.examinationCandidateList.findFirst({ where: { examinationId, departmentId: actor.departmentId } });
      if (existing) {
        if (existing.sourceReference === source) return existing;
        throw new ConflictException("An examination candidate list already exists");
      }
      const list = await tx.examinationCandidateList.create({ data: { ...actorData(actor), recordedPoeAssignmentId: assignmentId, examinationId,
        academicProgramId: exam.academicProgramId, academicSessionId: exam.academicSessionId, academicTermId: exam.academicTermId,
        sourceReference: source, ruleVersionCode: exam.ruleVersionCode } });
      await this.access.audit(tx, actor, "examination-candidate.list.created", list.id);
      return list;
    });
  }

  putCandidate(examinationId: string, input: { studentUserId: string; curriculumAssignmentId: string; category: ExaminationCandidateCategory }) {
    if (!["REGULAR", "IRREGULAR", "IMPROVEMENT"].includes(input.category)) throw new BadRequestException("Invalid candidate category");
    return this.run(examinationId, async (tx, actor, exam, assignmentId) => {
      const list = await this.draft(tx, actor, examinationId);
      const courses = await this.students.validate(tx, actor.departmentId, examinationId, exam.academicProgramId,
        exam.academicTermId, input.studentUserId, input.curriculumAssignmentId);
      const previous = await tx.examinationCandidateRegistration.findFirst({ where: { listId: list.id, studentUserId: input.studentUserId } });
      if (previous?.category === input.category && previous.curriculumAssignmentId === input.curriculumAssignmentId) return previous;
      const previousSnapshot = previous ? await this.draftSnapshot(tx, previous) : null;
      if (previous) {
        // Draft changes are explicit; certification freezes the final revision and its course bindings.
        await tx.examinationCandidateCourse.deleteMany({ where: { registrationId: previous.id } });
      }
      const candidate = previous ? await tx.examinationCandidateRegistration.update({ where: { id: previous.id },
        data: { category: input.category, curriculumAssignmentId: input.curriculumAssignmentId, version: { increment: 1 },
          recordedByUserId: actor.actorUserId, recordedPoeAssignmentId: assignmentId } }) :
        await tx.examinationCandidateRegistration.create({ data: { ...actorData(actor), examinationId, listId: list.id, ...input, recordedPoeAssignmentId: assignmentId } });
      await tx.examinationCandidateCourse.createMany({ data: courses.map((c) => ({ ...c, departmentId: actor.departmentId, registrationId: candidate.id })) });
      await this.access.audit(tx, actor, "examination-candidate.classification.draft-recorded", candidate.id,
        { changeType: previous ? "REVISED" : "CREATED", previous: previousSnapshot, current: await this.draftSnapshot(tx, candidate) });
      return candidate;
    });
  }

  removeDraftCandidate(examinationId: string, registrationId: string) {
    return this.run(examinationId, async (tx, actor, _exam, assignmentId) => {
      const list = await this.draft(tx, actor, examinationId);
      const candidate = await tx.examinationCandidateRegistration.findFirst({ where: { id: registrationId, listId: list.id, departmentId: actor.departmentId } });
      if (!candidate) throw new NotFoundException("Candidate not found");
      const previous = await this.draftSnapshot(tx, candidate);
      await tx.examinationCandidateCourse.deleteMany({ where: { registrationId } });
      await tx.examinationCandidateRegistration.delete({ where: { id: registrationId } });
      await this.access.audit(tx, actor, "examination-candidate.classification.draft-removed", registrationId,
        { changeType: "REMOVED", previous, current: null, removerPoeAssignmentId: assignmentId });
      return { removed: true };
    });
  }

  certify(examinationId: string) {
    return this.run(examinationId, async (tx, actor, exam, assignmentId) => {
      const list = await tx.examinationCandidateList.findFirst({ where: { examinationId, departmentId: actor.departmentId } });
      if (!list) throw new NotFoundException("Candidate list not found");
      if (list.status === "CERTIFIED") return list;
      const candidates = await tx.examinationCandidateRegistration.findMany({ where: { listId: list.id },
        include: { ExaminationCandidateCourse_registration: true } });
      if (!candidates.length) throw new BadRequestException("An empty candidate list cannot be certified");
      for (const candidate of candidates) {
        const courses = await this.students.validate(tx, actor.departmentId, examinationId, exam.academicProgramId,
          exam.academicTermId, candidate.studentUserId, candidate.curriculumAssignmentId);
        // Refresh draft enrollment bindings under the examination mutex; certification captures the complete current set.
        await tx.examinationCandidateCourse.deleteMany({ where: { registrationId: candidate.id } });
        await tx.examinationCandidateCourse.createMany({ data: courses.map((c) => ({ ...c, departmentId: actor.departmentId, registrationId: candidate.id })) });
      }
      const certified = await tx.examinationCandidateList.update({ where: { id: list.id }, data: {
        status: "CERTIFIED", certifiedAt: new Date(), certifiedByUserId: actor.actorUserId, chairmanAssignmentId: assignmentId,
      } });
      await this.access.audit(tx, actor, "examination-candidate.classification.certified", list.id,
        { chairmanAssignmentId: assignmentId, version: certified.version, count: candidates.length });
      return certified;
    });
  }

  /** Public downstream contract: certification survives the certifier's later replacement. */
  async certifiedRegular(tx: Prisma.TransactionClient, departmentId: string, examinationId: string) {
    const list = await tx.examinationCandidateList.findFirst({ where: { departmentId, examinationId, status: "CERTIFIED" },
      include: { ExaminationCandidateRegistration_list: { where: { category: "REGULAR" },
        include: { ExaminationCandidateCourse_registration: true } } } });
    if (!list || !list.certifiedAt || !list.chairmanAssignmentId || !list.ExaminationCandidateRegistration_list.length) {
      throw new ConflictException("A certified candidate list containing explicit REGULAR candidates is required");
    }
    return list;
  }

  private async draftSnapshot(tx: Prisma.TransactionClient, candidate: ExaminationCandidateRegistration): Promise<CandidateDraftSnapshot> {
    const sources = await tx.examinationCandidateCourse.findMany({ where: { registrationId: candidate.id },
      select: { examinationCourseId: true, enrollmentId: true },
      orderBy: [{ examinationCourseId: "asc" }, { enrollmentId: "asc" }] });
    // Copy only structural evidence; never retain ORM objects or mutable source-row references.
    return { registrationId: candidate.id, listId: candidate.listId, studentUserId: candidate.studentUserId,
      examinationId: candidate.examinationId, category: candidate.category, curriculumAssignmentId: candidate.curriculumAssignmentId,
      version: candidate.version, recordedByUserId: candidate.recordedByUserId, recordedPoeAssignmentId: candidate.recordedPoeAssignmentId,
      courseSources: sources.map(({ examinationCourseId, enrollmentId }) => ({ examinationCourseId, enrollmentId })) };
  }

  private async draft(tx: Prisma.TransactionClient, actor: EvidenceActor, examinationId: string) {
    const list = await tx.examinationCandidateList.findFirst({ where: { examinationId, departmentId: actor.departmentId } });
    if (!list) throw new NotFoundException("Candidate list not found");
    if (list.status !== "DRAFT") throw new ConflictException("Certified classification is immutable");
    return list;
  }
}

function actorData(actor: EvidenceActor) { return { departmentId: actor.departmentId, recordedByUserId: actor.actorUserId }; }
