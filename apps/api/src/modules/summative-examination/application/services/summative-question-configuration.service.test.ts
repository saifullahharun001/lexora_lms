import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  BloomLevel,
  Prisma,
  SummativeQuestionConfigurationStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import { UpdateQuestionConfigurationItemDto } from "../../presentation/http/dto/question-configuration.dto";
import { SummativeQuestionConfigurationService } from "./summative-question-configuration.service";

const authority = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  userRoleId: "admin-user-role-a",
  roleId: "admin-role-a",
};
const now = new Date("2026-08-29T00:00:00.000Z");

interface ConfigurationFixture {
  id: string;
  departmentId: string;
  examinationId: string;
  examinationCourseId: string;
  versionNumber: number;
  status: SummativeQuestionConfigurationStatus;
  createdByUserId: string;
  lockedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ItemFixture {
  id: string;
  departmentId: string;
  configurationId: string;
  examinationCourseId: string;
  questionLabel: string;
  subQuestionLabel: string | null;
  displayOrder: number;
  fullMark: Prisma.Decimal;
  isRequired: boolean;
  cloId: string | null;
  curriculumVersionId: string | null;
  curriculumCourseId: string | null;
  bloomLevel: BloomLevel | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function configuration(
  overrides: Partial<ConfigurationFixture> = {},
): ConfigurationFixture {
  return {
    id: "config-a",
    departmentId: authority.departmentId,
    examinationId: "exam-a",
    examinationCourseId: "exam-course-a",
    versionNumber: 1,
    status: SummativeQuestionConfigurationStatus.DRAFT,
    createdByUserId: authority.actorUserId,
    lockedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function item(overrides: Partial<ItemFixture> = {}): ItemFixture {
  return {
    id: "item-a",
    departmentId: authority.departmentId,
    configurationId: "config-a",
    examinationCourseId: "exam-course-a",
    questionLabel: "Q1",
    subQuestionLabel: null,
    displayOrder: 1,
    fullMark: new Prisma.Decimal("60"),
    isRequired: true,
    cloId: null,
    curriculumVersionId: null,
    curriculumCourseId: null,
    bloomLevel: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function cloneConfiguration(value: ConfigurationFixture) {
  return {
    ...value,
    lockedAt: value.lockedAt ? new Date(value.lockedAt) : null,
    archivedAt: value.archivedAt ? new Date(value.archivedAt) : null,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function cloneItem(value: ItemFixture): ItemFixture {
  return {
    ...value,
    fullMark: new Prisma.Decimal(value.fullMark.toString()),
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

function duplicateActiveOrderError() {
  return new PrismaClientKnownRequestError("duplicate active display order", {
    code: "P2002",
    clientVersion: "6.6.0",
    meta: { target: "summative_question_config_item_active_order_uq" },
  });
}

function harness(
  options: {
    configurations?: ConfigurationFixture[];
    items?: ItemFixture[];
    currentExamination?: boolean;
    currentExaminationCourse?: boolean;
    configurationMatchesRoute?: boolean;
    cloMatchesCourse?: boolean;
    lockedQuestionConfigurationId?: string | null;
    summativeFullMark?: string;
    failAuditAction?: string;
  } = {},
) {
  let configurations = (options.configurations ?? [configuration()]).map(
    cloneConfiguration,
  );
  let items = (options.items ?? []).map(cloneItem);
  let audits: Array<{ data: Record<string, unknown> }> = [];
  let lockedQuestionConfigurationId =
    options.lockedQuestionConfigurationId ?? null;
  const summativeFullMark = new Prisma.Decimal(
    options.summativeFullMark ?? "60",
  );
  const order: string[] = [];
  const cloQueries: unknown[] = [];
  const readCourseQueries: unknown[] = [];
  const transactionOptions: unknown[] = [];

  const findConfiguration = (id: string) =>
    configurations.find((current) => current.id === id);
  const findItem = (id: string) => items.find((current) => current.id === id);

  const examinationCourse = {
    findFirst: async (args: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      if (args.where?.examination) {
        readCourseQueries.push(args);
        if (
          options.currentExamination === false ||
          options.currentExaminationCourse === false
        ) {
          return null;
        }
        return { id: "exam-course-a" };
      }
      if (args.select?.examinationId) {
        if (options.currentExaminationCourse === false) return null;
        return {
          id: "exam-course-a",
          examinationId: "exam-a",
          curriculumVersionId: "curriculum-version-a",
          curriculumCourseId: "curriculum-course-a",
        };
      }
      if (options.currentExaminationCourse === false) return null;
      return {
        id: "exam-course-a",
        lockedQuestionConfigurationId,
        summativeFullMark,
      };
    },
    update: async (args: { data: { lockedQuestionConfigurationId: string } }) => {
      order.push("examination-course-update");
      lockedQuestionConfigurationId = args.data.lockedQuestionConfigurationId;
      return { id: "exam-course-a", lockedQuestionConfigurationId };
    },
  };

  const summativeQuestionConfiguration = {
    findMany: async (args: { where: Record<string, unknown> }) =>
      configurations
        .filter(
          (current) =>
            current.departmentId === args.where.departmentId &&
            current.examinationCourseId === args.where.examinationCourseId,
        )
        .sort((left, right) => right.versionNumber - left.versionNumber)
        .map((current) => ({
          ...cloneConfiguration(current),
          items: items
            .filter((entry) => entry.configurationId === current.id)
            .map(cloneItem),
        })),
    findFirst: async (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, string>;
    }) => {
      if (args.orderBy?.versionNumber) {
        const latest = [...configurations].sort(
          (left, right) => right.versionNumber - left.versionNumber,
        )[0];
        return latest ? { versionNumber: latest.versionNumber } : null;
      }
      const id = String(args.where.id ?? "config-a");
      const current = findConfiguration(id);
      if (
        !current ||
        options.configurationMatchesRoute === false ||
        current.departmentId !== args.where.departmentId ||
        current.examinationCourseId !== args.where.examinationCourseId
      ) {
        return null;
      }
      return {
        ...cloneConfiguration(current),
        items: items
          .filter((entry) => entry.configurationId === current.id)
          .map(cloneItem),
      };
    },
    create: async (args: { data: Partial<ConfigurationFixture> }) => {
      order.push("configuration-create");
      const created = configuration({
        ...args.data,
        id: `config-${configurations.length + 1}`,
        createdAt: now,
        updatedAt: now,
      });
      configurations.push(created);
      return cloneConfiguration(created);
    },
    update: async (args: {
      where: { id: string };
      data: Partial<ConfigurationFixture>;
    }) => {
      order.push("configuration-update");
      const current = findConfiguration(args.where.id);
      if (!current) throw new Error("missing configuration fixture");
      Object.assign(current, args.data, { updatedAt: now });
      return cloneConfiguration(current);
    },
  };

  const summativeQuestionConfigurationItem = {
    create: async (args: { data: Partial<ItemFixture> }) => {
      const data = args.data;
      if (
        data.isActive &&
        items.some(
          (current) =>
            current.configurationId === data.configurationId &&
            current.isActive &&
            current.displayOrder === data.displayOrder,
        )
      ) {
        throw duplicateActiveOrderError();
      }
      order.push("item-create");
      const created = item({
        ...data,
        id: `item-${items.length + 1}`,
        createdAt: now,
        updatedAt: now,
      });
      items.push(created);
      return cloneItem(created);
    },
    update: async (args: {
      where: { id: string };
      data: Partial<ItemFixture>;
    }) => {
      const current = findItem(args.where.id);
      if (!current) throw new Error("missing item fixture");
      const definedData = Object.fromEntries(
        Object.entries(args.data).filter(([, value]) => value !== undefined),
      ) as Partial<ItemFixture>;
      const next = { ...current, ...definedData };
      if (
        next.isActive &&
        items.some(
          (other) =>
            other.id !== current.id &&
            other.configurationId === next.configurationId &&
            other.isActive &&
            other.displayOrder === next.displayOrder,
        )
      ) {
        throw duplicateActiveOrderError();
      }
      order.push("item-update");
      Object.assign(current, definedData, { updatedAt: now });
      return cloneItem(current);
    },
  };

  const tx = {
    examinationCourse,
    summativeQuestionConfiguration,
    summativeQuestionConfigurationItem,
    auditLog: {
      create: async (entry: { data: Record<string, unknown> }) => {
        if (entry.data.action === options.failAuditAction) {
          throw new Error("audit failed");
        }
        order.push(`audit:${String(entry.data.action)}`);
        audits.push(structuredClone(entry));
        return entry;
      },
    },
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = (query as { values?: unknown[] }).values ?? [];
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
        const requestedId = String(values[0] ?? "config-a");
        return options.configurationMatchesRoute === false ||
          !findConfiguration(requestedId)
          ? []
          : [{ id: requestedId }];
      }
      if (sql.includes('FROM "summative_question_configuration_items"')) {
        order.push("item");
        if (sql.includes('"full_mark"')) {
          return items
            .filter((current) => current.configurationId === "config-a")
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((current) => ({
              id: current.id,
              full_mark: current.fullMark.toString(),
              is_active: current.isActive,
              is_required: current.isRequired,
            }));
        }
        const requestedId = String(values[0] ?? "item-a");
        const current = findItem(requestedId);
        return current ? [{ id: current.id, is_active: current.isActive }] : [];
      }
      if (sql.includes('FROM "course_learning_outcomes"')) {
        order.push("clo");
        cloQueries.push(query);
        return options.cloMatchesCourse === false
          ? []
          : [
              {
                id: String(values[0] ?? "clo-a"),
                curriculum_version_id: "curriculum-version-a",
                curriculum_course_id: "curriculum-course-a",
              },
            ];
      }
      return [];
    },
  };

  const prisma = {
    examinationCourse,
    summativeQuestionConfiguration,
    $transaction: async (
      operation: (client: typeof tx) => Promise<unknown>,
      transactionOption: unknown,
    ) => {
      transactionOptions.push(transactionOption);
      const configurationSnapshot = configurations.map(cloneConfiguration);
      const itemSnapshot = items.map(cloneItem);
      const auditSnapshot = structuredClone(audits);
      const pointerSnapshot = lockedQuestionConfigurationId;
      try {
        return await operation(tx);
      } catch (error) {
        configurations = configurationSnapshot;
        items = itemSnapshot;
        audits = auditSnapshot;
        lockedQuestionConfigurationId = pointerSnapshot;
        throw error;
      }
    },
  };

  return {
    audits: () => audits,
    cloQueries,
    configurations: () => configurations,
    items: () => items,
    lockedPointer: () => lockedQuestionConfigurationId,
    order,
    readCourseQueries,
    service: new SummativeQuestionConfigurationService(
      prisma as never,
      {
        get: () => ({
          requestId: "request-a",
          audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
        }),
      } as never,
      {
        authorize: async () => authority,
        assertCurrentAuthority: async () => {
          order.push("authority");
        },
      } as never,
    ),
    transactionOptions,
  };
}

function addDto(overrides: Record<string, unknown> = {}) {
  return {
    questionLabel: "Q1",
    displayOrder: 1,
    fullMark: "10",
    isRequired: true,
    isActive: true,
    ...overrides,
  } as never;
}

test("all writes revalidate authority and retain parent-first Serializable locking", async () => {
  const create = harness();
  await create.service.createDraftConfiguration("exam-course-a");
  assert.deepEqual(create.order.slice(0, 4), [
    "authority",
    "examination",
    "examination-course",
    "configuration-create",
  ]);

  const add = harness();
  await add.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({ cloId: "clo-a" }),
  );
  assert.deepEqual(add.order.slice(0, 6), [
    "authority",
    "examination",
    "examination-course",
    "configuration",
    "clo",
    "item-create",
  ]);

  const update = harness({ items: [item()] });
  await update.service.updateItem("exam-course-a", "config-a", "item-a", {
    cloId: "clo-a",
  });
  assert.deepEqual(update.order.slice(0, 7), [
    "authority",
    "examination",
    "examination-course",
    "configuration",
    "item",
    "clo",
    "item-update",
  ]);
  for (const h of [create, add, update]) {
    assert.equal(
      (h.transactionOptions[0] as { isolationLevel: string }).isolationLevel,
      Prisma.TransactionIsolationLevel.Serializable,
    );
  }
});

test("reads are authority-bound, current-parent scoped, and route-object isolated", async () => {
  const current = harness({ items: [item()] });
  assert.equal(
    (await current.service.getConfigurations("exam-course-a")).length,
    1,
  );
  assert.equal(
    (await current.service.getConfiguration("exam-course-a", "config-a")).id,
    "config-a",
  );
  const query = current.readCourseQueries[0] as {
    where: { departmentId: string; archivedAt: null; examination: unknown };
  };
  assert.equal(query.where.departmentId, authority.departmentId);
  assert.equal(query.where.archivedAt, null);
  assert.ok(query.where.examination);

  for (const options of [
    { currentExaminationCourse: false },
    { currentExamination: false },
  ]) {
    const scoped = harness(options);
    await assert.rejects(
      scoped.service.getConfigurations("foreign-or-archived-course"),
      NotFoundException,
    );
  }

  const wrongRoute = harness({ configurationMatchesRoute: false });
  await assert.rejects(
    wrongRoute.service.getConfiguration("course-a", "course-b-config"),
    NotFoundException,
  );
});

test("DRAFT is editable while LOCKED and ARCHIVED block ordinary item mutation", async () => {
  const draft = harness({ items: [item()] });
  await draft.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({ displayOrder: 2 }),
  );
  await draft.service.updateItem("exam-course-a", "config-a", "item-a", {
    questionLabel: "Q1 revised",
  });

  for (const status of [
    SummativeQuestionConfigurationStatus.LOCKED,
    SummativeQuestionConfigurationStatus.ARCHIVED,
  ]) {
    for (const operation of ["add", "update"] as const) {
      const blocked = harness({
        configurations: [configuration({ status })],
        items: [item()],
      });
      await assert.rejects(
        operation === "add"
          ? blocked.service.addItem(
              "exam-course-a",
              "config-a",
              addDto({ displayOrder: 2 }),
            )
          : blocked.service.updateItem(
              "exam-course-a",
              "config-a",
              "item-a",
              { displayOrder: 2 },
            ),
        BadRequestException,
      );
    }
  }
});

test("lock validation is exact, authoritative, dynamic, and fail-closed", async () => {
  await assert.rejects(
    harness().service.lockConfiguration("exam-course-a", "config-a"),
    /At least one active item is required/,
  );

  const exact = harness({
    summativeFullMark: "0.30",
    items: [
      item({ id: "item-a", displayOrder: 1, fullMark: new Prisma.Decimal("0.1") }),
      item({ id: "item-b", displayOrder: 2, fullMark: new Prisma.Decimal("0.2") }),
    ],
  });
  await exact.service.lockConfiguration("exam-course-a", "config-a");
  assert.equal(
    exact.configurations()[0]!.status,
    SummativeQuestionConfigurationStatus.LOCKED,
  );
  assert.equal(exact.lockedPointer(), "config-a");

  for (const [name, fullMark, marks] of [
    ["below", "37.50", ["10", "20"]],
    ["above", "37.50", ["20", "20"]],
  ] as const) {
    const invalid = harness({
      summativeFullMark: fullMark,
      items: marks.map((mark, index) =>
        item({
          id: `item-${index}`,
          displayOrder: index + 1,
          fullMark: new Prisma.Decimal(mark),
        }),
      ),
    });
    await assert.rejects(
      invalid.service.lockConfiguration("exam-course-a", "config-a"),
      BadRequestException,
      name,
    );
  }

  const nonSixty = harness({
    summativeFullMark: "37.50",
    items: [item({ fullMark: new Prisma.Decimal("37.50") })],
  });
  await nonSixty.service.lockConfiguration("exam-course-a", "config-a");

  const optional = harness({ items: [item({ isRequired: false })] });
  await assert.rejects(
    optional.service.lockConfiguration("exam-course-a", "config-a"),
    /all active items must be required/,
  );

  const inactiveIgnored = harness({
    summativeFullMark: "40",
    items: [
      item({ id: "active", fullMark: new Prisma.Decimal("40") }),
      item({
        id: "inactive",
        displayOrder: 2,
        fullMark: new Prisma.Decimal("9999.99"),
        isActive: false,
      }),
    ],
  });
  await inactiveIgnored.service.lockConfiguration("exam-course-a", "config-a");
});

test("more than ten dynamic active rows are supported without a fixed ceiling", async () => {
  const h = harness();
  for (let index = 1; index <= 12; index += 1) {
    await h.service.addItem(
      "exam-course-a",
      "config-a",
      addDto({
        questionLabel: `Q${index}`,
        displayOrder: index,
        fullMark: "1",
      }),
    );
  }
  assert.equal(h.items().length, 12);
  assert.deepEqual(
    h.items().map((current) => current.displayOrder),
    Array.from({ length: 12 }, (_value, index) => index + 1),
  );
});

test("active displayOrder conflicts are controlled and deactivation releases occupancy", async () => {
  const duplicate = harness({ items: [item()] });
  await assert.rejects(
    duplicate.service.addItem(
      "exam-course-a",
      "config-a",
      addDto({ displayOrder: 1 }),
    ),
    ConflictException,
  );

  const history = harness({ items: [item()] });
  await history.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({ displayOrder: 1, isActive: false }),
  );
  assert.equal(history.items().length, 2);

  const reactivation = harness({
    items: [item(), item({ id: "item-b", isActive: false })],
  });
  await assert.rejects(
    reactivation.service.updateItem(
      "exam-course-a",
      "config-a",
      "item-b",
      { isActive: true },
    ),
    ConflictException,
  );

  const moving = harness({
    items: [item(), item({ id: "item-b", displayOrder: 2 })],
  });
  await assert.rejects(
    moving.service.updateItem(
      "exam-course-a",
      "config-a",
      "item-b",
      { displayOrder: 1 },
    ),
    ConflictException,
  );

  const release = harness({ items: [item()] });
  await release.service.updateItem(
    "exam-course-a",
    "config-a",
    "item-a",
    { isActive: false },
  );
  await release.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({ displayOrder: 1 }),
  );
  assert.equal(release.items().filter((current) => current.isActive).length, 1);
});

test("CLO scope uses exact four-field course identity and clear is atomic", async () => {
  const valid = harness();
  await valid.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({ cloId: "clo-a", fullMark: "60" }),
  );
  assert.equal(valid.items()[0]!.cloId, "clo-a");
  assert.equal(
    valid.items()[0]!.curriculumVersionId,
    "curriculum-version-a",
  );
  assert.equal(valid.items()[0]!.curriculumCourseId, "curriculum-course-a");
  const cloQuery = valid.cloQueries[0] as {
    sql?: string;
    text?: string;
    values?: unknown[];
  };
  const cloSql = cloQuery.sql ?? cloQuery.text ?? String(cloQuery);
  assert.match(cloSql, /"department_id" =/);
  assert.match(cloSql, /"curriculum_version_id" =/);
  assert.match(cloSql, /"curriculum_course_id" =/);
  assert.deepEqual(cloQuery.values, [
    "clo-a",
    authority.departmentId,
    "curriculum-version-a",
    "curriculum-course-a",
  ]);
  await valid.service.lockConfiguration("exam-course-a", "config-a");

  for (const label of [
    "cross-department CLO",
    "wrong curriculumVersion CLO",
    "same-version wrong curriculumCourse CLO",
  ]) {
    const denied = harness({ cloMatchesCourse: false });
    await assert.rejects(
      denied.service.addItem(
        "exam-course-a",
        "config-a",
        addDto({ cloId: "foreign-clo" }),
      ),
      NotFoundException,
      label,
    );
    assert.equal(denied.items().length, 0);
  }

  const clear = harness({
    items: [
      item({
        cloId: "clo-a",
        curriculumVersionId: "curriculum-version-a",
        curriculumCourseId: "curriculum-course-a",
      }),
    ],
  });
  await clear.service.updateItem("exam-course-a", "config-a", "item-a", {
    cloId: null,
  });
  assert.equal(clear.items()[0]!.cloId, null);
  assert.equal(clear.items()[0]!.curriculumVersionId, null);
  assert.equal(clear.items()[0]!.curriculumCourseId, null);
});

test("update DTO omitted CLO fields preserve the persisted CLO identity", async () => {
  const h = harness({
    items: [
      item({
        cloId: "clo-a",
        curriculumVersionId: "curriculum-version-a",
        curriculumCourseId: "curriculum-course-a",
      }),
    ],
  });
  const update = new UpdateQuestionConfigurationItemDto();
  update.questionLabel = "Q1 revised";

  assert.equal(Object.hasOwn(update, "cloId"), true);
  assert.equal(update.cloId, undefined);

  await h.service.updateItem(
    "exam-course-a",
    "config-a",
    "item-a",
    update,
  );

  assert.equal(h.items()[0]!.cloId, "clo-a");
  assert.equal(
    h.items()[0]!.curriculumVersionId,
    "curriculum-version-a",
  );
  assert.equal(h.items()[0]!.curriculumCourseId, "curriculum-course-a");
  assert.equal(h.cloQueries.length, 0);
});

test("update DTO null CLO atomically clears the persisted CLO identity", async () => {
  const h = harness({
    items: [
      item({
        cloId: "clo-a",
        curriculumVersionId: "curriculum-version-a",
        curriculumCourseId: "curriculum-course-a",
      }),
    ],
  });
  const update = new UpdateQuestionConfigurationItemDto();
  update.cloId = null;

  await h.service.updateItem(
    "exam-course-a",
    "config-a",
    "item-a",
    update,
  );

  assert.equal(h.items()[0]!.cloId, null);
  assert.equal(h.items()[0]!.curriculumVersionId, null);
  assert.equal(h.items()[0]!.curriculumCourseId, null);
});

test("update DTO active-only transition emits only the transition audit", async () => {
  const h = harness({ items: [item()] });
  const update = new UpdateQuestionConfigurationItemDto();
  update.isActive = false;

  assert.equal(Object.hasOwn(update, "questionLabel"), true);
  assert.equal(update.questionLabel, undefined);

  await h.service.updateItem(
    "exam-course-a",
    "config-a",
    "item-a",
    update,
  );

  assert.deepEqual(
    h.audits().map((audit) => audit.data.action),
    [
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
    ],
  );
});

test("update DTO ordinary field plus active transition emits both audits", async () => {
  const h = harness({ items: [item()] });
  const update = new UpdateQuestionConfigurationItemDto();
  update.questionLabel = "Q1 revised";
  update.isActive = false;

  await h.service.updateItem(
    "exam-course-a",
    "config-a",
    "item-a",
    update,
  );

  assert.deepEqual(
    h.audits().map((audit) => audit.data.action),
    [
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
    ],
  );
});

test("route mismatch and direct foreign object IDs fail safe before mutation", async () => {
  const wrongConfiguration = harness({ configurationMatchesRoute: false });
  await assert.rejects(
    wrongConfiguration.service.addItem(
      "course-a",
      "course-b-config",
      addDto(),
    ),
    NotFoundException,
  );
  assert.equal(wrongConfiguration.items().length, 0);

  const foreignDepartment = harness({ currentExaminationCourse: false });
  await assert.rejects(
    foreignDepartment.service.addItem(
      "foreign-course",
      "foreign-config",
      addDto(),
    ),
    NotFoundException,
  );
});

test("authoritative locked version cannot be archived or silently replaced", async () => {
  const authoritative = harness({
    configurations: [
      configuration({
        status: SummativeQuestionConfigurationStatus.LOCKED,
        lockedAt: now,
      }),
    ],
    lockedQuestionConfigurationId: "config-a",
  });
  await assert.rejects(
    authoritative.service.archiveConfiguration("exam-course-a", "config-a"),
    /currently active authoritative locked configuration/,
  );
  assert.equal(
    authoritative.configurations()[0]!.status,
    SummativeQuestionConfigurationStatus.LOCKED,
  );

  const replacement = harness({
    items: [item()],
    lockedQuestionConfigurationId: "config-existing",
  });
  await assert.rejects(
    replacement.service.lockConfiguration("exam-course-a", "config-a"),
    ConflictException,
  );
  assert.equal(
    replacement.configurations()[0]!.status,
    SummativeQuestionConfigurationStatus.DRAFT,
  );
  assert.equal(replacement.lockedPointer(), "config-existing");
});

test("archive preserves history and repeated archive is deterministically idempotent", async () => {
  const h = harness({ items: [item()] });
  await h.service.archiveConfiguration("exam-course-a", "config-a");
  const archivedAt = h.configurations()[0]!.archivedAt;
  assert.equal(
    h.configurations()[0]!.status,
    SummativeQuestionConfigurationStatus.ARCHIVED,
  );
  assert.ok(archivedAt instanceof Date);
  assert.equal(h.items().length, 1);
  assert.equal(h.audits().length, 1);

  await h.service.archiveConfiguration("exam-course-a", "config-a");
  assert.equal(h.configurations()[0]!.archivedAt?.getTime(), archivedAt!.getTime());
  assert.equal(h.items().length, 1);
  assert.equal(h.audits().length, 1);
});

test("audit state transitions use normalized persisted evidence and request context", async () => {
  const created = harness();
  await created.service.createDraftConfiguration("exam-course-a");
  const createAudit = created.audits()[0]!.data;
  assert.equal(
    createAudit.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_CREATED,
  );
  assert.equal(createAudit.requestId, "request-a");
  assert.equal(createAudit.actorUserId, authority.actorUserId);
  assert.equal(createAudit.actorType, "USER");
  assert.equal(createAudit.departmentId, authority.departmentId);
  assert.equal(createAudit.outcome, "SUCCESS");
  assert.equal(createAudit.targetType, "summative_question_configuration");
  assert.equal(createAudit.targetId, "config-2");
  assert.equal(createAudit.ipAddress, "127.0.0.1");
  assert.equal(createAudit.userAgent, "test-agent");
  assert.deepEqual(createAudit.contextJson, {
    examinationId: "exam-a",
    examinationCourseId: "exam-course-a",
    versionNumber: 2,
    status: SummativeQuestionConfigurationStatus.DRAFT,
  });

  const items = harness();
  await items.service.addItem(
    "exam-course-a",
    "config-a",
    addDto({
      questionLabel: "  Q1  ",
      subQuestionLabel: "   ",
      fullMark: "10.50",
    }),
  );
  let latest = items.audits().at(-1)!.data;
  assert.equal(
    latest.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ADDED,
  );
  assert.deepEqual(latest.contextJson, {
    configurationId: "config-a",
    examinationCourseId: "exam-course-a",
    itemId: "item-1",
    questionLabel: "Q1",
    subQuestionLabel: null,
    displayOrder: 1,
    fullMark: "10.5",
    isRequired: true,
    cloId: null,
    bloomLevel: null,
    isActive: true,
  });

  await items.service.updateItem("exam-course-a", "config-a", "item-1", {
    questionLabel: "  Q1 revised  ",
  });
  latest = items.audits().at(-1)!.data;
  assert.equal(
    latest.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
  );
  assert.equal(
    (latest.contextJson as { questionLabel: string }).questionLabel,
    "Q1 revised",
  );

  await items.service.updateItem("exam-course-a", "config-a", "item-1", {
    isActive: false,
  });
  assert.equal(
    items.audits().at(-1)!.data.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
  );
  await items.service.updateItem("exam-course-a", "config-a", "item-1", {
    isActive: true,
  });
  assert.equal(
    items.audits().at(-1)!.data.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ACTIVATED,
  );

  const lock = harness({ items: [item()] });
  await lock.service.lockConfiguration("exam-course-a", "config-a");
  assert.deepEqual(lock.audits()[0]!.data.contextJson, {
    examinationCourseId: "exam-course-a",
    configurationId: "config-a",
    versionNumber: 1,
    summativeFullMark: "60",
    configuredTotal: "60",
    activeItemCount: 1,
    status: SummativeQuestionConfigurationStatus.LOCKED,
  });

  const archive = harness();
  await archive.service.archiveConfiguration("exam-course-a", "config-a");
  assert.equal(
    archive.audits()[0]!.data.action,
    SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ARCHIVED,
  );

  const serialized = JSON.stringify([
    ...created.audits(),
    ...items.audits(),
    ...lock.audits(),
    ...archive.audits(),
  ]);
  assert.doesNotMatch(
    serialized,
    /questionText|questionBody|questionPaper|candidateMark|examinerMark|token|credential|secret/,
  );
});

test("ordinary item changes plus activation changes produce both deterministic audits", async () => {
  const h = harness({ items: [item()] });
  await h.service.updateItem("exam-course-a", "config-a", "item-a", {
    questionLabel: "Q1 revised",
    isActive: false,
  });
  assert.deepEqual(
    h.audits().map((audit) => audit.data.action),
    [
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
    ],
  );
});

test("audit failure rolls back every protected operation including both lock writes", async () => {
  const cases = [
    {
      action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_CREATED,
      build: () =>
        harness({
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_CREATED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.createDraftConfiguration("exam-course-a"),
      assertState: (h: ReturnType<typeof harness>) =>
        assert.equal(h.configurations().length, 1),
    },
    {
      action:
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ADDED,
      build: () =>
        harness({
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ADDED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.addItem("exam-course-a", "config-a", addDto()),
      assertState: (h: ReturnType<typeof harness>) =>
        assert.equal(h.items().length, 0),
    },
    {
      action:
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
      build: () =>
        harness({
          items: [item()],
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.updateItem("exam-course-a", "config-a", "item-a", {
          questionLabel: "changed",
        }),
      assertState: (h: ReturnType<typeof harness>) =>
        assert.equal(h.items()[0]!.questionLabel, "Q1"),
    },
    {
      action:
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
      build: () =>
        harness({
          items: [item()],
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.updateItem("exam-course-a", "config-a", "item-a", {
          questionLabel: "changed",
          isActive: false,
        }),
      assertState: (h: ReturnType<typeof harness>) => {
        assert.equal(h.items()[0]!.questionLabel, "Q1");
        assert.equal(h.items()[0]!.isActive, true);
      },
    },
    {
      action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_LOCKED,
      build: () =>
        harness({
          items: [item()],
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_LOCKED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.lockConfiguration("exam-course-a", "config-a"),
      assertState: (h: ReturnType<typeof harness>) => {
        assert.equal(
          h.configurations()[0]!.status,
          SummativeQuestionConfigurationStatus.DRAFT,
        );
        assert.equal(h.configurations()[0]!.lockedAt, null);
        assert.equal(h.lockedPointer(), null);
      },
    },
    {
      action:
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ARCHIVED,
      build: () =>
        harness({
          failAuditAction:
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ARCHIVED,
        }),
      invoke: (h: ReturnType<typeof harness>) =>
        h.service.archiveConfiguration("exam-course-a", "config-a"),
      assertState: (h: ReturnType<typeof harness>) => {
        assert.equal(
          h.configurations()[0]!.status,
          SummativeQuestionConfigurationStatus.DRAFT,
        );
        assert.equal(h.configurations()[0]!.archivedAt, null);
      },
    },
  ];

  for (const current of cases) {
    const h = current.build();
    await assert.rejects(current.invoke(h), /audit failed/, current.action);
    current.assertState(h);
    assert.equal(h.audits().length, 0);
  }
});
