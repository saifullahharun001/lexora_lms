import assert from "node:assert/strict";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrincipalContext } from "@lexora/types";
import { EvidenceAccessService } from "@/common/academic-evidence/evidence-access.service";
import { EXAMINATION_POLICIES as P, EXAMINATION_PERMISSION_DEFINITIONS } from "@/common/authorization/examination-policies";
import { ComprehensiveExaminationService } from "../assessment/application/services/comprehensive-examination.service";
import { ExaminationRegistrationService } from "./examination-registration.service";
import { ExaminationAuthorityService } from "./examination-authority.service";

// Service-level serializable transaction double. It models rollback and mutex ordering,
// not PostgreSQL's implementation; database enforcement has a separate opt-in suite.
export function workflowHarness() {
  const tables = ["examination", "examinationCandidateList", "examinationCandidateRegistration", "examinationCandidateCourse",
    "comprehensiveExamination", "comprehensiveCourse", "comprehensiveRosterEntry", "comprehensiveMark", "comprehensiveMarkReturn",
    "comprehensiveAbsence", "comprehensiveFinalisation", "comprehensiveFinalResult", "comprehensiveFinalSource", "externalComprehensiveAccess",
    "poeChairmanAssignment", "user", "userRole", "role", "permission", "rolePermission", "auditLog"];
  const state: Record<string, any[]> = Object.fromEntries(tables.map((t) => [t, []]));
  const epoch = new Date("2026-01-01T00:00:00Z");
  const flags = { auditFailure: false, stalePoe: false, wrongAcademicIdentity: false, foreignComponent: false, roleRevoked: false,
    failAfterSources: false, expiredExternal: false, missingLivePermission: false };
  let principal: PrincipalContext;
  const assignments: any[] = ["CHAIRMAN", "MEMBER_1", "MEMBER_2", "EXTERNAL_MEMBER"].map((seat) => ({ id: `appointment-${seat}`,
    departmentId: "law", examinationId: "exam", committeeId: "committee", seat, status: "ACTIVE", assignedAt: epoch,
    assignedUserId: seat === "EXTERNAL_MEMBER" ? null : seat, expiresAt: null, archivedAt: null, unassignedAt: null,
    externalMemberName: seat === "EXTERNAL_MEMBER" ? "Formal external" : null, externalMemberAffiliation: seat === "EXTERNAL_MEMBER" ? "University" : null }));
  state.externalComprehensiveAccess!.push({ id: "access", departmentId: "law", assignmentId: "appointment-EXTERNAL_MEMBER", userId: "EXTERNAL_MEMBER",
    expiresAt: new Date("2099-01-01"), assignmentAssignedAt: epoch, revokedAt: null });
  state.examination!.push({ id: "exam", departmentId: "law", academicProgramId: "program", academicSessionId: "session", academicTermId: "term", ruleVersionCode: "LLB_2025" });
  state.poeChairmanAssignment!.push({ id: "poe-appointment", departmentId: "law", userId: "poe", revokedAt: null, startsAt: epoch, expiresAt: new Date("2099-01-01") });
  const sourceCourses = ["ec-1", "ec-2"].map((id) => ({ course: { ...state.examination![0], id, examinationId: "exam", courseOfferingId: `offering-${id}`,
    curriculumVersionId: "curriculum", curriculumCourseId: `curriculum-${id}`, syllabusVersionId: `syllabus-${id}`,
    assessmentTemplateId: "template", assessmentTemplate: { versionNumber: 1 }, ruleVersionCode: "LLB_2025" },
    component: { id: `component-${id}`, maximumMarks: new Prisma.Decimal(5) } }));
  const currentCourses = (student: string) => sourceCourses.map(({ course }) => ({ examinationCourseId: course.id, enrollmentId: `enrollment-${student}-${course.id}` }));
  const studentAcademicSources = new Map<string, { curriculumAssignmentId: string;
    courses: Array<{ examinationCourseId: string; enrollmentId: string }> }>();

  function as(actor: string, policies?: string[], dept = "law") {
    const role = actor === "poe" ? "poe_chairman" : actor === "EXTERNAL_MEMBER" ? "comprehensive_external" :
      actor === "admin" ? "department_admin" : actor === "student" ? "student" : "teacher";
    const allowed = policies ?? (actor === "poe" ? [P.CLASSIFY] : actor === "admin" ? [P.APPOINT] : actor === "EXTERNAL_MEMBER" ? [P.MARK, P.READ] : actor === "student" ? [] : [P.MARK, P.READ, P.CONFIGURE, P.REVIEW, P.FINALISE]);
    principal = { actorId: actor, actorType: "user", isAuthenticated: true, activeDepartmentId: dept,
      roleAssignments: [{ departmentId: dept, userRoleId: "ur", roleId: "role", role }], permissions: allowed.map((policy) => {
        const d = EXAMINATION_PERMISSION_DEFINITIONS.find((v) => `${v.resource}.${v.action}` === policy)!;
        return { resource: d.resource, action: d.action, scope: "department", source: { departmentId: dept, userRoleId: "ur", roleId: "role" } };
      }) };
  }
  as("CHAIRMAN");
  function clone(v: any): any {
    if (v instanceof Date) return new Date(v);
    if (Prisma.Decimal.isDecimal(v)) return new Prisma.Decimal(v);
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, clone(val)]));
    return v;
  }
  function matches(row: any, where: any): boolean {
    return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
      if (value === undefined) return true;
      if (key === "OR") return value.some((v: any) => matches(row, v));
      if (key === "AND") return value.every((v: any) => matches(row, v));
      if (key === "role") return matches(row.role ?? state.role!.find((r) => r.id === row.roleId) ?? {}, value);
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("gt" in value) return row[key] > value.gt;
        if ("lte" in value) return row[key] <= value.lte;
        return matches(row[key] ?? row, value);
      }
      return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
    });
  }
  const relation: Record<string, Record<string, [string, string, string, boolean]>> = {
    examinationCandidateList: { ExaminationCandidateRegistration_list: ["examinationCandidateRegistration", "id", "listId", true] },
    examinationCandidateRegistration: { list: ["examinationCandidateList", "listId", "id", false], ExaminationCandidateCourse_registration: ["examinationCandidateCourse", "id", "registrationId", true] },
    comprehensiveRosterEntry: { course: ["comprehensiveCourse", "courseId", "id", false], registration: ["examinationCandidateRegistration", "registrationId", "id", false], candidateCourse: ["examinationCandidateCourse", "candidateCourseId", "id", false] },
    comprehensiveMark: { rosterEntry: ["comprehensiveRosterEntry", "rosterEntryId", "id", false], ComprehensiveMarkReturn_mark: ["comprehensiveMarkReturn", "id", "markId", true] },
    comprehensiveFinalisation: { ComprehensiveFinalResult_finalisation: ["comprehensiveFinalResult", "id", "finalisationId", true] },
    comprehensiveFinalResult: { rosterEntry: ["comprehensiveRosterEntry", "rosterEntryId", "id", false], ComprehensiveFinalSource_result: ["comprehensiveFinalSource", "id", "resultId", true] },
    comprehensiveFinalSource: { mark: ["comprehensiveMark", "markId", "id", false] },
    rolePermission: { permission: ["permission", "permissionId", "id", false] },
  };
  function included(model: string, row: any, include: any): any {
    if (!row) return null;
    const result = { ...row };
    for (const [name, spec] of Object.entries(include ?? {}) as Array<[string, any]>) {
      const r = relation[model]?.[name];
      if (!r) throw new Error(`Unmodelled include ${model}.${name}`);
      const [target, from, to, many] = r;
      const children = state[target]!.filter((v) => v[to] === row[from] && matches(v, spec.where)).map((v) => included(target, v, spec.include));
      result[name] = many ? children : children[0] ?? null;
    }
    return result;
  }
  let seq = 0;
  const tx: any = {};
  for (const table of tables) {
    const find = ({ where, orderBy, include }: any = {}) => {
      const rows = state[table]!.filter((r) => matches(r, where));
      const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      rows.sort((a, b) => { for (const o of order) { const [key, direction] = Object.entries(o)[0]!; const d = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (d) return direction === "desc" ? -d : d; } return 0; });
      return rows.map((r) => included(table, r, include));
    };
    tx[table] = {
      findMany: async (q: any) => find(q), findFirst: async (q: any) => find(q)[0] ?? null,
      findFirstOrThrow: async (q: any) => { const found = find(q)[0]; if (!found) throw new NotFoundException(); return found; },
      count: async (q: any) => find(q).length,
      create: async ({ data }: any) => {
        if (table === "auditLog" && flags.auditFailure) throw new Error("required audit unavailable");
        if (table === "comprehensiveFinalSource" && flags.failAfterSources) throw new Error("source storage failed");
        const row = { id: `id-${++seq}`, createdAt: new Date(), version: 1,
          ...(table === "examinationCandidateList" ? { status: "DRAFT", certifiedAt: null, chairmanAssignmentId: null } : {}),
          ...(table === "comprehensiveExamination" ? { status: "CONFIGURED", rosterLockedAt: null, markingStartedAt: null, finalisedAt: null,
            rosterLockedByUserId: null, rosterLockedByAssignmentId: null, rosterLockedByAssignmentAssignedAt: null,
            markingStartedByUserId: null, markingStartedByAssignmentId: null, markingStartedByAssignmentAssignedAt: null, markingStartedExternalAccessId: null } : {}),
          ...(table === "comprehensiveCourse" ? { assignedCommitteeAssignmentId: null, allocatedAssignmentAssignedAt: null,
            allocationChangedByUserId: null, allocationChangedByAssignmentId: null, allocationChangedByAssignmentAssignedAt: null } : {}),
          ...(table === "comprehensiveMark" ? { previousId: null, returnId: null } : {}),
          ...(["poeChairmanAssignment", "externalComprehensiveAccess", "userRole"].includes(table) ? { revokedAt: null } : {}),
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
        state[table]!.push(row); return { ...row };
      },
      createMany: async ({ data }: any) => { for (const row of data) await tx[table].create({ data: row }); return { count: data.length }; },
      update: async ({ where, data }: any) => {
        const row = state[table]!.find((r) => matches(r, where));
        if (!row) throw new Error(`Update missing ${table}`);
        for (const [key, value] of Object.entries(data) as Array<[string, any]>) row[key] = value?.increment ? row[key] + value.increment : value;
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => { const rows = find({ where }); for (const row of rows) await tx[table].update({ where: { id: row.id }, data }); return { count: rows.length }; },
      deleteMany: async ({ where }: any) => { const before = state[table]!.length; state[table] = state[table]!.filter((r) => !matches(r, where)); return { count: before - state[table]!.length }; },
      delete: async ({ where }: any) => { const row = find({ where })[0]; state[table] = state[table]!.filter((r) => !matches(r, where)); return row; },
      upsert: async ({ where, create, update }: any) => {
        const row = find({ where })[0]; return row ? tx[table].update({ where: { id: row.id }, data: update }) : tx[table].create({ data: create });
      },
    };
  }
  const queries: Prisma.Sql[] = [];
  tx.$queryRaw = async (q: Prisma.Sql) => {
    queries.push(q); const sql = q.strings.join("?");
    if (sql.includes("FROM poe_chairman_assignments")) return flags.stalePoe ? [] : state.poeChairmanAssignment!
      .filter((a) => a.departmentId === q.values[0] && a.userId === q.values[1] && !a.revokedAt && a.startsAt <= new Date() && a.expiresAt > new Date())
      .map((a) => ({ id: a.id }));
    if (sql.includes("SELECT ur.id FROM users")) return flags.missingLivePermission || flags.roleRevoked ? [] : [{ id: "ur" }];
    if (sql.includes("SELECT u.id FROM users")) return flags.roleRevoked ? [] : [{ id: "user" }];
    if (sql.includes("external_comprehensive_access")) {
      if (flags.expiredExternal) state.externalComprehensiveAccess![0]!.expiresAt = epoch;
      return [];
    }
    if (sql.includes("FROM departments")) return [{ id: "law" }];
    throw new Error(`Unmodelled SQL ${sql}`);
  };
  let tail = Promise.resolve();
  const prisma: any = { $transaction: (work: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const operation = tail.then(async () => {
      const before = clone(state);
      try { return await work(tx); } catch (error) { for (const table of tables) state[table] = before[table]; throw error; }
    });
    tail = operation.then(() => undefined, () => undefined); return operation;
  } };
  const access = new EvidenceAccessService({ get: () => ({ principal, department: { departmentId: "forged" }, audit: {}, requestId: "req" }) } as any);
  const exams: any = {
    lock: async (_tx: any, department: string, id: string) => { if (id !== "exam" || department !== "law") throw new NotFoundException(); return state.examination![0]; },
    committee: async () => ({ committeeId: "committee", assignments: assignments.filter((a) => a.status === "ACTIVE" && a.assignedAt <= new Date() && !a.archivedAt && !a.unassignedAt && (!a.expiresAt || a.expiresAt > new Date())) }),
    applicableCourses: async () => { if (flags.foreignComponent) throw new ConflictExceptionForHarness(); return sourceCourses; },
  };
  const students: any = { validate: async (_tx: any, dept: string, exam: string, program: string, term: string, student: string, curriculum: string) => {
    const academic = studentAcademicSources.get(student);
    if (flags.wrongAcademicIdentity || dept !== "law" || exam !== "exam" || program !== "program" || term !== "term" || !student.startsWith("student-") || curriculum !== (academic?.curriculumAssignmentId ?? `curriculum-${student}`)) throw new NotFoundException();
    return academic?.courses ?? currentCourses(student);
  } };
  const registration = new ExaminationRegistrationService(prisma, access, exams, students);
  const service = new ComprehensiveExaminationService(prisma, access, exams, registration);
  const authority = new ExaminationAuthorityService(prisma, access, exams, { hash: async () => "NONCREDENTIAL_TEST_HASH" } as any);
  async function ready(mode: "ALL_MEMBERS_AVERAGE" | "COURSE_DISTRIBUTED" | "CHAIRMAN_ONLY" = "ALL_MEMBERS_AVERAGE", lockRoster = true) {
    as("poe"); await registration.createList("exam", "Official POE list reference");
    for (const category of ["REGULAR", "IRREGULAR", "IMPROVEMENT"] as const) {
      const student = `student-${category}`;
      await registration.putCandidate("exam", { studentUserId: student, curriculumAssignmentId: `curriculum-${student}`, category });
    }
    await registration.certify("exam"); as("CHAIRMAN");
    await service.configure("exam", { mode, examDate: "2026-09-21T00:00:00Z" }); if (lockRoster) await service.roster("exam");
    if (mode === "COURSE_DISTRIBUTED") await service.distribute("exam", state.comprehensiveCourse!.map((c, i) => ({ courseId: c.id, committeeAssignmentId: `appointment-${i ? "EXTERNAL_MEMBER" : "MEMBER_1"}` })));
    return state.comprehensiveRosterEntry!;
  }
  async function markAll(mode = state.comprehensiveExamination![0]!.mode) {
    for (const row of state.comprehensiveRosterEntry!) {
      const course = state.comprehensiveCourse!.find((c) => c.id === row.courseId)!;
      const seats = mode === "ALL_MEMBERS_AVERAGE" ? ["CHAIRMAN", "MEMBER_1", "MEMBER_2", "EXTERNAL_MEMBER"] :
        mode === "CHAIRMAN_ONLY" ? ["CHAIRMAN"] : [assignments.find((a) => a.id === course.assignedCommitteeAssignmentId)!.seat];
      for (const [index, seat] of seats.entries()) { as(seat); await service.save("exam", row.id, { mark: `${index + 1}` }, true); }
    }
    as("CHAIRMAN");
  }
  return { service, registration, authority, state, flags, assignments, sourceCourses, studentAcademicSources, tx, access, prisma, queries, as, ready, markAll,
    principal: () => principal };
}
class ConflictExceptionForHarness extends ForbiddenException {}
