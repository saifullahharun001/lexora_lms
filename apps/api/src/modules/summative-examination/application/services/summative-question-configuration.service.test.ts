import assert from "node:assert/strict";
import test from "node:test";

import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  SummativeQuestionConfigurationStatus,
} from "@prisma/client";

import { SummativeQuestionConfigurationService } from "./summative-question-configuration.service";

const authority = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  userRoleId: "admin-user-role-a",
  roleId: "admin-role-a",
};

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

function harness(
  options: {
    currentExamination?: boolean;
    currentExaminationCourse?: boolean;
    configurationMatchesRoute?: boolean;
    cloMatchesCourse?: boolean;
    lockedQuestionConfigurationId?: string | null;
  } = {},
) {
  const order: string[] = [];
  const itemCreates: Array<Record<string, unknown>> = [];
  const itemUpdates: Array<Record<string, unknown>> = [];
  let configurationCreates = 0;
  let configurationUpdates = 0;
  let examinationCourseUpdates = 0;

  const tx = {
    examinationCourse: {
      findFirst: async (args: { select?: Record<string, boolean> }) => {
        if (args.select?.examinationId) {
          return {
            id: "exam-course-a",
            examinationId: "exam-a",
            curriculumVersionId: "curriculum-version-a",
            curriculumCourseId: "curriculum-course-a",
          };
        }
        return {
          id: "exam-course-a",
          lockedQuestionConfigurationId:
            options.lockedQuestionConfigurationId ?? null,
          summativeFullMark: new Prisma.Decimal(60),
        };
      },
      update: async () => {
        examinationCourseUpdates += 1;
        return { id: "exam-course-a" };
      },
    },
    summativeQuestionConfiguration: {
      findFirst: async () => ({
        id: "config-a",
        departmentId: authority.departmentId,
        examinationId: "exam-a",
        examinationCourseId: "exam-course-a",
        versionNumber: 1,
        status: SummativeQuestionConfigurationStatus.DRAFT,
        createdByUserId: authority.actorUserId,
        lockedAt: null,
        archivedAt: null,
        createdAt: new Date("2026-08-29T00:00:00.000Z"),
        updatedAt: new Date("2026-08-29T00:00:00.000Z"),
        items: [],
      }),
      create: async () => {
        order.push("configuration-create");
        configurationCreates += 1;
        return { id: "config-new", versionNumber: 2 };
      },
      update: async () => {
        order.push("configuration-update");
        configurationUpdates += 1;
        return { id: "config-a" };
      },
    },
    summativeQuestionConfigurationItem: {
      create: async (args: { data: Record<string, unknown> }) => {
        order.push("item-create");
        itemCreates.push(args.data);
        return { id: "item-new", ...args.data };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        order.push("item-update");
        itemUpdates.push(args.data);
        return { id: "item-a", ...args.data };
      },
    },
    auditLog: {
      create: async () => {
        order.push("audit");
        return { id: "audit-a" };
      },
    },
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "examinations"')) {
        order.push("examination");
        return options.currentExamination === false ? [] : [{ id: "exam-a" }];
      }
      if (sql.includes('FROM "examination_courses"')) {
        order.push("examination-course");
        return options.currentExaminationCourse === false
          ? []
          : [{ id: "exam-course-a" }];
      }
      if (sql.includes('FROM "summative_question_configurations"')) {
        order.push("configuration");
        return options.configurationMatchesRoute === false
          ? []
          : [{ id: "config-a" }];
      }
      if (sql.includes('FROM "summative_question_configuration_items"')) {
        order.push("item");
        return sql.includes('"full_mark"')
          ? [
              {
                id: "item-a",
                full_mark: "60",
                is_active: true,
                is_required: true,
              },
            ]
          : [{ id: "item-a" }];
      }
      if (sql.includes('FROM "course_learning_outcomes"')) {
        order.push("clo");
        return options.cloMatchesCourse === false
          ? []
          : [
              {
                id: "clo-a",
                curriculum_version_id: "curriculum-version-a",
                curriculum_course_id: "curriculum-course-a",
              },
            ];
      }
      return [];
    },
  };

  const service = new SummativeQuestionConfigurationService(
    {
      $transaction: async (
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    } as never,
    {
      get: () => ({
        requestId: "request-a",
        audit: { ipAddress: "127.0.0.1", userAgent: "test" },
      }),
    } as never,
    {
      authorize: async () => authority,
      assertCurrentAuthority: async () => {
        order.push("authority");
      },
    } as never,
  );

  return {
    configurationCreates: () => configurationCreates,
    configurationUpdates: () => configurationUpdates,
    examinationCourseUpdates: () => examinationCourseUpdates,
    itemCreates,
    itemUpdates,
    order,
    service,
  };
}

test("every configuration write revalidates current authority before protected mutation", async () => {
  const cases: Array<{
    invoke: (h: ReturnType<typeof harness>) => Promise<unknown>;
    mutation: string;
  }> = [
    {
      invoke: (h) => h.service.createDraftConfiguration("exam-course-a"),
      mutation: "configuration-create",
    },
    {
      invoke: (h) =>
        h.service.lockConfiguration("exam-course-a", "config-a"),
      mutation: "configuration-update",
    },
    {
      invoke: (h) =>
        h.service.archiveConfiguration("exam-course-a", "config-a"),
      mutation: "configuration-update",
    },
  ];

  for (const current of cases) {
    const h = harness();
    await current.invoke(h);
    assert.equal(h.order[0], "authority");
    assert.ok(h.order.indexOf(current.mutation) > h.order.indexOf("authority"));
  }
});

test("addItem revalidates authority and locks Examination, ExaminationCourse, Configuration, then CLO", async () => {
  const h = harness();
  await h.service.addItem("exam-course-a", "config-a", {
    questionLabel: "Q1",
    displayOrder: 1,
    fullMark: 10,
    isRequired: true,
    cloId: "clo-a",
    isActive: true,
  });
  assert.deepEqual(h.order, [
    "authority",
    "examination",
    "examination-course",
    "configuration",
    "clo",
    "item-create",
    "audit",
  ]);
  assert.equal(h.itemCreates[0]!.curriculumVersionId, "curriculum-version-a");
  assert.equal(h.itemCreates[0]!.curriculumCourseId, "curriculum-course-a");
});

test("updateItem uses parent-first locks, then item lock, then exact-course CLO share lock", async () => {
  const h = harness();
  await h.service.updateItem("exam-course-a", "config-a", "item-a", {
    cloId: "clo-a",
  });
  assert.deepEqual(h.order, [
    "authority",
    "examination",
    "examination-course",
    "configuration",
    "item",
    "clo",
    "item-update",
    "audit",
  ]);
  assert.equal(h.itemUpdates[0]!.curriculumVersionId, "curriculum-version-a");
  assert.equal(h.itemUpdates[0]!.curriculumCourseId, "curriculum-course-a");
});

test("same-department Course-B configuration cannot be mutated through Course-A route scope", async () => {
  const h = harness({ configurationMatchesRoute: false });
  await assert.rejects(
    h.service.addItem("exam-course-a", "course-b-config", {
      questionLabel: "Q1",
      displayOrder: 1,
      fullMark: 10,
      isRequired: true,
      isActive: true,
    }),
    NotFoundException,
  );
  assert.deepEqual(h.order, [
    "authority",
    "examination",
    "examination-course",
    "configuration",
  ]);
  assert.equal(h.itemCreates.length, 0);
});

for (const [name, options] of [
  ["archived Examination", { currentExamination: false }],
  ["archived ExaminationCourse", { currentExaminationCourse: false }],
] as const) {
  test(`${name} blocks DRAFT item mutation before Configuration lock`, async () => {
    const h = harness(options);
    await assert.rejects(
      h.service.updateItem("exam-course-a", "config-a", "item-a", {
        displayOrder: 2,
      }),
      NotFoundException,
    );
    assert.equal(h.order.includes("configuration"), false);
    assert.equal(h.itemUpdates.length, 0);
  });
}

test("wrong-course CLO fails safe-not-found without item mutation", async () => {
  const h = harness({ cloMatchesCourse: false });
  await assert.rejects(
    h.service.addItem("exam-course-a", "config-a", {
      questionLabel: "Q1",
      displayOrder: 1,
      fullMark: 10,
      isRequired: true,
      cloId: "course-b-clo",
      isActive: true,
    }),
    NotFoundException,
  );
  assert.equal(h.itemCreates.length, 0);
});

test("clearing CLO clears all derived CLO identity fields atomically", async () => {
  const h = harness();
  await h.service.updateItem("exam-course-a", "config-a", "item-a", {
    cloId: "",
  });
  assert.equal(h.itemUpdates[0]!.cloId, null);
  assert.equal(h.itemUpdates[0]!.curriculumVersionId, null);
  assert.equal(h.itemUpdates[0]!.curriculumCourseId, null);
});

test("different existing authoritative locked configuration cannot be overwritten", async () => {
  const h = harness({ lockedQuestionConfigurationId: "config-existing" });
  await assert.rejects(
    h.service.lockConfiguration("exam-course-a", "config-a"),
    ConflictException,
  );
  assert.equal(h.configurationUpdates(), 0);
  assert.equal(h.examinationCourseUpdates(), 0);
});
