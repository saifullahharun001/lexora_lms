import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

type Assignment = ReturnType<typeof assignmentRecord>;

function assignmentRecord(curriculumVersionId = "version-a") {
  return {
    id: "assignment-a",
    departmentId: "department-a",
    studentUserId: "student-a",
    academicProgramId: "program-a",
    curriculumVersionId,
    assignedByUserId: "admin-original",
    assignedAt: new Date("2026-08-09T10:00:00.000Z"),
    createdAt: new Date("2026-08-09T10:00:00.000Z"),
    studentUser: {
      id: "student-a",
      departmentId: "department-a",
    },
    assignedByUser: {
      id: "admin-original",
      departmentId: "department-a",
    },
    academicProgram: {
      id: "program-a",
      departmentId: "department-a",
      code: "LLB",
      name: "Bachelor of Laws",
    },
    curriculumVersion: {
      id: curriculumVersionId,
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "LLB-2025",
      name: "LL.B. 2025",
      status: "APPROVED",
      effectiveAcademicSessionCode: "2025-2026",
    },
  };
}

function uniqueError(target: unknown = [
  "department_id",
  "student_user_id",
  "academic_program_id",
]) {
  return new PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

function harness() {
  let assignment: Assignment | null = null;
  let audits: unknown[] = [];
  let studentDepartmentId = "department-a";
  let studentHasRole = true;
  let programDepartmentId = "department-a";
  let programStatus = "ACTIVE";
  let versionDepartmentId = "department-a";
  let versionProgramId = "program-a";
  let versionRelationDepartmentId = "department-a";
  let versionStatus = "APPROVED";
  let versionArchivedAt: Date | null = null;
  let auditFails = false;
  let createError: unknown;
  let raceWinnerVersionId: string | null = null;
  let raceUniqueTarget: unknown = [
    "department_id",
    "student_user_id",
    "academic_program_id",
  ];
  let mutateRaceWinner: ((value: Assignment) => void) | undefined;
  const queries: unknown[] = [];

  const findAssignment = () => assignment;
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      let workingAssignment = assignment ? structuredClone(assignment) : null;
      const workingAudits = structuredClone(audits);
      const tx = {
        studentCurriculumAssignment: {
          findUnique: async () => workingAssignment,
          create: async () => {
            if (raceWinnerVersionId) {
              assignment = assignmentRecord(raceWinnerVersionId);
              mutateRaceWinner?.(assignment);
              audits = [{ concurrentWinner: raceWinnerVersionId }];
              throw uniqueError(raceUniqueTarget);
            }
            if (createError) throw createError;
            workingAssignment = assignmentRecord("version-a");
            workingAssignment.assignedByUserId = "admin-a";
            workingAssignment.assignedByUser.id = "admin-a";
            return workingAssignment;
          },
        },
        user: {
          findFirst: async (args: unknown) => {
            queries.push(args);
            return studentDepartmentId === "department-a" && studentHasRole
              ? { id: "student-a" }
              : null;
          },
        },
        academicProgram: {
          findFirst: async (args: unknown) => {
            queries.push(args);
            return programDepartmentId === "department-a" && programStatus === "ACTIVE"
              ? { id: "program-a", departmentId: programDepartmentId }
              : null;
          },
        },
        curriculumVersion: {
          findFirst: async (args: unknown) => {
            queries.push(args);
            return versionDepartmentId === "department-a" && versionProgramId === "program-a"
              ? {
                  id: "version-a",
                  departmentId: versionDepartmentId,
                  academicProgramId: versionProgramId,
                  status: versionStatus,
                  archivedAt: versionArchivedAt,
                  academicProgram: {
                    id: versionProgramId,
                    departmentId: versionRelationDepartmentId,
                  },
                }
              : null;
          },
        },
        auditLog: {
          create: async (entry: unknown) => {
            if (auditFails) throw new Error("audit unavailable");
            workingAudits.push(entry);
            return entry;
          },
        },
      };

      const result = await callback(tx);
      assignment = workingAssignment;
      audits = workingAudits;
      return result;
    },
    studentCurriculumAssignment: {
      findUnique: async () => findAssignment(),
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);
  const create = (curriculumVersionId = "version-a") =>
    repository.createStudentCurriculumAssignment({
      departmentId: "department-a",
      studentUserId: "student-a",
      academicProgramId: "program-a",
      curriculumVersionId,
      actorUserId: "admin-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    });

  return {
    create,
    getAssignment: () => assignment,
    getAudits: () => audits,
    getQueries: () => queries,
    setExisting: (value: Assignment) => (assignment = value),
    setStudentDepartment: (value: string) => (studentDepartmentId = value),
    setStudentRole: (value: boolean) => (studentHasRole = value),
    setProgramDepartment: (value: string) => (programDepartmentId = value),
    setProgramStatus: (value: string) => (programStatus = value),
    setVersionDepartment: (value: string) => (versionDepartmentId = value),
    setVersionProgram: (value: string) => (versionProgramId = value),
    setVersionRelationDepartment: (value: string) =>
      (versionRelationDepartmentId = value),
    setVersionStatus: (value: string) => (versionStatus = value),
    setVersionArchived: () => (versionArchivedAt = new Date()),
    failAudit: () => (auditFails = true),
    failCreate: (error: unknown) => (createError = error),
    setRaceWinner: (
      value: string,
      target?: unknown,
      mutate?: (assignment: Assignment) => void,
    ) => {
      raceWinnerVersionId = value;
      if (target !== undefined) raceUniqueTarget = target;
      mutateRaceWinner = mutate;
    },
  };
}

test("first assignment validates authoritative targets and writes one transactional audit", async () => {
  const h = harness();
  const result = await h.create();
  assert.equal(result.outcome, "CREATED");
  assert.equal(h.getAssignment()?.curriculumVersionId, "version-a");
  assert.equal(h.getAssignment()?.assignedByUserId, "admin-a");
  assert.equal(h.getAudits().length, 1);

  const audit = h.getAudits()[0] as { data: Record<string, unknown> };
  assert.equal(audit.data.action, ACADEMIC_AUDIT_EVENTS.STUDENT_CURRICULUM_ASSIGNED);
  assert.equal(audit.data.departmentId, "department-a");
  assert.equal(audit.data.actorUserId, "admin-a");
  assert.equal(audit.data.targetType, "student_curriculum_assignment");
  assert.deepEqual(audit.data.contextJson, {
    studentCurriculumAssignmentId: "assignment-a",
    studentUserId: "student-a",
    academicProgramId: "program-a",
    curriculumVersionId: "version-a",
  });

  const studentQuery = h.getQueries()[0] as {
    where: {
      departmentId: string;
      status: string;
      archivedAt: null;
      deletedAt: null;
      department: unknown;
      userRoles: {
        some: {
          departmentId: string;
          revokedAt: null;
          OR: Array<{ expiresAt: null | { gt: Date } }>;
          role: unknown;
        };
      };
    };
  };
  assert.equal(studentQuery.where.departmentId, "department-a");
  assert.equal(studentQuery.where.status, "ACTIVE");
  assert.equal(studentQuery.where.archivedAt, null);
  assert.equal(studentQuery.where.deletedAt, null);
  assert.deepEqual(studentQuery.where.department, {
    id: "department-a",
    status: "ACTIVE",
    archivedAt: null,
    deletedAt: null,
  });
  const roleAssignment = studentQuery.where.userRoles.some;
  assert.equal(roleAssignment.departmentId, "department-a");
  assert.equal(roleAssignment.revokedAt, null);
  assert.equal(roleAssignment.OR[0]?.expiresAt, null);
  assert.ok(
    (roleAssignment.OR[1]?.expiresAt as { gt: Date }).gt instanceof Date,
  );
  assert.deepEqual(roleAssignment.role, {
    code: "student",
    departmentId: "department-a",
    archivedAt: null,
  });
});

test("same target is idempotent and preserves immutable creator and timestamps", async () => {
  const h = harness();
  const original = assignmentRecord();
  h.setExisting(original);
  const result = await h.create();
  assert.equal(result.outcome, "ALREADY_ASSIGNED");
  assert.equal(h.getAssignment()?.assignedByUserId, "admin-original");
  assert.deepEqual(h.getAssignment()?.assignedAt, original.assignedAt);
  assert.deepEqual(h.getAssignment()?.createdAt, original.createdAt);
  assert.equal(h.getAudits().length, 0);
});

test("different target conflicts without mutation or audit", async () => {
  const h = harness();
  const original = assignmentRecord();
  h.setExisting(original);
  const result = await h.create("version-b");
  assert.equal(result.outcome, "ASSIGNMENT_CONFLICT");
  assert.deepEqual(h.getAssignment(), original);
  assert.equal(h.getAudits().length, 0);
});

test("malformed existing User relation identity fails closed without mutation or audit", async () => {
  const variants = [
    (value: Assignment) => (value.studentUser.departmentId = "department-b"),
    (value: Assignment) =>
      (value.assignedByUser.departmentId = "department-b"),
    (value: Assignment) => (value.studentUser.id = "student-other"),
    (value: Assignment) => (value.assignedByUser.id = "admin-other"),
  ];

  for (const mutate of variants) {
    const h = harness();
    const malformed = assignmentRecord();
    mutate(malformed);
    h.setExisting(malformed);
    assert.equal(
      (await h.create()).outcome,
      "DEPENDENCY_SCOPE_MISMATCH",
    );
    assert.deepEqual(h.getAssignment(), malformed);
    assert.equal(h.getAudits().length, 0);
  }
});

test("student role and tenant failures are safely not found", async () => {
  const crossDepartment = harness();
  crossDepartment.setStudentDepartment("department-b");
  assert.equal((await crossDepartment.create()).outcome, "STUDENT_NOT_FOUND");
  assert.equal(crossDepartment.getAudits().length, 0);

  const noRole = harness();
  noRole.setStudentRole(false);
  assert.equal((await noRole.create()).outcome, "STUDENT_NOT_FOUND");
  assert.equal(noRole.getAudits().length, 0);
});

test("programme and version tenant/programme mismatches fail safely", async () => {
  const crossProgram = harness();
  crossProgram.setProgramDepartment("department-b");
  assert.equal(
    (await crossProgram.create()).outcome,
    "ACADEMIC_PROGRAM_NOT_FOUND",
  );

  const inactiveProgram = harness();
  inactiveProgram.setProgramStatus("ARCHIVED");
  assert.equal(
    (await inactiveProgram.create()).outcome,
    "ACADEMIC_PROGRAM_NOT_FOUND",
  );

  for (const configure of [
    (h: ReturnType<typeof harness>) => h.setVersionDepartment("department-b"),
    (h: ReturnType<typeof harness>) => h.setVersionProgram("program-b"),
  ]) {
    const h = harness();
    configure(h);
    assert.equal(
      (await h.create()).outcome,
      "CURRICULUM_VERSION_NOT_FOUND",
    );
    assert.equal(h.getAudits().length, 0);
  }

  const corruptRelation = harness();
  corruptRelation.setVersionRelationDepartment("department-b");
  assert.equal(
    (await corruptRelation.create()).outcome,
    "DEPENDENCY_SCOPE_MISMATCH",
  );
});

test("only APPROVED and ACTIVE versions are assignable and unknown statuses fail closed", async () => {
  for (const status of ["APPROVED", "ACTIVE"]) {
    const h = harness();
    h.setVersionStatus(status);
    assert.equal((await h.create()).outcome, "CREATED");
  }

  for (const status of ["DRAFT", "RETIRED", "ARCHIVED", "FUTURE_STATUS"]) {
    const h = harness();
    h.setVersionStatus(status);
    assert.equal(
      (await h.create()).outcome,
      "INACTIVE_CURRICULUM_VERSION",
    );
    assert.equal(h.getAudits().length, 0);
  }

  const archived = harness();
  archived.setVersionArchived();
  assert.equal(
    (await archived.create()).outcome,
    "INACTIVE_CURRICULUM_VERSION",
  );
});

test("same-target and different-target unique races re-read authoritative state", async () => {
  const same = harness();
  same.setRaceWinner("version-a");
  assert.equal((await same.create()).outcome, "ALREADY_ASSIGNED");
  assert.equal(same.getAudits().length, 1);

  const different = harness();
  different.setRaceWinner("version-b");
  assert.equal((await different.create()).outcome, "ASSIGNMENT_CONFLICT");
  assert.equal(different.getAssignment()?.curriculumVersionId, "version-b");
  assert.equal(different.getAudits().length, 1);
});

test("P2002 race re-read rejects malformed cross-department User relations", async () => {
  for (const mutate of [
    (value: Assignment) => (value.studentUser.departmentId = "department-b"),
    (value: Assignment) =>
      (value.assignedByUser.departmentId = "department-b"),
  ]) {
    const h = harness();
    h.setRaceWinner("version-a", undefined, mutate);
    await assert.rejects(h.create(), (error) => error instanceof PrismaClientKnownRequestError);
    assert.equal(h.getAudits().length, 1);
  }
});

test("P2002 matcher accepts only exact assignment constraint targets", async () => {
  const acceptedTargets: unknown[] = [
    ["department_id", "student_user_id", "academic_program_id"],
    ["academicProgramId", "departmentId", "studentUserId"],
    "student_curriculum_assignment_dept_student_program_uq",
  ];
  for (const target of acceptedTargets) {
    const h = harness();
    h.setRaceWinner("version-a", target);
    assert.equal((await h.create()).outcome, "ALREADY_ASSIGNED");
  }

  const rejectedTargets: unknown[] = [
    ["unrelated_column"],
    [
      "department_id",
      "student_user_id",
      "academic_program_id",
      "extra_column",
    ],
    "prefix_student_curriculum_assignment_dept_student_program_uq_suffix",
  ];
  for (const target of rejectedTargets) {
    const h = harness();
    h.setRaceWinner("version-a", target);
    await assert.rejects(h.create(), (error) => error instanceof PrismaClientKnownRequestError);
  }
});

test("unrelated Prisma errors are not mapped to idempotence", async () => {
  const h = harness();
  const error = new PrismaClientKnownRequestError("Foreign key failed", {
    code: "P2003",
    clientVersion: "test",
  });
  h.failCreate(error);
  await assert.rejects(h.create(), (caught) => caught === error);

  const unrelatedUnique = harness();
  const unique = uniqueError(["unrelated_column"]);
  unrelatedUnique.failCreate(unique);
  await assert.rejects(unrelatedUnique.create(), (caught) => caught === unique);
});

test("audit failure rolls back the assignment", async () => {
  const h = harness();
  h.failAudit();
  await assert.rejects(h.create(), /audit unavailable/);
  assert.equal(h.getAssignment(), null);
  assert.equal(h.getAudits().length, 0);
});
