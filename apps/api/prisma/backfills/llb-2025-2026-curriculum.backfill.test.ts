import assert from "node:assert/strict";
import test from "node:test";

import { llb20252026CurriculumDefinition as canonical } from "../data/llb-2025-2026-curriculum.definition";
import {
  BackfillConflictError,
  CANONICAL_FINGERPRINT,
  LEGACY_TITLE_TRANSITIONS,
  executeFreshWrites,
  executeAfterRequiredDatabaseExpectation,
  executeWithRequiredAdvisoryLock,
  normalizeAuditReason,
  parseBackfillArguments,
  planCanonicalBackfill,
  sanitizedSummary,
  validateApplyGuard,
  validateOptionalDatabaseExpectation,
  type BackfillPlan,
  type BackfillTargetState,
  type FreshWritePort,
  type ScopedCourseState,
} from "./llb-2025-2026-curriculum.backfill";

const departmentId = "fixture-department";
const programmeId = "fixture-programme";

function makeState(
  options: { fresh?: boolean; legacyTitles?: boolean } = {},
): BackfillTargetState {
  const fresh = options.fresh ?? true;
  const legacyTitles = options.legacyTitles ?? true;
  const courses: ScopedCourseState[] = canonical.courses.map((course) => {
    const transition =
      LEGACY_TITLE_TRANSITIONS[
        course.courseCode as keyof typeof LEGACY_TITLE_TRANSITIONS
      ];
    return {
      id: `course:${course.courseCode}`,
      departmentId,
      academicProgramId: programmeId,
      code: course.courseCode,
      title: legacyTitles && transition ? transition[0] : course.titleSnapshot,
      creditHours: course.credits,
      status: "ACTIVE",
      archivedAt: null,
    };
  });
  courses.push(
    {
      id: "archived-law-101",
      departmentId,
      academicProgramId: programmeId,
      code: "LAW-101",
      title: "Constitutional Law I",
      creditHours: 3,
      status: "ARCHIVED",
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "archived-law-999",
      departmentId,
      academicProgramId: programmeId,
      code: "LAW-999",
      title: "Unassigned Runtime Test Course",
      creditHours: 1,
      status: "ARCHIVED",
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    },
  );
  if (fresh)
    return {
      department: {
        id: departmentId,
        code: "0421",
        status: "ACTIVE",
        archivedAt: null,
        deletedAt: null,
      },
      programme: {
        id: programmeId,
        departmentId,
        code: "LLB",
        status: "ACTIVE",
        archivedAt: null,
      },
      courses,
      curriculumVersions: [],
      templates: [],
      components: [],
      bindings: [],
    };

  const curriculumId = "curriculum:canonical";
  const curriculumVersions = [
    {
      id: curriculumId,
      departmentId,
      academicProgramId: programmeId,
      code: canonical.metadata.curriculumCode,
      name: "LL.B. (Honours) Curriculum 2025-2026",
      description: canonical.metadata.sourceNote,
      status: "DRAFT",
      effectiveAcademicSessionCode: "2025-2026",
      effectiveFrom: null,
      effectiveTo: null,
      durationYears: 4,
      totalSemesters: 8,
      creditsOffered: 140,
      minimumCreditsRequired: 134,
      totalCourses: 58,
      totalProgrammeMarks: 5_800,
      coreCredits: 98,
      gedCredits: 35,
      capstoneCredits: 7,
      coreCourseCount: 42,
      gedCourseCount: 13,
      capstoneCourseCount: 3,
      teachingWeeksPerSemester: 14,
      notionalHoursPerCredit: 40,
      approvedAt: null,
      archivedAt: null,
    },
  ];
  const templates = canonical.assessmentTemplates.map((template) => ({
    id: `template:${template.code}`,
    departmentId,
    academicProgramId: programmeId,
    code: template.code,
    versionNumber: 1,
    name: template.name,
    description: null,
    status: "DRAFT",
    totalMarks: 100,
    effectiveFrom: null,
    effectiveTo: null,
    approvedAt: null,
    archivedAt: null,
  }));
  const components = canonical.assessmentTemplates.flatMap((template) =>
    template.components.map((component) => ({
      id: `component:${template.code}:${component.code}`,
      departmentId,
      assessmentTemplateId: `template:${template.code}`,
      templateCode: template.code,
      code: component.code,
      displayName: component.displayName,
      groupCode: null,
      maximumMarks: component.maximumMarks,
      displayOrder: component.displayOrder,
      isRequired: component.required,
    })),
  );
  const bindings = canonical.courses.map((course) => ({
    id: `binding:${course.courseCode}`,
    departmentId,
    curriculumVersionId: curriculumId,
    courseId: `course:${course.courseCode}`,
    assessmentTemplateId: `template:${course.assessmentTemplateCode}`,
    templateCode: course.assessmentTemplateCode,
    categoryCode: course.category,
    academicYearNumber: course.academicYear,
    semesterNumber: course.semester,
    displayOrder: course.displayOrder,
    courseCodeSnapshot: course.courseCode,
    courseTitleSnapshot: course.titleSnapshot,
    creditHoursSnapshot: course.credits,
    totalMarksSnapshot: 100,
    isRequired: true,
  }));
  return {
    department: {
      id: departmentId,
      code: "0421",
      status: "ACTIVE",
      archivedAt: null,
      deletedAt: null,
    },
    programme: {
      id: programmeId,
      departmentId,
      code: "LLB",
      status: "ACTIVE",
      archivedAt: null,
    },
    courses,
    curriculumVersions,
    templates,
    components,
    bindings,
  };
}

function mutableState(state: BackfillTargetState) {
  return structuredClone(state) as unknown as {
    department: {
      id: string;
      code: string;
      status: string;
      archivedAt: Date | null;
      deletedAt: Date | null;
    };
    programme: {
      id: string;
      departmentId: string;
      code: string;
      status: string;
      archivedAt: Date | null;
    };
    courses: Array<Record<string, unknown>>;
    curriculumVersions: Array<Record<string, unknown>>;
    templates: Array<Record<string, unknown>>;
    components: Array<Record<string, unknown>>;
    bindings: Array<Record<string, unknown>>;
  };
}

const rejectsConflict = (operation: () => unknown, pattern: RegExp) =>
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof BackfillConflictError && pattern.test(error.message),
  );

test("fresh audited state plans 11 title corrections and exactly 70 inserts", () => {
  const plan = planCanonicalBackfill(makeState());
  assert.equal(plan.classification, "FRESH_APPLY");
  assert.equal(plan.canonicalCourseIds.length, 58);
  assert.equal(plan.titleUpdates.length, 11);
  assert.deepEqual(plan.createCounts, {
    curriculumVersions: 1,
    templates: 3,
    components: 8,
    bindings: 58,
    total: 70,
  });
});

for (const [label, mutate] of [
  [
    "archived Department",
    (state: ReturnType<typeof mutableState>) => {
      state.department.archivedAt = new Date();
    },
  ],
  [
    "deleted Department",
    (state: ReturnType<typeof mutableState>) => {
      state.department.deletedAt = new Date();
    },
  ],
  [
    "inactive Department",
    (state: ReturnType<typeof mutableState>) => {
      state.department.status = "INACTIVE";
    },
  ],
] as const) {
  test(`${label} fails closed`, () => {
    const state = mutableState(makeState());
    mutate(state);
    rejectsConflict(
      () => planCanonicalBackfill(state as unknown as BackfillTargetState),
      /archived, deleted, or not ACTIVE/,
    );
  });
}

for (const canonicalTitleCount of [1, 10, 11]) {
  test(`fresh foundation with ${canonicalTitleCount} already-canonical audited titles fails closed`, () => {
    const state = mutableState(makeState());
    const transitions = new Set(
      Object.keys(LEGACY_TITLE_TRANSITIONS).slice(0, canonicalTitleCount),
    );
    for (const course of state.courses) {
      if (transitions.has(String(course.code))) {
        const expected = canonical.courses.find(
          (row) => row.courseCode === course.code,
        )!;
        course.title = expected.titleSnapshot;
      }
    }
    rejectsConflict(
      () => planCanonicalBackfill(state as unknown as BackfillTargetState),
      new RegExp(`requires exactly 11.*found ${11 - canonicalTitleCount}`),
    );
  });
}

test("exact rerun state is an exact no-op", () => {
  const plan = planCanonicalBackfill(
    makeState({ fresh: false, legacyTitles: false }),
  );
  assert.equal(plan.classification, "EXACT_NOOP");
  assert.equal(plan.titleUpdates.length, 0);
  assert.equal(plan.createCounts.total, 0);
});

test("missing canonical course fails closed", () => {
  const state = mutableState(makeState());
  state.courses.splice(0, 1);
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /0421-1101.*found 0/,
  );
});

test("duplicate scoped course fails closed", () => {
  const state = mutableState(makeState());
  state.courses.push({ ...state.courses[0]!, id: "duplicate" });
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /0421-1101.*found 2/,
  );
});

test("credit mismatch fails closed", () => {
  const state = mutableState(makeState());
  state.courses[0]!.creditHours = 99;
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /0421-1101 credit mismatch/,
  );
});

test("unknown title mismatch fails closed", () => {
  const state = mutableState(makeState());
  state.courses[0]!.title = "Unknown title";
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /0421-1101 title mismatch/,
  );
});

for (const [label, mutation, pattern] of [
  [
    "archived canonical course",
    (state: ReturnType<typeof mutableState>) => {
      state.courses[0]!.archivedAt = new Date();
    },
    /0421-1101 is archived/,
  ],
  [
    "non-active canonical course",
    (state: ReturnType<typeof mutableState>) => {
      state.courses[0]!.status = "INACTIVE";
    },
    /0421-1101 is archived or not ACTIVE/,
  ],
  [
    "wrong programme",
    (state: ReturnType<typeof mutableState>) => {
      state.courses[0]!.academicProgramId = "other-programme";
    },
    /wrong programme/,
  ],
  [
    "wrong department",
    (state: ReturnType<typeof mutableState>) => {
      state.courses[0]!.departmentId = "other-department";
    },
    /wrong department/,
  ],
] as const) {
  test(`${label} fails closed`, () => {
    const state = mutableState(makeState());
    mutation(state);
    rejectsConflict(
      () => planCanonicalBackfill(state as unknown as BackfillTargetState),
      pattern,
    );
  });
}

test("extra active Law course fails closed", () => {
  const state = mutableState(makeState());
  state.courses.push({
    id: "extra",
    departmentId,
    academicProgramId: programmeId,
    code: "0421-9999",
    title: "Extra",
    creditHours: 1,
    status: "ACTIVE",
    archivedAt: null,
  });
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /Unexpected active Law course: 0421-9999/,
  );
});

test("LAW-101 and LAW-999 remain archived, excluded, and untouched", () => {
  const plan = planCanonicalBackfill(makeState());
  assert.deepEqual(plan.archivedExtras, ["LAW-101", "LAW-999"]);
  assert.ok(
    plan.titleUpdates.every((update) => !update.courseCode.startsWith("LAW-")),
  );
});

test("non-archived LAW-101 fails closed", () => {
  const state = mutableState(makeState());
  const row = state.courses.find((course) => course.code === "LAW-101")!;
  row.archivedAt = null;
  row.status = "ACTIVE";
  rejectsConflict(
    () => planCanonicalBackfill(state as unknown as BackfillTargetState),
    /Unexpected active Law course: LAW-101/,
  );
});

for (const [label, mutate, pattern] of [
  [
    "partial curriculum",
    (state: ReturnType<typeof mutableState>) => {
      state.curriculumVersions = [];
    },
    /Partial canonical foundation/,
  ],
  [
    "partial template",
    (state: ReturnType<typeof mutableState>) => {
      state.templates.pop();
    },
    /Partial canonical foundation/,
  ],
  [
    "partial component",
    (state: ReturnType<typeof mutableState>) => {
      state.components.pop();
    },
    /Partial canonical foundation/,
  ],
  [
    "partial binding",
    (state: ReturnType<typeof mutableState>) => {
      state.bindings.pop();
    },
    /Partial canonical foundation/,
  ],
  [
    "conflicting curriculum metadata",
    (state: ReturnType<typeof mutableState>) => {
      state.curriculumVersions[0]!.totalCourses = 57;
    },
    /CurriculumVersion field mismatch: totalCourses/,
  ],
  [
    "conflicting template split",
    (state: ReturnType<typeof mutableState>) => {
      state.components[0]!.maximumMarks = 29;
    },
    /Component .*maximumMarks/,
  ],
  [
    "incorrect binding template",
    (state: ReturnType<typeof mutableState>) => {
      state.bindings[0]!.templateCode = "LLB-CAPSTONE-DEFENCE-PRACTICAL-100-V1";
    },
    /Binding 0421-1101 field mismatch: templateCode/,
  ],
  [
    "incorrect preserved course ID",
    (state: ReturnType<typeof mutableState>) => {
      state.bindings[0]!.courseId = "course:0421-1102";
    },
    /Binding 0421-1101 field mismatch: courseId/,
  ],
  [
    "incorrect course snapshot",
    (state: ReturnType<typeof mutableState>) => {
      state.bindings[0]!.courseTitleSnapshot = "Wrong";
    },
    /Binding 0421-1101 field mismatch: courseTitleSnapshot/,
  ],
  [
    "incorrect display order",
    (state: ReturnType<typeof mutableState>) => {
      state.bindings[0]!.displayOrder = 9;
    },
    /Binding 0421-1101 field mismatch: displayOrder/,
  ],
] as const) {
  test(`${label} fails closed`, () => {
    const state = mutableState(
      makeState({ fresh: false, legacyTitles: false }),
    );
    mutate(state);
    rejectsConflict(
      () => planCanonicalBackfill(state as unknown as BackfillTargetState),
      pattern,
    );
  });
}

const validGuard = (plan: BackfillPlan) => ({
  fingerprint: CANONICAL_FINGERPRINT,
  expectedDatabaseName: "lexora_target",
  actualDatabaseName: "lexora_target",
  actorUserId: "authorized-admin",
  reason: "Approved canonical curriculum backfill",
  expectedTitleUpdates: plan.classification === "EXACT_NOOP" ? 0 : 11,
});

test("unexpected title-update count confirmation is rejected", () => {
  const plan = planCanonicalBackfill(makeState());
  rejectsConflict(
    () =>
      validateApplyGuard(plan, {
        ...validGuard(plan),
        expectedTitleUpdates: 0,
      }),
    /Expected 0 title updates but planned 11/,
  );
});

test("incorrect fingerprint confirmation is rejected", () => {
  const plan = planCanonicalBackfill(makeState());
  rejectsConflict(
    () =>
      validateApplyGuard(plan, { ...validGuard(plan), fingerprint: "wrong" }),
    /fingerprint/,
  );
});

test("incorrect expected database name is rejected", () => {
  const plan = planCanonicalBackfill(makeState());
  rejectsConflict(
    () =>
      validateApplyGuard(plan, {
        ...validGuard(plan),
        actualDatabaseName: "other",
      }),
    /database name/,
  );
});

for (const [label, override, pattern] of [
  ["missing actor", { actorUserId: "" }, /Actor user ID/],
  ["missing reason", { reason: "" }, /reason/],
  ["placeholder reason", { reason: "placeholder" }, /reason/],
] as const) {
  test(`${label} apply guard is rejected`, () => {
    const plan = planCanonicalBackfill(makeState());
    rejectsConflict(
      () => validateApplyGuard(plan, { ...validGuard(plan), ...override }),
      pattern,
    );
  });
}

test("same input produces byte-for-byte deterministic sanitized plan output", () => {
  const first = sanitizedSummary(
    "PLAN",
    null,
    planCanonicalBackfill(makeState()),
  );
  const second = sanitizedSummary(
    "PLAN",
    null,
    planCanonicalBackfill(makeState()),
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("CLI argument failures redact malformed and option values", () => {
  const secret = "postgresql://admin:password@db/private?token=abc";
  for (const args of [
    [secret],
    [`--mode=plan`, `--mode=${secret}`],
    [`--mode=plan`, `--unsupported=${secret}`],
  ]) {
    assert.throws(
      () => parseBackfillArguments(args),
      (error: unknown) => {
        assert.ok(error instanceof BackfillConflictError);
        assert.ok(!error.message.includes(secret));
        assert.ok(!/password|token=abc/.test(error.message));
        return true;
      },
    );
  }
});

test("PLAN database expectation semantics allow omission/match and reject mismatch", () => {
  assert.doesNotThrow(() => validateOptionalDatabaseExpectation("target"));
  assert.doesNotThrow(() =>
    validateOptionalDatabaseExpectation("target", "target"),
  );
  rejectsConflict(
    () => validateOptionalDatabaseExpectation("target", "other"),
    /database name/,
  );
});

test("APPLY database mismatch prevents target-state loading and all writes", async () => {
  const events: string[] = [];
  await assert.rejects(
    () =>
      executeAfterRequiredDatabaseExpectation(
        "actual_database",
        "expected_database",
        async () => {
          events.push("load-target-state");
          events.push("write");
        },
      ),
    /database name/,
  );
  assert.equal(events.length, 0);

  await assert.rejects(
    () =>
      executeAfterRequiredDatabaseExpectation(
        "actual_database",
        "   ",
        async () => {
          events.push("load-target-state");
        },
      ),
    /database name/,
  );
  assert.equal(events.length, 0);
});

test("advisory lock adapter runs work only when exactly one true result is returned", async () => {
  const events: string[] = [];
  const result = await executeWithRequiredAdvisoryLock(
    async () => [{ acquired: true }],
    async () => {
      events.push("state-load-and-write");
      return "done";
    },
  );
  assert.equal(result, "done");
  for (const rows of [
    [],
    [{ acquired: false }],
    [{ acquired: true }, { acquired: true }],
  ] as const) {
    await assert.rejects(
      () =>
        executeWithRequiredAdvisoryLock(
          async () => rows,
          async () => {
            events.push("forbidden");
          },
        ),
      /lock is unavailable/,
    );
  }
  assert.deepEqual(events, ["state-load-and-write"]);
});

test("audit reason is trimmed, bounded, and rejects every prohibited prefix without disclosure", () => {
  assert.equal(
    normalizeAuditReason("  Approved production curriculum correction  "),
    "Approved production curriculum correction",
  );
  for (const reason of [
    "test",
    "TEST production run",
    "testing production backfill",
    "placeholderValue",
    "todoLater production correction",
    "n/aTemporary production correction",
    "short",
    "x".repeat(501),
  ]) {
    assert.throws(
      () => normalizeAuditReason(reason),
      (error: unknown) => {
        assert.ok(error instanceof BackfillConflictError);
        assert.ok(!error.message.includes(reason));
        return true;
      },
    );
  }
});

test("canonical dataset has no runtime database identifier fields", () => {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(visit);
    if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!/(^id$|Id$)/.test(key), `database ID field: ${key}`);
        visit(child);
      }
  };
  visit(canonical);
});

function fakePort(
  events: string[],
  overrides: Partial<FreshWritePort> = {},
): FreshWritePort {
  return {
    updateTitle: async (update) => {
      events.push(`update:${update.courseCode}`);
      return 1;
    },
    auditTitle: async (update) => {
      events.push(`audit-title:${update.courseCode}`);
    },
    createFoundation: async () => {
      events.push("create-foundation");
      return "curriculum:created";
    },
    auditOverall: async () => {
      events.push("audit-overall");
    },
    verifyExactNoop: async () => {
      events.push("verify");
    },
    ...overrides,
  };
}

test("transaction behavior orders CAS, audits, foundation writes, and verification", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(makeState());
  await executeFreshWrites(plan, fakePort(events));
  assert.equal(
    events.filter((event) => event.startsWith("update:")).length,
    11,
  );
  assert.equal(
    events.filter((event) => event.startsWith("audit-title:")).length,
    11,
  );
  assert.deepEqual(events.slice(-3), [
    "create-foundation",
    "audit-overall",
    "verify",
  ]);
});

test("overall audit receives the created curriculum ID, structured sources, and full row counts", async () => {
  const plan = planCanonicalBackfill(makeState());
  let auditInput: Parameters<FreshWritePort["auditOverall"]>[0] | undefined;
  await executeFreshWrites(
    plan,
    fakePort([], {
      createFoundation: async () => "curriculum:new-id",
      auditOverall: async (input) => {
        auditInput = input;
      },
    }),
  );
  assert.equal(auditInput?.curriculumVersionId, "curriculum:new-id");
  assert.deepEqual(auditInput?.createdRows, plan.createCounts);
  assert.deepEqual(
    auditInput?.sources,
    canonical.sources.map(({ kind, path, sha256 }) => ({ kind, path, sha256 })),
  );
});

test("compare-and-swap affected-row count is enforced before later writes", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(makeState());
  await assert.rejects(
    () =>
      executeFreshWrites(
        plan,
        fakePort(events, {
          updateTitle: async (update) => {
            events.push(`update:${update.courseCode}`);
            return 0;
          },
        }),
      ),
    /compare-and-swap affected 0 rows/,
  );
  assert.deepEqual(events, ["update:0421-3101"]);
});

test("write failure prevents later writes and verification", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(makeState());
  await assert.rejects(
    () =>
      executeFreshWrites(
        plan,
        fakePort(events, {
          createFoundation: async () => {
            events.push("create-foundation");
            throw new Error("write failed");
          },
        }),
      ),
    /write failed/,
  );
  assert.ok(!events.includes("audit-overall"));
  assert.ok(!events.includes("verify"));
});

test("post-write verification failure propagates after overall audit", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(makeState());
  await assert.rejects(
    () =>
      executeFreshWrites(
        plan,
        fakePort(events, {
          verifyExactNoop: async () => {
            events.push("verify");
            throw new Error("verification failed");
          },
        }),
      ),
    /verification failed/,
  );
  assert.deepEqual(events.slice(-3), [
    "create-foundation",
    "audit-overall",
    "verify",
  ]);
});

test("exact no-op issues no data-changing or audit calls", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(
    makeState({ fresh: false, legacyTitles: false }),
  );
  await executeFreshWrites(plan, fakePort(events));
  assert.deepEqual(events, []);
});

test("archived rows never receive mutation calls", async () => {
  const events: string[] = [];
  const plan = planCanonicalBackfill(makeState());
  await executeFreshWrites(plan, fakePort(events));
  assert.ok(
    events.every(
      (event) => !event.includes("LAW-101") && !event.includes("LAW-999"),
    ),
  );
});
