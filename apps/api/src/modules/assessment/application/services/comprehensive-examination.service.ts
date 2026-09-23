import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ComprehensiveCourse, ComprehensiveExamination, ComprehensiveMarkingMode, ExaminationCommitteeAssignment, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceAccessService, EvidenceActor } from "@/common/academic-evidence/evidence-access.service";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { ExaminationContextService } from "@/modules/summative-examination/examination-context.service";
import { ExaminationRegistrationService, boundedReason } from "@/modules/examination-registration/examination-registration.service";
import { COMPREHENSIVE_MODES, COMPREHENSIVE_SEATS, COMPREHENSIVE_CALCULATION, comprehensiveDecimal, deriveComprehensive, requiredSeats } from "../../domain/comprehensive.rules";

type Committee = Awaited<ReturnType<ExaminationContextService["committee"]>>;
type Authority = EvidenceActor & { assignment: ExaminationCommitteeAssignment; externalAccessId: string | null; committee: Committee };

@Injectable()
export class ComprehensiveExaminationService {
  constructor(private readonly prisma: PrismaService, private readonly access: EvidenceAccessService,
    private readonly examinations: ExaminationContextService, private readonly registration: ExaminationRegistrationService) {}

  private run<T>(examinationId: string, policy: string, chairman: boolean,
    work: (tx: Prisma.TransactionClient, authority: Authority) => Promise<T>) {
    const actor = this.access.principal(policy);
    return evidenceTransaction(this.prisma, async (tx) => {
      await this.examinations.lock(tx, actor.departmentId, examinationId);
      const committee = await this.examinations.committee(tx, actor.departmentId, examinationId);
      await this.access.live(tx, actor, policy);
      let assignment = committee.assignments.find((a) => a.assignedUserId === actor.actorUserId && a.seat !== "EXTERNAL_MEMBER");
      let externalAccessId: string | null = null;
      if (!assignment && !chairman) {
        const binding = await this.externalBinding(tx, actor.departmentId, committee.assignments.find((a) => a.seat === "EXTERNAL_MEMBER"));
        if (binding?.userId === actor.actorUserId) {
          assignment = committee.assignments.find((a) => a.id === binding.assignmentId);
          externalAccessId = binding.id;
        }
      }
      if (!assignment || (chairman && assignment.seat !== "CHAIRMAN")) throw new NotFoundException("Current Examination Committee duty not found");
      await this.liveMember(tx, actor.departmentId, assignment, actor.actorUserId);
      return work(tx, { ...actor, assignment, externalAccessId, committee });
    });
  }

  configure(examinationId: string, input: { mode: ComprehensiveMarkingMode; examDate: string }) {
    if (!(COMPREHENSIVE_MODES as readonly string[]).includes(input.mode)) throw new BadRequestException("Invalid marking mode");
    const examDate = new Date(input.examDate);
    if (!Number.isFinite(examDate.getTime())) throw new BadRequestException("Invalid examination date");
    return this.run(examinationId, P.CONFIGURE, true, async (tx, a) => {
      this.formalCommittee(a.committee);
      const list = await this.registration.certifiedRegular(tx, a.departmentId, examinationId);
      const existing = await tx.comprehensiveExamination.findFirst({ where: { examinationId, departmentId: a.departmentId } });
      if (existing) {
        if (existing.mode === input.mode && existing.examDate.getTime() === examDate.getTime()) return existing;
        if (existing.status !== "CONFIGURED" || existing.markingStartedAt) throw new ConflictException("Mode and configuration are frozen");
        const previous = configurationSnapshot(existing);
        if (existing.mode !== input.mode) {
          const courses = await tx.comprehensiveCourse.findMany({ where: { comprehensiveId: existing.id } });
          const allocated = courses.filter((c) => c.assignedCommitteeAssignmentId !== null);
          if (allocated.length) {
            const previousMappings = allocationSnapshot(courses);
            for (const course of allocated) await tx.comprehensiveCourse.update({ where: { id: course.id }, data: {
              assignedCommitteeAssignmentId: null, allocatedAssignmentAssignedAt: null, ...allocationActor(a),
            } });
            await this.audit(tx, a, "comprehensive.distribution.configured", existing.id, { changeType: "CLEARED",
              previous: previousMappings, current: allocationSnapshot(await tx.comprehensiveCourse.findMany({ where: { comprehensiveId: existing.id } })) });
          }
        }
        const updated = await tx.comprehensiveExamination.update({ where: { id: existing.id }, data: { mode: input.mode, examDate,
          configuredByUserId: a.actorUserId, configuredAssignmentId: a.assignment.id, configuredAssignmentAssignedAt: a.assignment.assignedAt } });
        await this.audit(tx, a, "comprehensive.mode.selected", updated.id,
          { changeType: "REVISED", previous, current: configurationSnapshot(updated) });
        return updated;
      }
      const courses = await this.examinations.applicableCourses(tx, a.departmentId, examinationId);
      const comprehensive = await tx.comprehensiveExamination.create({ data: { departmentId: a.departmentId, examinationId,
        committeeId: a.committee.committeeId, candidateListId: list.id, examDate, mode: input.mode,
        ruleVersionCode: list.ruleVersionCode, configuredByUserId: a.actorUserId, configuredAssignmentId: a.assignment.id,
        configuredAssignmentAssignedAt: a.assignment.assignedAt } });
      for (const { course, component } of courses) {
        await tx.comprehensiveCourse.create({ data: { departmentId: a.departmentId, comprehensiveId: comprehensive.id,
          examinationCourseId: course.id, assessmentComponentId: component.id, fullMark: component.maximumMarks,
          templateVersion: course.assessmentTemplate.versionNumber, academicSnapshot: {
            academicProgramId: course.academicProgramId, academicSessionId: course.academicSessionId, academicTermId: course.academicTermId,
            courseOfferingId: course.courseOfferingId, curriculumVersionId: course.curriculumVersionId,
            curriculumCourseId: course.curriculumCourseId, syllabusVersionId: course.syllabusVersionId,
            assessmentTemplateId: course.assessmentTemplateId, ruleVersionCode: course.ruleVersionCode,
          } } });
      }
      const context = { changeType: "CREATED", previous: null, current: configurationSnapshot(comprehensive) };
      await this.audit(tx, a, "comprehensive.configured", comprehensive.id, context);
      await this.audit(tx, a, "comprehensive.mode.selected", comprehensive.id, context);
      return comprehensive;
    });
  }

  roster(examinationId: string) {
    return this.run(examinationId, P.CONFIGURE, true, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      if (exam.rosterLockedAt) return tx.comprehensiveRosterEntry.findMany({ where: { comprehensiveId: exam.id } });
      if (exam.status !== "CONFIGURED") throw new ConflictException("Roster is frozen");
      const list = await this.registration.certifiedRegular(tx, a.departmentId, examinationId);
      if (list.id !== exam.candidateListId) throw new ConflictException("Candidate list source mismatch");
      const courses = await this.validCourses(tx, a, exam);
      const data: Prisma.ComprehensiveRosterEntryCreateManyInput[] = [];
      for (const candidate of list.ExaminationCandidateRegistration_list) {
        const applicable = candidate.ExaminationCandidateCourse_registration.filter((cc) => courses.some((c) => c.examinationCourseId === cc.examinationCourseId));
        if (!applicable.length) throw new ConflictException("A certified REGULAR candidate lacks applicable examination courses");
        for (const cc of applicable) data.push({ departmentId: a.departmentId, comprehensiveId: exam.id,
          courseId: courses.find((c) => c.examinationCourseId === cc.examinationCourseId)!.id,
          registrationId: candidate.id, registrationVersion: candidate.version, candidateCourseId: cc.id });
      }
      await tx.comprehensiveRosterEntry.createMany({ data });
      const locked = await tx.comprehensiveExamination.update({ where: { id: exam.id }, data: { rosterLockedAt: new Date(),
        rosterLockedByUserId: a.actorUserId, rosterLockedByAssignmentId: a.assignment.id,
        rosterLockedByAssignmentAssignedAt: a.assignment.assignedAt } });
      await this.audit(tx, a, "comprehensive.roster.locked", exam.id, { comprehensiveId: exam.id, examinationId,
        rosterLockedAt: locked.rosterLockedAt!.toISOString(), rosterLockedByUserId: locked.rosterLockedByUserId,
        rosterLockedByAssignmentId: locked.rosterLockedByAssignmentId,
        rosterLockedByAssignmentAssignedAt: locked.rosterLockedByAssignmentAssignedAt!.toISOString(), count: data.length });
      return tx.comprehensiveRosterEntry.findMany({ where: { comprehensiveId: exam.id } });
    });
  }

  distribute(examinationId: string, allocations: Array<{ courseId: string; committeeAssignmentId: string }>) {
    return this.run(examinationId, P.CONFIGURE, true, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      if (exam.mode !== "COURSE_DISTRIBUTED" || exam.status !== "CONFIGURED" || exam.markingStartedAt) throw new ConflictException("Course distribution is unavailable or frozen");
      const courses = await this.validCourses(tx, a, exam);
      this.formalCommittee(a.committee);
      if (allocations.length !== courses.length || new Set(allocations.map((v) => v.courseId)).size !== courses.length) throw new BadRequestException("Exactly one allocation for every applicable course is required");
      for (const input of allocations) {
        const course = courses.find((c) => c.id === input.courseId);
        const assignment = a.committee.assignments.find((v) => v.id === input.committeeAssignmentId);
        if (!course || !assignment) throw new NotFoundException("Course or current appointment not found");
        await this.usableMember(tx, a.departmentId, assignment);
      }
      const previous = allocationSnapshot(courses);
      for (const input of allocations) {
        const course = courses.find((c) => c.id === input.courseId)!;
        const assignedAt = a.committee.assignments.find((s) => s.id === input.committeeAssignmentId)!.assignedAt;
        if (course.assignedCommitteeAssignmentId === input.committeeAssignmentId && course.allocatedAssignmentAssignedAt?.getTime() === assignedAt.getTime()) continue;
        await tx.comprehensiveCourse.update({ where: { id: input.courseId }, data: {
          assignedCommitteeAssignmentId: input.committeeAssignmentId, allocatedAssignmentAssignedAt: assignedAt, ...allocationActor(a),
        } });
      }
      const current = await tx.comprehensiveCourse.findMany({ where: { comprehensiveId: exam.id } });
      await this.audit(tx, a, "comprehensive.distribution.configured", exam.id, { previous, current: allocationSnapshot(current) });
      return current;
    });
  }

  workspace(examinationId: string, review = false, finalsOnly = false) {
    return this.run(examinationId, review ? P.REVIEW : P.READ, review, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      const courses = await tx.comprehensiveCourse.findMany({ where: { comprehensiveId: exam.id } });
      const visible = review || a.assignment.seat === "CHAIRMAN" ? courses : courses.filter((c) => this.mayMark(exam.mode, c.assignedCommitteeAssignmentId, a, c.allocatedAssignmentAssignedAt));
      const entries = await tx.comprehensiveRosterEntry.findMany({ where: { comprehensiveId: exam.id, courseId: { in: visible.map((c) => c.id) } },
        include: { registration: { select: { id: true, studentUserId: true, category: true, version: true } }, candidateCourse: true } });
      const finalisation = await tx.comprehensiveFinalisation.findFirst({ where: { comprehensiveId: exam.id }, include: {
        ComprehensiveFinalResult_finalisation: { where: { rosterEntryId: { in: entries.map((e) => e.id) } }, include: {
          ComprehensiveFinalSource_result: { include: { mark: true } },
          rosterEntry: { include: { course: true, candidateCourse: true, registration: { include: { list: true } } } },
        } },
      } });
      if (finalsOnly) return { examination: exam, finalisation };
      const marks = await tx.comprehensiveMark.findMany({ where: { comprehensiveId: exam.id,
        rosterEntryId: { in: entries.map((e) => e.id) }, ...(review ? {} : { actorUserId: a.actorUserId, committeeAssignmentId: a.assignment.id }) },
        orderBy: [{ rosterEntryId: "asc" }, { revision: "asc" }], include: { ComprehensiveMarkReturn_mark: true } });
      const absences = await tx.comprehensiveAbsence.findMany({ where: { comprehensiveId: exam.id, registrationId: { in: entries.map((e) => e.registrationId) } } });
      return { examination: exam, courses: visible, roster: entries, marks, absences, finalisation };
    });
  }

  save(examinationId: string, rosterEntryId: string, input: { mark: string; returnId?: string }, submit: boolean) {
    return this.run(examinationId, P.MARK, false, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      const row = await tx.comprehensiveRosterEntry.findFirst({ where: { id: rosterEntryId, comprehensiveId: exam.id, departmentId: a.departmentId }, include: { course: true } });
      if (!row || !this.mayMark(exam.mode, row.course.assignedCommitteeAssignmentId, a, row.course.allocatedAssignmentAssignedAt)) throw new NotFoundException("Assigned candidate/course not found");
      if (exam.status === "FINALISED") throw new ConflictException("Final Comprehensive evidence is immutable");
      if (await tx.comprehensiveAbsence.findFirst({ where: { comprehensiveId: exam.id, registrationId: row.registrationId } })) throw new ConflictException("Absence requires later special/failure resolution");
      const value = comprehensiveDecimal(input.mark, row.course.fullMark);
      const latest = await tx.comprehensiveMark.findFirst({ where: { rosterEntryId, seat: a.assignment.seat }, orderBy: { revision: "desc" } });
      if (latest && (latest.committeeAssignmentId !== a.assignment.id || latest.actorUserId !== a.actorUserId || latest.assignmentAssignedAt.getTime() !== a.assignment.assignedAt.getTime() || latest.externalAccessId !== a.externalAccessId)) {
        throw new ConflictException("Predecessor evidence requires a future explicit reassignment lifecycle");
      }
      if (latest?.status === "SUBMITTED" && latest.returnId === (input.returnId ?? null) && latest.mark.eq(value)) return latest;
      let previousId: string | null = null;
      if (latest?.status === "SUBMITTED") {
        const returned = await tx.comprehensiveMarkReturn.findFirst({ where: { markId: latest.id, id: input.returnId ?? "", comprehensiveId: exam.id } });
        if (!returned) throw new ConflictException("Submitted evidence can only be corrected through its exact Chairman return");
        previousId = latest.id;
      } else if (latest) {
        if (latest.returnId !== (input.returnId ?? null)) throw new ConflictException("Draft correction source mismatch");
      } else if (input.returnId) throw new NotFoundException("Return evidence not found");
      await this.startMarking(tx, a, exam);
      const data = { mark: value, status: submit ? "SUBMITTED" as const : "DRAFT" as const, submittedAt: submit ? new Date() : null };
      const evidence = latest?.status === "DRAFT" ? await tx.comprehensiveMark.update({ where: { id: latest.id }, data }) :
        await tx.comprehensiveMark.create({ data: { ...data, departmentId: a.departmentId, comprehensiveId: exam.id,
          rosterEntryId, committeeAssignmentId: a.assignment.id, assignmentAssignedAt: a.assignment.assignedAt,
          externalAccessId: a.externalAccessId, seat: a.assignment.seat, actorUserId: a.actorUserId,
          revision: (latest?.revision ?? 0) + 1, previousId, returnId: input.returnId, fullMark: row.course.fullMark } });
      await this.audit(tx, a, submit ? (evidence.returnId ? "comprehensive.mark.resubmitted" : "comprehensive.mark.submitted") : "comprehensive.mark.draft-saved",
        evidence.id, { revision: evidence.revision, returnId: evidence.returnId });
      return evidence;
    });
  }

  returnMark(examinationId: string, markId: string, reason: string) {
    const normalized = boundedReason(reason);
    return this.run(examinationId, P.REVIEW, true, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      if (exam.status === "FINALISED" || exam.mode === "CHAIRMAN_ONLY") throw new ConflictException("Return is unavailable in this state/mode");
      const mark = await tx.comprehensiveMark.findFirst({ where: { id: markId, departmentId: a.departmentId, comprehensiveId: exam.id }, include: { rosterEntry: { include: { course: true } } } });
      if (!mark) throw new NotFoundException("Submitted mark not found");
      const latest = await tx.comprehensiveMark.findFirst({ where: { rosterEntryId: mark.rosterEntryId, seat: mark.seat }, orderBy: { revision: "desc" } });
      const assignment = a.committee.assignments.find((s) => s.id === mark.committeeAssignmentId && s.seat === mark.seat && s.assignedAt.getTime() === mark.assignmentAssignedAt.getTime());
      if (!assignment || latest?.id !== mark.id || mark.status !== "SUBMITTED" || (exam.mode === "COURSE_DISTRIBUTED" && mark.rosterEntry.course.assignedCommitteeAssignmentId !== assignment.id)) throw new ConflictException("Only exact current submitted evidence may be returned");
      await this.usableMember(tx, a.departmentId, assignment);
      const existing = await tx.comprehensiveMarkReturn.findFirst({ where: { markId } });
      if (existing) {
        if (existing.reason === normalized) return existing;
        throw new ConflictException("Return evidence is immutable");
      }
      const returned = await tx.comprehensiveMarkReturn.create({ data: { departmentId: a.departmentId, comprehensiveId: exam.id,
        markId, chairmanAssignmentId: a.assignment.id, assignmentAssignedAt: a.assignment.assignedAt, actorUserId: a.actorUserId, reason: normalized } });
      await this.audit(tx, a, "comprehensive.mark.returned", returned.id, { markId });
      return returned;
    });
  }

  absent(examinationId: string, registrationId: string, reason: string) {
    const normalized = boundedReason(reason);
    return this.run(examinationId, P.REVIEW, true, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      if (exam.status === "FINALISED") throw new ConflictException("Final evidence is immutable");
      const rows = await tx.comprehensiveRosterEntry.findMany({ where: { comprehensiveId: exam.id, registrationId, departmentId: a.departmentId } });
      if (!rows.length) throw new NotFoundException("Regular candidate not found");
      const existing = await tx.comprehensiveAbsence.findFirst({ where: { comprehensiveId: exam.id, registrationId } });
      if (existing) {
        if (existing.reason === normalized) return existing;
        throw new ConflictException("Absence evidence is immutable");
      }
      if (await tx.comprehensiveMark.count({ where: { rosterEntryId: { in: rows.map((r) => r.id) } } })) throw new ConflictException("Existing marking evidence conflicts with absence; explicit resolution is required");
      await this.startMarking(tx, a, exam);
      const absence = await tx.comprehensiveAbsence.create({ data: { departmentId: a.departmentId, comprehensiveId: exam.id,
        registrationId, chairmanAssignmentId: a.assignment.id, assignmentAssignedAt: a.assignment.assignedAt, actorUserId: a.actorUserId, reason: normalized } });
      await this.audit(tx, a, "comprehensive.absence.recorded", absence.id, { registrationId });
      return absence;
    });
  }

  finalise(examinationId: string) {
    return this.run(examinationId, P.FINALISE, true, async (tx, a) => {
      const exam = await this.workflow(tx, a, examinationId);
      const existing = await tx.comprehensiveFinalisation.findFirst({ where: { comprehensiveId: exam.id } });
      if (existing) return existing;
      if (!exam.rosterLockedAt || !exam.markingStartedAt || exam.status !== "MARKING") throw new ConflictException("A complete locked roster and marking evidence are required");
      const courses = await this.validCourses(tx, a, exam);
      await this.requiredMembers(tx, a, exam.mode, courses);
      const list = await this.registration.certifiedRegular(tx, a.departmentId, examinationId);
      if (list.id !== exam.candidateListId) throw new ConflictException("Candidate source changed");
      const rows = await tx.comprehensiveRosterEntry.findMany({ where: { comprehensiveId: exam.id }, include: { course: true } });
      const expected = list.ExaminationCandidateRegistration_list.flatMap((r) => r.ExaminationCandidateCourse_registration
        .filter((cc) => courses.some((c) => c.examinationCourseId === cc.examinationCourseId)).map((cc) => ({ registration: r, cc })));
      if (!rows.length || rows.length !== expected.length || expected.some(({ registration: r, cc }) => !rows.some((row) => row.registrationId === r.id && row.registrationVersion === r.version && row.candidateCourseId === cc.id && row.course.examinationCourseId === cc.examinationCourseId))) throw new ConflictException("Certified regular roster is incomplete");
      if (await tx.comprehensiveAbsence.count({ where: { comprehensiveId: exam.id } })) throw new ConflictException("Unresolved absence blocks normal finalisation");
      const results = [];
      for (const row of rows) {
        const assigned = a.committee.assignments.find((s) => s.id === row.course.assignedCommitteeAssignmentId);
        const seats = requiredSeats(exam.mode, assigned?.seat);
        const sources = [];
        for (const seat of seats) {
          const member = a.committee.assignments.find((s) => s.seat === seat)!;
          const mark = await tx.comprehensiveMark.findFirst({ where: { rosterEntryId: row.id, seat: member.seat }, orderBy: { revision: "desc" } });
          if (!mark || mark.status !== "SUBMITTED" || mark.committeeAssignmentId !== member.id ||
            mark.assignmentAssignedAt.getTime() !== member.assignedAt.getTime() || !mark.fullMark.eq(row.course.fullMark)) throw new ConflictException("Required current submitted marks are incomplete");
          const user = await this.usableMember(tx, a.departmentId, member);
          if (mark.actorUserId !== user.userId || mark.externalAccessId !== user.externalAccessId) throw new ConflictException("Stale mark author binding");
          if (await tx.comprehensiveMarkReturn.findFirst({ where: { markId: mark.id } })) throw new ConflictException("Unresolved returned mark blocks finalisation");
          sources.push(mark);
        }
        results.push({ row, sources, value: deriveComprehensive(exam.mode, row.course.fullMark, sources, assigned?.seat) });
      }
      const finalisation = await tx.comprehensiveFinalisation.create({ data: { departmentId: a.departmentId, comprehensiveId: exam.id,
        chairmanAssignmentId: a.assignment.id, assignmentAssignedAt: a.assignment.assignedAt, actorUserId: a.actorUserId,
        ruleVersionCode: exam.ruleVersionCode, mode: exam.mode } });
      for (const result of results) {
        const snapshot = await tx.comprehensiveFinalResult.create({ data: { departmentId: a.departmentId,
          finalisationId: finalisation.id, rosterEntryId: result.row.id, mark: result.value, fullMark: result.row.course.fullMark,
          calculationRule: COMPREHENSIVE_CALCULATION } });
        await tx.comprehensiveFinalSource.createMany({ data: result.sources.map((source) => ({ departmentId: a.departmentId, resultId: snapshot.id, markId: source.id })) });
      }
      await tx.comprehensiveExamination.update({ where: { id: exam.id }, data: { status: "FINALISED", finalisedAt: finalisation.createdAt } });
      await this.audit(tx, a, "comprehensive.chairman.finalised", finalisation.id, { count: results.length, mode: exam.mode });
      return finalisation;
    });
  }

  private async workflow(tx: Prisma.TransactionClient, a: Authority, examinationId: string) {
    const exam = await tx.comprehensiveExamination.findFirst({ where: { departmentId: a.departmentId, examinationId, committeeId: a.committee.committeeId } });
    if (!exam) throw new NotFoundException("Comprehensive Examination not found");
    return exam;
  }

  private mayMark(mode: string, assignedId: string | null, a: Authority, allocatedAt: Date | null) {
    return mode === "ALL_MEMBERS_AVERAGE" || (mode === "CHAIRMAN_ONLY" && a.assignment.seat === "CHAIRMAN") ||
      (mode === "COURSE_DISTRIBUTED" && assignedId === a.assignment.id && allocatedAt?.getTime() === a.assignment.assignedAt.getTime());
  }

  private formalCommittee(c: Committee) {
    if (c.assignments.length !== 4 || COMPREHENSIVE_SEATS.some((seat) => c.assignments.filter((s) => s.seat === seat).length !== 1)) throw new ConflictException("All four current formal Committee seats are required");
  }

  private async externalBinding(tx: Prisma.TransactionClient, departmentId: string, assignment?: ExaminationCommitteeAssignment) {
    if (!assignment) return null;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM external_comprehensive_access WHERE assignment_id=${assignment.id}
      AND department_id=${departmentId} FOR SHARE`);
    return tx.externalComprehensiveAccess.findFirst({ where: { departmentId, assignmentId: assignment.id,
      assignmentAssignedAt: assignment.assignedAt, revokedAt: null, expiresAt: { gt: new Date() } } });
  }

  private async liveMember(tx: Prisma.TransactionClient, departmentId: string, assignment: ExaminationCommitteeAssignment, userId: string) {
    const role = assignment.seat === "EXTERNAL_MEMBER" ? "comprehensive_external" : "teacher";
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=u.department_id
      JOIN roles r ON r.id=ur.role_id AND r.department_id=ur.department_id
      WHERE u.id=${userId} AND u.department_id=${departmentId} AND u.status='ACTIVE'
      AND u.archived_at IS NULL AND u.deleted_at IS NULL AND r.code=${role} AND r.archived_at IS NULL
      AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM user_roles x JOIN roles xr ON xr.id=x.role_id
        WHERE x.user_id=u.id AND x.revoked_at IS NULL AND (x.expires_at IS NULL OR x.expires_at>clock_timestamp())
        AND (xr.code='student' OR (${role}='comprehensive_external' AND xr.code<>'comprehensive_external')))
      FOR SHARE OF u,ur,r`);
    if (!rows.length) throw new NotFoundException("Current Committee actor not found");
  }

  private async usableMember(tx: Prisma.TransactionClient, departmentId: string, assignment: ExaminationCommitteeAssignment) {
    const binding = assignment.seat === "EXTERNAL_MEMBER" ? await this.externalBinding(tx, departmentId, assignment) : null;
    const userId = assignment.assignedUserId ?? binding?.userId;
    if (!userId) throw new ConflictException("Required Committee seat lacks current digital access");
    await this.liveMember(tx, departmentId, assignment, userId);
    await this.access.live(tx, { departmentId, actorUserId: userId }, P.MARK);
    return { userId, externalAccessId: binding?.id ?? null };
  }

  private async requiredMembers(tx: Prisma.TransactionClient, a: Authority, mode: string,
    courses: Array<{ assignedCommitteeAssignmentId: string | null; allocatedAssignmentAssignedAt: Date | null }>) {
    this.formalCommittee(a.committee);
    const required = mode === "ALL_MEMBERS_AVERAGE" ? a.committee.assignments : mode === "CHAIRMAN_ONLY" ? [a.assignment] :
      courses.map((c) => a.committee.assignments.find((s) => s.id === c.assignedCommitteeAssignmentId &&
        s.assignedAt.getTime() === c.allocatedAssignmentAssignedAt?.getTime()));
    for (const member of required) {
      if (!member) throw new ConflictException("Course allocation is incomplete or stale");
      await this.usableMember(tx, a.departmentId, member);
    }
  }

  private async validCourses(tx: Prisma.TransactionClient, a: Authority, exam: { id: string; examinationId: string }) {
    const authoritative = await this.examinations.applicableCourses(tx, a.departmentId, exam.examinationId);
    const courses = await tx.comprehensiveCourse.findMany({ where: { comprehensiveId: exam.id, departmentId: a.departmentId } });
    if (courses.length !== authoritative.length || authoritative.some(({ course, component }) => !courses.some((c) =>
      c.examinationCourseId === course.id && c.assessmentComponentId === component.id && c.fullMark.eq(component.maximumMarks) && c.templateVersion === course.assessmentTemplate.versionNumber))) throw new ConflictException("Applicable course/component source changed");
    return courses;
  }

  private async startMarking(tx: Prisma.TransactionClient, a: Authority, exam: Awaited<ReturnType<ComprehensiveExaminationService["workflow"]>>) {
    if (!exam.rosterLockedAt) throw new ConflictException("Establish the certified regular roster first");
    const courses = await this.validCourses(tx, a, exam);
    await this.requiredMembers(tx, a, exam.mode, courses);
    if (exam.status === "CONFIGURED") {
      const started = await tx.comprehensiveExamination.update({ where: { id: exam.id }, data: { status: "MARKING", markingStartedAt: new Date(),
        markingStartedByUserId: a.actorUserId, markingStartedByAssignmentId: a.assignment.id,
        markingStartedByAssignmentAssignedAt: a.assignment.assignedAt, markingStartedExternalAccessId: a.externalAccessId } });
      await this.audit(tx, a, "comprehensive.mode.frozen", exam.id, { comprehensiveId: exam.id, examinationId: exam.examinationId,
        mode: exam.mode, markingStartedAt: started.markingStartedAt!.toISOString(), markingStartedByUserId: started.markingStartedByUserId,
        markingStartedByAssignmentId: started.markingStartedByAssignmentId,
        markingStartedByAssignmentAssignedAt: started.markingStartedByAssignmentAssignedAt!.toISOString(),
        markingStartedExternalAccessId: started.markingStartedExternalAccessId });
      if (exam.mode === "COURSE_DISTRIBUTED") await this.audit(tx, a, "comprehensive.distribution.frozen", exam.id);
    }
  }

  private audit(tx: Prisma.TransactionClient, a: Authority, event: string, id: string, data: Prisma.InputJsonObject = {}) {
    return this.access.audit(tx, a, event, id, { ...data, committeeAssignmentId: a.assignment.id, externalAccessId: a.externalAccessId });
  }
}

function configurationSnapshot(c: ComprehensiveExamination) {
  return { comprehensiveId: c.id, examinationId: c.examinationId, committeeId: c.committeeId, candidateListId: c.candidateListId,
    examDate: c.examDate.toISOString(), mode: c.mode, ruleVersionCode: c.ruleVersionCode, configuredByUserId: c.configuredByUserId,
    configuredAssignmentId: c.configuredAssignmentId, configuredAssignmentAssignedAt: c.configuredAssignmentAssignedAt.toISOString() };
}

function allocationActor(a: Authority) {
  return { allocationChangedByUserId: a.actorUserId, allocationChangedByAssignmentId: a.assignment.id,
    allocationChangedByAssignmentAssignedAt: a.assignment.assignedAt };
}

function allocationSnapshot(courses: ComprehensiveCourse[]) {
  return courses.map((c) => ({ comprehensiveCourseId: c.id, examinationCourseId: c.examinationCourseId,
    assignedCommitteeAssignmentId: c.assignedCommitteeAssignmentId, allocatedAssignmentAssignedAt: c.allocatedAssignmentAssignedAt?.toISOString() ?? null,
    allocationChangedByUserId: c.allocationChangedByUserId, allocationChangedByAssignmentId: c.allocationChangedByAssignmentId,
    allocationChangedByAssignmentAssignedAt: c.allocationChangedByAssignmentAssignedAt?.toISOString() ?? null,
  })).sort((a, b) => compareId(a.examinationCourseId, b.examinationCourseId) || compareId(a.comprehensiveCourseId, b.comprehensiveCourseId));
}

function compareId(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
