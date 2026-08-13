import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";

import type {
  CurriculumVersionLifecycleAction,
  TransitionCurriculumVersionInput,
} from "../../application/ports/academic.repository.port";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

interface LifecycleState {
  id: string;
  departmentId: string;
  academicProgramId: string;
  code: string;
  name: string;
  status: AcademicVersionStatus;
  effectiveAcademicSessionCode: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  academicProgram: { id: string; departmentId: string };
}

type ConditionalMiss =
  | "target"
  | "malformed-target"
  | "unexpected"
  | "missing";

const originalApproval = new Date("2026-08-01T00:00:00.000Z");
const transitionAt = new Date("2026-08-13T10:30:00.000Z");

function createState(status: AcademicVersionStatus): LifecycleState {
  return {
    id: "version-a",
    departmentId: "department-a",
    academicProgramId: "program-a",
    code: "CURR-1",
    name: "Curriculum 1",
    status,
    effectiveAcademicSessionCode: "2026-2027",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    approvedAt:
      status === AcademicVersionStatus.DRAFT ? null : originalApproval,
    archivedAt:
      status === AcademicVersionStatus.ARCHIVED
        ? new Date("2026-08-12T00:00:00.000Z")
        : null,
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    academicProgram: { id: "program-a", departmentId: "department-a" },
  };
}

function input(
  action: CurriculumVersionLifecycleAction,
  overrides: Partial<TransitionCurriculumVersionInput> = {},
): TransitionCurriculumVersionInput {
  return {
    departmentId: "department-a",
    curriculumVersionId: "version-a",
    action,
    reason: "Lifecycle authority confirmed",
    ...(action === "APPROVE"
      ? { approvalReference: "Ordinance-2026-17" }
      : {}),
    actorUserId: "admin-a",
    transitionAt,
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test",
    ...overrides,
  };
}

function harness(
  initialStatus: AcademicVersionStatus,
  options: {
    conditionalMiss?: ConditionalMiss;
    failAudit?: boolean;
    malformedPostTransition?: boolean;
  } = {},
) {
  let state: LifecycleState | null = createState(initialStatus);
  const audits: Array<{ data: Record<string, unknown> }> = [];
  const updates: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  let missApplied = false;
  let postTransitionMalformed = false;

  const tx = {
    curriculumVersion: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        if (
          !state ||
          args.where.id !== state.id ||
          args.where.departmentId !== state.departmentId
        ) {
          return null;
        }
        if (
          options.malformedPostTransition &&
          updates.length > 0 &&
          !postTransitionMalformed
        ) {
          postTransitionMalformed = true;
          state = { ...state, approvedAt: null };
        }
        return state;
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updates.push(args);
        if (options.conditionalMiss && !missApplied) {
          missApplied = true;
          if (options.conditionalMiss === "missing") {
            state = null;
          } else if (state) {
            state = {
              ...state,
              status:
                options.conditionalMiss === "target" ||
                options.conditionalMiss === "malformed-target"
                  ? (args.data.status as AcademicVersionStatus)
                  : AcademicVersionStatus.RETIRED,
              approvedAt:
                options.conditionalMiss === "malformed-target"
                  ? null
                  : "approvedAt" in args.data
                    ? (args.data.approvedAt as Date)
                    : state.approvedAt,
              archivedAt:
                (options.conditionalMiss === "target" ||
                  options.conditionalMiss === "malformed-target") &&
                "archivedAt" in args.data
                  ? (args.data.archivedAt as Date)
                  : state.archivedAt,
              updatedAt: transitionAt,
            };
          }
          return { count: 0 };
        }

        const approvedAtPredicateMatches =
          args.where.approvedAt === null
            ? state?.approvedAt === null
            : typeof args.where.approvedAt === "object" &&
                args.where.approvedAt !== null &&
                "not" in args.where.approvedAt
              ? state?.approvedAt !== null
              : true;

        if (
          !state ||
          state.status !== args.where.status ||
          !approvedAtPredicateMatches ||
          state.archivedAt !== null ||
          state.departmentId !== args.where.departmentId
        ) {
          return { count: 0 };
        }

        state = {
          ...state,
          ...args.data,
          updatedAt: transitionAt,
        } as LifecycleState;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (options.failAudit) {
          throw new Error("AUDIT_WRITE_FAILED");
        }
        audits.push(args);
        return { id: "audit-a" };
      },
    },
  };

  const prisma = {
    async $transaction<T>(callback: (client: typeof tx) => Promise<T>) {
      const before = state
        ? { ...state, academicProgram: { ...state.academicProgram } }
        : null;
      const auditCount = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        state = before;
        audits.splice(auditCount);
        throw error;
      }
    },
  };

  return {
    repository: new PrismaAcademicRepository(prisma as never),
    audits,
    updates,
    getState: () => state,
    setProgramDepartment: (departmentId: string) => {
      if (state) state.academicProgram.departmentId = departmentId;
    },
    setTimestamps: (timestamps: {
      approvedAt?: Date | null;
      archivedAt?: Date | null;
    }) => {
      if (state) Object.assign(state, timestamps);
    },
  };
}

const positiveCases = [
  {
    action: "APPROVE",
    from: AcademicVersionStatus.DRAFT,
    to: AcademicVersionStatus.APPROVED,
    event: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_APPROVED,
  },
  {
    action: "ACTIVATE",
    from: AcademicVersionStatus.APPROVED,
    to: AcademicVersionStatus.ACTIVE,
    event: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_ACTIVATED,
  },
  {
    action: "RETIRE",
    from: AcademicVersionStatus.ACTIVE,
    to: AcademicVersionStatus.RETIRED,
    event: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_RETIRED,
  },
  {
    action: "ARCHIVE",
    from: AcademicVersionStatus.RETIRED,
    to: AcademicVersionStatus.ARCHIVED,
    event: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_ARCHIVED,
  },
] as const;

for (const lifecycleCase of positiveCases) {
  test(lifecycleCase.from + " -> " + lifecycleCase.to + " mutates and audits atomically", async () => {
    const h = harness(lifecycleCase.from);
    const before = h.getState()!;
    const approvedAtBefore = before.approvedAt;
    const effectiveFromBefore = before.effectiveFrom;
    const effectiveToBefore = before.effectiveTo;

    const result = await h.repository.transitionCurriculumVersion(
      input(lifecycleCase.action),
    );

    assert.equal(result.outcome, "TRANSITIONED");
    if (result.outcome !== "TRANSITIONED") return;
    assert.equal(result.curriculumVersion.status, lifecycleCase.to);
    assert.equal(h.getState()!.status, lifecycleCase.to);
    assert.equal(h.getState()!.effectiveFrom, effectiveFromBefore);
    assert.equal(h.getState()!.effectiveTo, effectiveToBefore);
    assert.equal(h.audits.length, 1);
    assert.equal(h.audits[0]!.data.action, lifecycleCase.event);
    assert.equal(h.audits[0]!.data.actorUserId, "admin-a");
    assert.equal(h.audits[0]!.data.departmentId, "department-a");
    assert.equal(h.audits[0]!.data.occurredAt, transitionAt);

    const context = h.audits[0]!.data.contextJson as Record<string, unknown>;
    assert.equal(context.curriculumVersionId, "version-a");
    assert.equal(context.academicProgramId, "program-a");
    assert.equal(context.previousStatus, lifecycleCase.from);
    assert.equal(context.newStatus, lifecycleCase.to);
    assert.equal(context.reason, "Lifecycle authority confirmed");
    assert.equal(context.actorUserId, "admin-a");
    assert.equal(context.departmentId, "department-a");
    assert.equal(context.transitionTimestamp, transitionAt.toISOString());

    if (lifecycleCase.action === "APPROVE") {
      assert.equal(h.getState()!.approvedAt, transitionAt);
      assert.equal(context.approvalReference, "Ordinance-2026-17");
      assert.equal(h.updates[0]!.where.approvedAt, null);
    } else {
      assert.equal(h.getState()!.approvedAt, approvedAtBefore);
      assert.equal("approvedAt" in h.updates[0]!.data, false);
      assert.deepEqual(h.updates[0]!.where.approvedAt, { not: null });
    }
    if (lifecycleCase.action === "ARCHIVE") {
      assert.equal(h.getState()!.archivedAt, transitionAt);
    } else {
      assert.equal(h.getState()!.archivedAt, null);
      assert.equal("archivedAt" in h.updates[0]!.data, false);
    }
    assert.equal("effectiveFrom" in h.updates[0]!.data, false);
    assert.equal("effectiveTo" in h.updates[0]!.data, false);
  });
}

for (const lifecycleCase of positiveCases) {
  test(lifecycleCase.action + " is idempotent at its exact target without duplicate audit", async () => {
    const h = harness(lifecycleCase.to);
    const result = await h.repository.transitionCurriculumVersion(
      input(lifecycleCase.action),
    );

    assert.equal(result.outcome, "ALREADY_TARGET");
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  });
}

test("skipped, backward, and archived transitions fail closed without mutation or audit", async () => {
  const invalidCases: Array<[AcademicVersionStatus, CurriculumVersionLifecycleAction]> = [
    [AcademicVersionStatus.DRAFT, "ACTIVATE"],
    [AcademicVersionStatus.DRAFT, "RETIRE"],
    [AcademicVersionStatus.APPROVED, "ARCHIVE"],
    [AcademicVersionStatus.ACTIVE, "APPROVE"],
    [AcademicVersionStatus.ACTIVE, "ARCHIVE"],
    [AcademicVersionStatus.RETIRED, "ACTIVATE"],
    [AcademicVersionStatus.ARCHIVED, "ACTIVATE"],
    [AcademicVersionStatus.ARCHIVED, "APPROVE"],
  ];

  for (const [status, action] of invalidCases) {
    const h = harness(status);
    const before = h.getState()!.status;
    const result = await h.repository.transitionCurriculumVersion(input(action));
    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.equal(h.getState()!.status, before);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("wrong-department ID uses safe not-found behavior", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  const result = await h.repository.transitionCurriculumVersion(
    input("APPROVE", { departmentId: "department-b" }),
  );

  assert.equal(result.outcome, "CURRICULUM_VERSION_NOT_FOUND");
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("malformed CurriculumVersion AcademicProgram department dependency fails closed", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  h.setProgramDepartment("department-b");
  const result = await h.repository.transitionCurriculumVersion(input("APPROVE"));

  assert.equal(result.outcome, "DEPENDENCY_SCOPE_MISMATCH");
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("DRAFT with approvedAt cannot be approved or have approvedAt overwritten", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  const malformedApproval = new Date("2026-07-01T00:00:00.000Z");
  h.setTimestamps({ approvedAt: malformedApproval });

  const result = await h.repository.transitionCurriculumVersion(
    input("APPROVE"),
  );

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.DRAFT);
  assert.equal(h.getState()!.approvedAt, malformedApproval);
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("APPROVED without approvedAt cannot activate or be an idempotent APPROVE target", async () => {
  for (const action of ["ACTIVATE", "APPROVE"] as const) {
    const h = harness(AcademicVersionStatus.APPROVED);
    h.setTimestamps({ approvedAt: null });

    const result = await h.repository.transitionCurriculumVersion(input(action));

    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.equal(h.getState()!.status, AcademicVersionStatus.APPROVED);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("ACTIVE without approvedAt cannot retire or be an idempotent ACTIVATE target", async () => {
  for (const action of ["RETIRE", "ACTIVATE"] as const) {
    const h = harness(AcademicVersionStatus.ACTIVE);
    h.setTimestamps({ approvedAt: null });

    const result = await h.repository.transitionCurriculumVersion(input(action));

    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.equal(h.getState()!.status, AcademicVersionStatus.ACTIVE);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("RETIRED without approvedAt cannot archive", async () => {
  const h = harness(AcademicVersionStatus.RETIRED);
  h.setTimestamps({ approvedAt: null });

  const result = await h.repository.transitionCurriculumVersion(
    input("ARCHIVE"),
  );

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.RETIRED);
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("ARCHIVED without approvedAt is not an idempotent ARCHIVE target", async () => {
  const h = harness(AcademicVersionStatus.ARCHIVED);
  h.setTimestamps({ approvedAt: null });

  const result = await h.repository.transitionCurriculumVersion(
    input("ARCHIVE"),
  );

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.ARCHIVED);
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("conditional-update miss at exact target is an unaudited idempotent success", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "target",
  });
  const result = await h.repository.transitionCurriculumVersion(input("ACTIVATE"));

  assert.equal(result.outcome, "ALREADY_TARGET");
  assert.equal(h.getState()!.status, AcademicVersionStatus.ACTIVE);
  assert.equal(h.audits.length, 0);
});

test("conditional-update miss reread rejects malformed target timestamps", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "malformed-target",
  });
  const result = await h.repository.transitionCurriculumVersion(input("ACTIVATE"));

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.ACTIVE);
  assert.equal(h.getState()!.approvedAt, null);
  assert.equal(h.audits.length, 0);
});

test("malformed post-transition reread rolls back without a success audit", async () => {
  const h = harness(AcademicVersionStatus.DRAFT, {
    malformedPostTransition: true,
  });

  const result = await h.repository.transitionCurriculumVersion(
    input("APPROVE"),
  );

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.DRAFT);
  assert.equal(h.getState()!.approvedAt, null);
  assert.equal(h.audits.length, 0);
});

test("conditional-update miss at an unexpected state fails closed", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "unexpected",
  });
  const result = await h.repository.transitionCurriculumVersion(input("ACTIVATE"));

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.audits.length, 0);
});

test("conditional-update miss after scoped disappearance returns safe not-found", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "missing",
  });
  const result = await h.repository.transitionCurriculumVersion(input("ACTIVATE"));

  assert.equal(result.outcome, "CURRICULUM_VERSION_NOT_FOUND");
  assert.equal(h.audits.length, 0);
});

test("audit write failure rolls the status mutation back with the transaction", async () => {
  const h = harness(AcademicVersionStatus.DRAFT, { failAudit: true });

  await assert.rejects(
    h.repository.transitionCurriculumVersion(input("APPROVE")),
    /AUDIT_WRITE_FAILED/,
  );
  assert.equal(h.getState()!.status, AcademicVersionStatus.DRAFT);
  assert.equal(h.getState()!.approvedAt, null);
  assert.equal(h.audits.length, 0);
});
