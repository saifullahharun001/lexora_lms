import assert from "node:assert/strict";
import test from "node:test";

import { CourseOfferingStatus, CourseOutlineStatus } from "@prisma/client";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

function baseVersion(status: CourseOutlineStatus) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 4,
    status,
    courseSummary: "narrative",
    deliveryPlan: null,
    teachingStrategies: null,
    assessmentStrategy: null,
    evaluationPolicy: null,
    makeUpProcedure: null,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  };
}

function harness(options: {
  status?: CourseOutlineStatus;
  assignment?: boolean;
  validTopics?: string[];
  validClos?: string[];
  validComponents?: string[];
  auditFails?: boolean;
} = {}) {
  let state = {
    topicPlans: [
      {
        id: "old-plan",
        syllabusContentTopicId: "old-topic",
        assessmentTechnique: "old technique" as string | null,
        cloIds: ["old-clo"],
      },
    ],
    resources: [
      {
        id: "old-resource",
        resourceTypeCode: "BOOK",
        citationText: "old citation",
        displayOrder: 1,
      },
    ],
    schedule: [
      {
        id: "old-schedule",
        assessmentTemplateComponentId: "old-component",
        plannedWeekNumber: 2,
        scheduledAt: null,
        notes: "old note",
        displayOrder: 1,
      },
    ],
    audits: [] as Array<Record<string, unknown>>,
  };
  const canonicalMutations: string[] = [];
  const validationCalls: Array<{ kind: string; where: unknown }> = [];
  const operationOrder: string[] = [];
  const authorityQueries: Array<{
    sql: string;
    values: readonly unknown[];
  }> = [];
  let queue = Promise.resolve();
  let planCounter = 0;
  const version = baseVersion(options.status ?? CourseOutlineStatus.DRAFT);

  const detailRecord = () => ({
    ...version,
    courseOutlineTopicPlans: state.topicPlans.map((plan) => ({
      id: plan.id,
      assessmentTechnique: plan.assessmentTechnique,
      syllabusContentTopic: {
        id: plan.syllabusContentTopicId,
        title: `${plan.syllabusContentTopicId} title`,
        content: null,
        displayOrder: 1,
      },
      cloMappings: plan.cloIds.map((id) => ({
        courseLearningOutcome: {
          id,
          code: id.toUpperCase(),
          statement: `${id} statement`,
          displayOrder: 1,
        },
      })),
    })),
    courseOutlineSupplementalResources: structuredClone(state.resources),
    courseOutlineAssessmentScheduleItems: state.schedule.map((item) => ({
      id: item.id,
      plannedWeekNumber: item.plannedWeekNumber,
      scheduledAt: item.scheduledAt,
      notes: item.notes,
      displayOrder: item.displayOrder,
      assessmentTemplateComponent: {
        id: item.assessmentTemplateComponentId,
        code: item.assessmentTemplateComponentId.toUpperCase(),
        displayName: `${item.assessmentTemplateComponentId} name`,
        displayOrder: 1,
      },
    })),
  });

  const makeTx = () => ({
    $queryRaw: async (query: {
      strings?: readonly string[];
      values?: readonly unknown[];
    }) => {
      const sql = query.strings?.join("?") ?? "";
      if (sql.includes('FROM "course_offerings" co') && sql.includes("FOR UPDATE OF co")) {
        operationOrder.push("offering-lock");
        return [
          {
            id: "offering-a",
            departmentId: "department-a",
            courseId: "course-a",
            studentBatchId: "batch-a",
            academicTermId: "term-a",
            curriculumCourseId: "curriculum-a",
            syllabusVersionId: "syllabus-a",
            status: CourseOfferingStatus.IN_PROGRESS,
            archivedAt: null,
          },
        ];
      }
      if (sql.includes('FROM "teacher_course_assignments" tca')) {
        operationOrder.push("teacher-authority-lock");
        authorityQueries.push({ sql, values: query.values ?? [] });
        return options.assignment === false
          ? []
          : [
              {
                teacherCourseAssignmentId: "assignment-a",
                teacherUserId: "teacher-a",
                teacherUserRoleId: "user-role-a",
                teacherRoleId: "teacher-role-a",
              },
            ];
      }
      if (sql.includes('JOIN "courses" c')) {
        operationOrder.push("academic-chain");
        return [
          {
            id: "offering-a",
            curriculumVersionId: "curriculum-version-a",
            assessmentTemplateId: "template-a",
          },
        ];
      }
      if (sql.includes('FROM "course_outline_versions" cov')) {
        operationOrder.push("version-lock");
        return [{ id: "outline-a" }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    courseOutlineVersion: {
      findFirst: async (args: { where: { status?: CourseOutlineStatus } }) =>
        args.where.status === undefined ? structuredClone(version) : detailRecord(),
    },
    syllabusContentTopic: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        validationCalls.push({ kind: "topic", where: args.where });
        const valid = new Set(options.validTopics ?? args.where.id.in);
        return args.where.id.in.filter((id) => valid.has(id)).map((id) => ({ id }));
      },
      update: async () => canonicalMutations.push("topic.update"),
    },
    courseLearningOutcome: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        validationCalls.push({ kind: "clo", where: args.where });
        const valid = new Set(options.validClos ?? args.where.id.in);
        return args.where.id.in.filter((id) => valid.has(id)).map((id) => ({ id }));
      },
      update: async () => canonicalMutations.push("clo.update"),
    },
    assessmentTemplateComponent: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        validationCalls.push({ kind: "component", where: args.where });
        const valid = new Set(options.validComponents ?? args.where.id.in);
        return args.where.id.in.filter((id) => valid.has(id)).map((id) => ({ id }));
      },
      update: async () => canonicalMutations.push("component.update"),
    },
    courseOutlineTopicCloMapping: {
      deleteMany: async () => {
        operationOrder.push("child-mutation");
        for (const plan of state.topicPlans) plan.cloIds = [];
        return { count: 1 };
      },
      createMany: async (args: {
        data: Array<{ topicPlanId: string; courseLearningOutcomeId: string }>;
      }) => {
        operationOrder.push("child-mutation");
        for (const mapping of args.data) {
          state.topicPlans
            .find((plan) => plan.id === mapping.topicPlanId)!
            .cloIds.push(mapping.courseLearningOutcomeId);
        }
        return { count: args.data.length };
      },
    },
    courseOutlineTopicPlan: {
      deleteMany: async () => {
        operationOrder.push("child-mutation");
        const count = state.topicPlans.length;
        state.topicPlans = [];
        return { count };
      },
      create: async (args: {
        data: {
          syllabusContentTopicId: string;
          assessmentTechnique?: string;
        };
      }) => {
        operationOrder.push("child-mutation");
        const created = {
          id: `plan-${++planCounter}`,
          syllabusContentTopicId: args.data.syllabusContentTopicId,
          assessmentTechnique: args.data.assessmentTechnique ?? null,
          cloIds: [] as string[],
        };
        state.topicPlans.push(created);
        return { id: created.id };
      },
      count: async () => state.topicPlans.length,
    },
    courseOutlineSupplementalResource: {
      deleteMany: async () => {
        operationOrder.push("child-mutation");
        const count = state.resources.length;
        state.resources = [];
        return { count };
      },
      createMany: async (args: { data: typeof state.resources }) => {
        operationOrder.push("child-mutation");
        state.resources = structuredClone(args.data).map((item, index) => ({
          ...item,
          id: item.id ?? `resource-${index + 1}`,
        }));
        return { count: args.data.length };
      },
      count: async () => state.resources.length,
    },
    courseOutlineAssessmentScheduleItem: {
      deleteMany: async () => {
        operationOrder.push("child-mutation");
        const count = state.schedule.length;
        state.schedule = [];
        return { count };
      },
      createMany: async (args: { data: typeof state.schedule }) => {
        operationOrder.push("child-mutation");
        state.schedule = structuredClone(args.data).map((item, index) => ({
          ...item,
          id: item.id ?? `schedule-${index + 1}`,
        }));
        return { count: args.data.length };
      },
      count: async () => state.schedule.length,
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        operationOrder.push("audit");
        if (options.auditFails) throw new Error("audit failed");
        state.audits.push(structuredClone(args.data));
        return { id: "audit-a" };
      },
    },
  });

  const prisma = {
    $transaction: async (
      callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>,
    ) => {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await callback(makeTx());
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  return {
    repository: new PrismaAcademicRepository(prisma as never),
    state: () => structuredClone(state),
    canonicalMutations,
    validationCalls,
    operationOrder,
    authorityQueries,
  };
}

function input(
  sections: Record<string, unknown>,
) {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...sections,
  };
}

test("locks exact live Teacher authority before academic-chain and version work", async () => {
  const h = harness();
  const result = await h.repository.updateCourseOutlineStructuredContent(
    input({ topicPlans: [] }),
  );

  assert.equal(result.outcome, "UPDATED");
  assert.equal(h.authorityQueries.length, 1);
  const authority = h.authorityQueries[0]!;
  assert.deepEqual(authority.values.slice(0, 4), [
    "offering-a",
    "department-a",
    "teacher-a",
    "ACTIVE",
  ]);
  assert.match(
    authority.sql,
    /tca\."course_offering_id"\s*=\s*\?/,
  );
  assert.match(authority.sql, /tca\."department_id"\s*=\s*\?/);
  assert.match(authority.sql, /tca\."teacher_user_id"\s*=\s*\?/);
  assert.match(authority.sql, /tca\."status"\s*=\s*'ACTIVE'/);
  assert.match(authority.sql, /tca\."unassigned_at" IS NULL/);
  assert.match(authority.sql, /tca\."archived_at" IS NULL/);
  assert.match(authority.sql, /tu\."status"\s*=\s*\?::"UserStatus"/);
  assert.match(authority.sql, /tu\."archived_at" IS NULL/);
  assert.match(authority.sql, /tu\."deleted_at" IS NULL/);
  assert.match(authority.sql, /tur\."revoked_at" IS NULL/);
  assert.match(authority.sql, /tur\."expires_at" > CURRENT_TIMESTAMP/);
  assert.match(authority.sql, /tr\."code"\s*=\s*'teacher'/);
  assert.match(authority.sql, /tr\."archived_at" IS NULL/);
  assert.match(
    authority.sql,
    /FOR SHARE OF tu FOR UPDATE OF tca, tur, tr/,
  );

  const offeringLock = h.operationOrder.indexOf("offering-lock");
  const authorityLock = h.operationOrder.indexOf("teacher-authority-lock");
  const academicChain = h.operationOrder.indexOf("academic-chain");
  const versionLock = h.operationOrder.indexOf("version-lock");
  const firstMutation = h.operationOrder.indexOf("child-mutation");
  const audit = h.operationOrder.indexOf("audit");
  assert.ok(offeringLock < authorityLock);
  assert.ok(authorityLock < academicChain);
  assert.ok(academicChain < versionLock);
  assert.ok(versionLock < firstMutation);
  assert.ok(firstMutation < audit);
});

test("revoked or unusable Teacher authority stops before chain, mutation, and audit", async () => {
  const h = harness({ assignment: false });
  const before = h.state();

  assert.deepEqual(
    await h.repository.updateCourseOutlineStructuredContent(
      input({ supplementalResources: [] }),
    ),
    { outcome: "OFFERING_OR_ASSIGNMENT_NOT_FOUND" },
  );
  assert.deepEqual(h.operationOrder, [
    "offering-lock",
    "teacher-authority-lock",
  ]);
  assert.deepEqual(h.state(), before);
  assert.equal(h.state().audits.length, 0);
});

test("exact assigned Teacher and DRAFT/RETURNED status permit mutation", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  ]) {
    const h = harness({ status });
    assert.equal(
      (
        await h.repository.updateCourseOutlineStructuredContent(
          input({ topicPlans: [] }),
        )
      ).outcome,
      "UPDATED",
    );
  }

  const unassigned = harness({ assignment: false });
  assert.deepEqual(
    await unassigned.repository.updateCourseOutlineStructuredContent(
      input({ topicPlans: [] }),
    ),
    { outcome: "OFFERING_OR_ASSIGNMENT_NOT_FOUND" },
  );
  assert.equal(unassigned.state().topicPlans.length, 1);
});

test("submitted/review/approved/active/archived states are immutable", async () => {
  for (const status of [
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness({ status });
    assert.deepEqual(
      await h.repository.updateCourseOutlineStructuredContent(
        input({ supplementalResources: [] }),
      ),
      { outcome: "OUTLINE_NOT_EDITABLE" },
    );
    assert.equal(h.state().resources.length, 1);
  }
});

test("omitted sections remain unchanged while supplied non-empty section replaces", async () => {
  const h = harness();
  const before = h.state();
  const result = await h.repository.updateCourseOutlineStructuredContent(
    input({
      supplementalResources: [
        { resourceTypeCode: "WEB", citationText: "new citation" },
      ],
    }),
  );
  assert.equal(result.outcome, "UPDATED");
  const after = h.state();
  assert.deepEqual(after.topicPlans, before.topicPlans);
  assert.deepEqual(after.schedule, before.schedule);
  assert.equal(after.resources.length, 1);
  assert.equal(after.resources[0]?.citationText, "new citation");
});

test("supplied empty array clears only that section", async () => {
  const h = harness();
  const before = h.state();
  await h.repository.updateCourseOutlineStructuredContent(
    input({ assessmentSchedule: [] }),
  );
  const after = h.state();
  assert.deepEqual(after.topicPlans, before.topicPlans);
  assert.deepEqual(after.resources, before.resources);
  assert.deepEqual(after.schedule, []);
});

test("topic and CLO validation uses exact syllabus/curriculum identity before mutation", async () => {
  const h = harness({ validTopics: ["topic-a"], validClos: ["clo-a"] });
  assert.equal(
    (
      await h.repository.updateCourseOutlineStructuredContent(
        input({
          topicPlans: [
            {
              syllabusContentTopicId: "topic-a",
              courseLearningOutcomeIds: ["foreign-clo"],
            },
          ],
        }),
      )
    ).outcome,
    "INVALID_CLO",
  );
  assert.equal(h.state().topicPlans[0]?.id, "old-plan");
  const topicWhere = h.validationCalls.find((call) => call.kind === "topic")!
    .where as Record<string, unknown>;
  const cloWhere = h.validationCalls.find((call) => call.kind === "clo")!
    .where as Record<string, unknown>;
  assert.equal(topicWhere.syllabusVersionId, "syllabus-a");
  assert.equal(topicWhere.curriculumCourseId, "curriculum-a");
  assert.equal(cloWhere.curriculumVersionId, "curriculum-version-a");
  assert.equal(cloWhere.curriculumCourseId, "curriculum-a");
});

test("assessment schedule accepts only component from authoritative course template", async () => {
  const h = harness({ validComponents: [] });
  assert.equal(
    (
      await h.repository.updateCourseOutlineStructuredContent(
        input({
          assessmentSchedule: [
            { assessmentTemplateComponentId: "same-dept-other-template" },
          ],
        }),
      )
    ).outcome,
    "INVALID_ASSESSMENT_COMPONENT",
  );
  const where = h.validationCalls.find((call) => call.kind === "component")!
    .where as Record<string, unknown>;
  assert.equal(where.departmentId, "department-a");
  assert.equal(where.assessmentTemplateId, "template-a");
  assert.equal(h.state().schedule[0]?.id, "old-schedule");
});

test("duplicate topic/CLO/component references are rejected before transaction", async () => {
  for (const sections of [
    {
      topicPlans: [
        { syllabusContentTopicId: "topic-a", courseLearningOutcomeIds: [] },
        { syllabusContentTopicId: "topic-a", courseLearningOutcomeIds: [] },
      ],
    },
    {
      topicPlans: [
        {
          syllabusContentTopicId: "topic-a",
          courseLearningOutcomeIds: ["clo-a", "clo-a"],
        },
      ],
    },
    {
      assessmentSchedule: [
        { assessmentTemplateComponentId: "component-a" },
        { assessmentTemplateComponentId: "component-a" },
      ],
    },
  ]) {
    const h = harness();
    assert.deepEqual(
      await h.repository.updateCourseOutlineStructuredContent(
        input(sections) as never,
      ),
      { outcome: "DUPLICATE_REFERENCE" },
    );
    assert.equal(h.state().audits.length, 0);
  }
});

test("mixed invalid request is fully atomic across all supplied sections", async () => {
  const h = harness({ validComponents: [] });
  const before = h.state();
  const result = await h.repository.updateCourseOutlineStructuredContent(
    input({
      supplementalResources: [
        { resourceTypeCode: "WEB", citationText: "would replace" },
      ],
      assessmentSchedule: [
        { assessmentTemplateComponentId: "foreign-component" },
      ],
    }),
  );
  assert.equal(result.outcome, "INVALID_ASSESSMENT_COMPONENT");
  assert.deepEqual(h.state(), before);
});

test("audit failure rolls child mutations back and canonical rows are never mutated", async () => {
  const h = harness({ auditFails: true });
  const before = h.state();
  await assert.rejects(
    h.repository.updateCourseOutlineStructuredContent(
      input({
        topicPlans: [
          {
            syllabusContentTopicId: "topic-a",
            courseLearningOutcomeIds: ["clo-a"],
          },
        ],
        supplementalResources: [],
      }),
    ),
    /audit failed/,
  );
  assert.deepEqual(h.state(), before);
  assert.deepEqual(h.canonicalMutations, []);
});

test("structured audit contains only identity, changed sections, and final counts", async () => {
  const h = harness();
  await h.repository.updateCourseOutlineStructuredContent(
    input({
      topicPlans: [
        {
          syllabusContentTopicId: "topic-a",
          courseLearningOutcomeIds: ["clo-a"],
          assessmentTechnique: "secret technique",
        },
      ],
      supplementalResources: [],
    }),
  );
  const audit = h.state().audits[0]!;
  assert.equal(
    audit.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_STRUCTURED_CONTENT_UPDATED,
  );
  assert.deepEqual(audit.contextJson, {
    courseOutlineVersionId: "outline-a",
    courseOfferingId: "offering-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 4,
    changedSections: ["topicPlans", "supplementalResources"],
    topicPlanCount: 1,
    supplementalResourceCount: 0,
    assessmentScheduleItemCount: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(audit),
    /secret technique|citation|notes|statement|programLearningOutcome/i,
  );
});

test("detail result exposes safe canonical topic/CLO/component display data without PLO authority", async () => {
  const h = harness();
  const result = await h.repository.updateCourseOutlineStructuredContent(
    input({ topicPlans: [] }),
  );
  assert.equal(result.outcome, "UPDATED");
  if (result.outcome !== "UPDATED") return;
  assert.ok(Array.isArray(result.courseOutlineVersion.topicPlans));
  assert.ok(Array.isArray(result.courseOutlineVersion.supplementalResources));
  assert.ok(Array.isArray(result.courseOutlineVersion.assessmentSchedule));
  assert.doesNotMatch(
    JSON.stringify(result.courseOutlineVersion),
    /programLearningOutcome|ploMappings/i,
  );
});
