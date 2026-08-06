import { Prisma, PrismaClient } from "@prisma/client";

import { llb20252026CurriculumDefinition as canonical } from "../data/llb-2025-2026-curriculum.definition";

export const CANONICAL_FINGERPRINT =
  "b25fb4585a364c35d9ace53ae20e9c8677fa6c4759fbed6d02bc9f4983598b33";
export const CANONICAL_CURRICULUM_CODE = "LLB-HONS-2025-2026-V1";
export const BACKFILL_ADVISORY_LOCK_KEY = 4_211_202_520_260_001n;

export const LEGACY_TITLE_TRANSITIONS = {
  "0421-3101": [
    "The Code of Criminal Procedure-I",
    "Law of Criminal Procedure-I",
  ],
  "0421-3102": [
    "The Penal Code & The Special Powers Act-I",
    "Law of Crimes (Substantive)-I",
  ],
  "0421-3105": [
    "Constitutional Laws of the UK, USA, and India",
    "The Public Demands Recovery Act & The Registration Act",
  ],
  "0421-3106": ["Equity and Law of Trust", "Comparative Constitutional Law"],
  "0421-3201": [
    "The Code of Criminal Procedure-II",
    "Law of Criminal Procedure-II",
  ],
  "0421-3202": [
    "The Penal Code & The Special Powers Act-II",
    "Law of Crimes (Substantive)-II",
  ],
  "0421-3205": [
    "The Public Demands Recovery Act & The Registration Act",
    "Equity and Law of Trust",
  ],
  "0421-4101": ["The Code of Civil Procedure-I", "Law of Civil Procedure-I"],
  "0421-4105": [
    "Law of Transfer of Property",
    "The Civil Courts Act, the Court Fees Act, the Suits Valuation Act, and the Stamp Act",
  ],
  "0421-4201": ["The Code of Civil Procedure-II", "Law of Civil Procedure-II"],
  "0421-4205": [
    "The Civil Courts Act, the Court Fees Act, the Suits Valuation Act, and the Stamp Act",
    "Law of Transfer of Property",
  ],
} as const;

export type TargetClassification = "FRESH_APPLY" | "EXACT_NOOP";

export interface ScopedCourseState {
  readonly id: string;
  readonly departmentId: string;
  readonly academicProgramId: string | null;
  readonly code: string;
  readonly title: string;
  readonly creditHours: number;
  readonly status: string;
  readonly archivedAt: Date | null;
}

export interface CurriculumState {
  readonly id: string;
  readonly departmentId: string;
  readonly academicProgramId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly effectiveAcademicSessionCode: string;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly durationYears: number;
  readonly totalSemesters: number;
  readonly creditsOffered: number;
  readonly minimumCreditsRequired: number;
  readonly totalCourses: number;
  readonly totalProgrammeMarks: number;
  readonly coreCredits: number;
  readonly gedCredits: number;
  readonly capstoneCredits: number;
  readonly coreCourseCount: number;
  readonly gedCourseCount: number;
  readonly capstoneCourseCount: number;
  readonly teachingWeeksPerSemester: number | null;
  readonly notionalHoursPerCredit: number | null;
  readonly approvedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface TemplateState {
  readonly id: string;
  readonly departmentId: string;
  readonly academicProgramId: string | null;
  readonly code: string;
  readonly versionNumber: number;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly totalMarks: number;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly approvedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface ComponentState {
  readonly id: string;
  readonly departmentId: string;
  readonly assessmentTemplateId: string;
  readonly templateCode: string;
  readonly code: string;
  readonly displayName: string;
  readonly groupCode: string | null;
  readonly maximumMarks: number;
  readonly displayOrder: number;
  readonly isRequired: boolean;
}

export interface BindingState {
  readonly id: string;
  readonly departmentId: string;
  readonly curriculumVersionId: string;
  readonly courseId: string;
  readonly assessmentTemplateId: string;
  readonly templateCode: string;
  readonly categoryCode: string;
  readonly academicYearNumber: number;
  readonly semesterNumber: number;
  readonly displayOrder: number;
  readonly courseCodeSnapshot: string;
  readonly courseTitleSnapshot: string;
  readonly creditHoursSnapshot: number;
  readonly totalMarksSnapshot: number;
  readonly isRequired: boolean;
}

export interface BackfillTargetState {
  readonly department: {
    readonly id: string;
    readonly code: string;
    readonly status: string;
    readonly archivedAt: Date | null;
    readonly deletedAt: Date | null;
  };
  readonly programme: {
    readonly id: string;
    readonly departmentId: string;
    readonly code: string;
    readonly status: string;
    readonly archivedAt: Date | null;
  };
  readonly courses: readonly ScopedCourseState[];
  readonly curriculumVersions: readonly CurriculumState[];
  readonly templates: readonly TemplateState[];
  readonly components: readonly ComponentState[];
  readonly bindings: readonly BindingState[];
}

export interface TitleUpdatePlan {
  readonly courseId: string;
  readonly courseCode: string;
  readonly oldTitle: string;
  readonly newTitle: string;
  readonly creditHours: number;
}

export interface BackfillPlan {
  readonly classification: TargetClassification;
  readonly departmentId: string;
  readonly programmeId: string;
  readonly canonicalCourseIds: readonly string[];
  readonly titleUpdates: readonly TitleUpdatePlan[];
  readonly archivedExtras: readonly string[];
  readonly createCounts: {
    readonly curriculumVersions: number;
    readonly templates: number;
    readonly components: number;
    readonly bindings: number;
    readonly total: number;
  };
}

export class BackfillConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackfillConflictError";
  }
}

export type BackfillCliMode = "plan" | "apply";

export function parseBackfillArguments(args: readonly string[]) {
  const values = new Map<string, string>();
  for (const [index, argument] of args.entries()) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match)
      throw new BackfillConflictError(
        `Invalid argument format at position ${index + 1}`,
      );
    const key = match[1]!;
    if (values.has(key)) fail(`Duplicate argument: --${key}`);
    values.set(key, match[2]!);
  }
  const mode = (values.get("mode") ?? "plan") as BackfillCliMode;
  if (mode !== "plan" && mode !== "apply") fail("Mode must be plan or apply");
  const allowed = new Set(
    mode === "apply"
      ? [
          "mode",
          "confirm-fingerprint",
          "expected-database-name",
          "actor-user-id",
          "reason",
          "expected-title-updates",
        ]
      : ["mode", "expected-database-name"],
  );
  for (const key of values.keys())
    if (!allowed.has(key)) fail(`Unsupported argument: --${key}`);
  return { mode, values };
}

const fail = (message: string): never => {
  throw new BackfillConflictError(message);
};

const expectedCurriculum = (departmentId: string, programmeId: string) => ({
  departmentId,
  academicProgramId: programmeId,
  code: canonical.metadata.curriculumCode,
  name: "LL.B. (Honours) Curriculum 2025-2026",
  description: canonical.metadata.sourceNote,
  status: "DRAFT" as const,
  effectiveAcademicSessionCode: canonical.metadata.applicableSession,
  effectiveFrom: null,
  effectiveTo: null,
  durationYears: canonical.metadata.durationYears,
  totalSemesters: canonical.metadata.totalSemesters,
  creditsOffered: canonical.metadata.creditsOffered,
  minimumCreditsRequired: canonical.metadata.minimumGraduatingCredits,
  totalCourses: canonical.metadata.totalCourses,
  totalProgrammeMarks: canonical.metadata.totalMarks,
  coreCredits: 98,
  gedCredits: 35,
  capstoneCredits: 7,
  coreCourseCount: 42,
  gedCourseCount: 13,
  capstoneCourseCount: 3,
  teachingWeeksPerSemester: canonical.metadata.teachingWeeksPerSemester,
  notionalHoursPerCredit: canonical.metadata.notionalHoursPerCredit,
  approvedAt: null,
  archivedAt: null,
});

const sameScalarFields = (
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  label: string,
) => {
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) fail(`${label} field mismatch: ${field}`);
  }
};

export function planCanonicalBackfill(
  state: BackfillTargetState,
): BackfillPlan {
  if (
    state.department.code !== canonical.metadata.departmentCode ||
    state.department.status !== "ACTIVE" ||
    state.department.archivedAt !== null ||
    state.department.deletedAt !== null
  )
    fail("Department 0421 is archived, deleted, or not ACTIVE");
  if (
    state.programme.code !== canonical.metadata.academicProgramCode ||
    state.programme.departmentId !== state.department.id ||
    state.programme.status !== "ACTIVE" ||
    state.programme.archivedAt !== null
  )
    fail("LLB programme is missing, cross-scoped, archived, or not ACTIVE");

  const canonicalCodes = new Set<string>(
    canonical.courses.map((course) => course.courseCode),
  );
  const byCode = new Map<string, ScopedCourseState[]>();
  for (const course of state.courses)
    byCode.set(course.code, [...(byCode.get(course.code) ?? []), course]);
  const titleUpdates: TitleUpdatePlan[] = [];
  const canonicalCourseIds: string[] = [];
  for (const expected of canonical.courses) {
    const matches = byCode.get(expected.courseCode) ?? [];
    if (matches.length !== 1)
      fail(
        `${expected.courseCode} expected exactly one scoped course; found ${matches.length}`,
      );
    const course = matches[0]!;
    if (course.departmentId !== state.department.id)
      fail(`${course.code} belongs to the wrong department`);
    if (course.academicProgramId !== state.programme.id)
      fail(`${course.code} belongs to the wrong programme`);
    if (course.status !== "ACTIVE" || course.archivedAt !== null)
      fail(`${course.code} is archived or not ACTIVE`);
    if (course.creditHours !== expected.credits)
      fail(`${course.code} credit mismatch`);
    canonicalCourseIds.push(course.id);
    const transition =
      LEGACY_TITLE_TRANSITIONS[
        course.code as keyof typeof LEGACY_TITLE_TRANSITIONS
      ];
    if (!transition) {
      if (course.title !== expected.titleSnapshot)
        fail(`${course.code} title mismatch`);
    } else if (course.title === transition[0]) {
      if (expected.titleSnapshot !== transition[1])
        fail(`${course.code} transition does not match canonical title`);
      titleUpdates.push({
        courseId: course.id,
        courseCode: course.code,
        oldTitle: transition[0],
        newTitle: transition[1],
        creditHours: expected.credits,
      });
    } else if (course.title !== transition[1]) {
      fail(`${course.code} title is neither audited legacy nor canonical`);
    }
  }

  const extras = state.courses.filter(
    (course) => !canonicalCodes.has(course.code),
  );
  const activeExtras = extras.filter(
    (course) => course.status === "ACTIVE" && course.archivedAt === null,
  );
  if (activeExtras.length)
    fail(
      `Unexpected active Law course: ${activeExtras
        .map((course) => course.code)
        .sort()
        .join(",")}`,
    );
  for (const code of ["LAW-101", "LAW-999"]) {
    const row = extras.find((course) => course.code === code);
    if (row && (row.status !== "ARCHIVED" || row.archivedAt === null))
      fail(`${code} must remain archived`);
  }

  const foundationCount =
    state.curriculumVersions.length +
    state.templates.length +
    state.components.length +
    state.bindings.length;
  if (foundationCount === 0) {
    if (titleUpdates.length !== 11)
      fail(
        `Fresh foundation requires exactly 11 audited title corrections; found ${titleUpdates.length}`,
      );
    return {
      classification: "FRESH_APPLY",
      departmentId: state.department.id,
      programmeId: state.programme.id,
      canonicalCourseIds,
      titleUpdates,
      archivedExtras: extras.map((course) => course.code).sort(),
      createCounts: {
        curriculumVersions: 1,
        templates: 3,
        components: 8,
        bindings: 58,
        total: 70,
      },
    };
  }

  if (
    state.curriculumVersions.length !== 1 ||
    state.templates.length !== 3 ||
    state.components.length !== 8 ||
    state.bindings.length !== 58
  )
    fail("Partial canonical foundation state detected");
  const curriculum = state.curriculumVersions[0]!;
  sameScalarFields(
    curriculum as unknown as Record<string, unknown>,
    expectedCurriculum(state.department.id, state.programme.id),
    "CurriculumVersion",
  );
  const templateByCode = new Map(
    state.templates.map((template) => [template.code, template]),
  );
  for (const expected of canonical.assessmentTemplates) {
    const actual = templateByCode.get(expected.code);
    if (!actual) fail(`Missing assessment template: ${expected.code}`);
    sameScalarFields(
      actual as unknown as Record<string, unknown>,
      {
        departmentId: state.department.id,
        academicProgramId: state.programme.id,
        code: expected.code,
        versionNumber: expected.version,
        name: expected.name,
        description: null,
        status: "DRAFT",
        totalMarks: expected.totalMarks,
        effectiveFrom: null,
        effectiveTo: null,
        approvedAt: null,
        archivedAt: null,
      },
      `Template ${expected.code}`,
    );
    const components = state.components
      .filter((component) => component.templateCode === expected.code)
      .sort((left, right) => left.displayOrder - right.displayOrder);
    if (components.length !== expected.components.length)
      fail(`${expected.code} component count mismatch`);
    expected.components.forEach((component, index) =>
      sameScalarFields(
        components[index] as unknown as Record<string, unknown>,
        {
          departmentId: state.department.id,
          assessmentTemplateId: actual!.id,
          templateCode: expected.code,
          code: component.code,
          displayName: component.displayName,
          groupCode: null,
          maximumMarks: component.maximumMarks,
          displayOrder: component.displayOrder,
          isRequired: component.required,
        },
        `Component ${expected.code}/${component.code}`,
      ),
    );
  }
  const courseByCode = new Map(
    state.courses.map((course) => [course.code, course]),
  );
  const bindingByCode = new Map(
    state.bindings.map((binding) => [binding.courseCodeSnapshot, binding]),
  );
  for (const expected of canonical.courses) {
    const binding = bindingByCode.get(expected.courseCode);
    if (!binding) fail(`Missing curriculum binding: ${expected.courseCode}`);
    const course = courseByCode.get(expected.courseCode);
    const template = templateByCode.get(expected.assessmentTemplateCode);
    if (!course || !template)
      fail(`Invalid binding relation: ${expected.courseCode}`);
    sameScalarFields(
      binding as unknown as Record<string, unknown>,
      {
        departmentId: state.department.id,
        curriculumVersionId: curriculum.id,
        courseId: course!.id,
        assessmentTemplateId: template!.id,
        templateCode: template!.code,
        categoryCode: expected.category,
        academicYearNumber: expected.academicYear,
        semesterNumber: expected.semester,
        displayOrder: expected.displayOrder,
        courseCodeSnapshot: expected.courseCode,
        courseTitleSnapshot: expected.titleSnapshot,
        creditHoursSnapshot: expected.credits,
        totalMarksSnapshot: expected.totalMarks,
        isRequired: true,
      },
      `Binding ${expected.courseCode}`,
    );
  }
  if (titleUpdates.length !== 0)
    fail("Existing foundation rows require canonical course titles");
  return {
    classification: "EXACT_NOOP",
    departmentId: state.department.id,
    programmeId: state.programme.id,
    canonicalCourseIds,
    titleUpdates: [],
    archivedExtras: extras.map((course) => course.code).sort(),
    createCounts: {
      curriculumVersions: 0,
      templates: 0,
      components: 0,
      bindings: 0,
      total: 0,
    },
  };
}

export interface ApplyGuardInput {
  readonly fingerprint: string;
  readonly expectedDatabaseName: string;
  readonly actualDatabaseName: string;
  readonly actorUserId: string;
  readonly reason: string;
  readonly expectedTitleUpdates: number;
}

export function normalizeAuditReason(reason: string): string {
  const normalized = reason.trim();
  if (
    normalized.length < 12 ||
    normalized.length > 500 ||
    /^(test|placeholder|todo|n\/a)/i.test(normalized)
  )
    fail("A bounded non-placeholder auditable reason is required");
  return normalized;
}

export function validateApplyGuard(
  plan: BackfillPlan,
  input: ApplyGuardInput,
): string {
  if (input.fingerprint !== CANONICAL_FINGERPRINT)
    fail("Canonical fingerprint confirmation mismatch");
  if (
    !input.expectedDatabaseName.trim() ||
    input.actualDatabaseName !== input.expectedDatabaseName
  )
    fail("Connected database name does not match explicit expectation");
  if (!input.actorUserId.trim()) fail("Actor user ID is required");
  const normalizedReason = normalizeAuditReason(input.reason);
  if (![0, 11].includes(input.expectedTitleUpdates))
    fail("Expected title updates must be 0 or 11");
  if (plan.titleUpdates.length !== input.expectedTitleUpdates)
    fail(
      `Expected ${input.expectedTitleUpdates} title updates but planned ${plan.titleUpdates.length}`,
    );
  if (input.expectedTitleUpdates === 0 && plan.classification !== "EXACT_NOOP")
    fail("Zero title updates is permitted only for an exact rerun");
  if (
    input.expectedTitleUpdates === 11 &&
    plan.classification !== "FRESH_APPLY"
  )
    fail("Eleven title updates requires a fresh target");
  return normalizedReason;
}

export interface OverallAuditInput {
  readonly curriculumVersionId: string;
  readonly sources: readonly {
    readonly kind: string;
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly createdRows: BackfillPlan["createCounts"];
}

export interface FreshWritePort {
  updateTitle(update: TitleUpdatePlan): Promise<number>;
  auditTitle(update: TitleUpdatePlan): Promise<void>;
  createFoundation(): Promise<string>;
  auditOverall(input: OverallAuditInput): Promise<void>;
  verifyExactNoop(): Promise<void>;
}

export async function executeFreshWrites(
  plan: BackfillPlan,
  port: FreshWritePort,
): Promise<void> {
  if (plan.classification !== "FRESH_APPLY") return;
  for (const update of plan.titleUpdates) {
    const count = await port.updateTitle(update);
    if (count !== 1)
      fail(`${update.courseCode} compare-and-swap affected ${count} rows`);
    await port.auditTitle(update);
  }
  const curriculumVersionId = await port.createFoundation();
  await port.auditOverall({
    curriculumVersionId,
    sources: canonical.sources.map(({ kind, path, sha256 }) => ({
      kind,
      path,
      sha256,
    })),
    createdRows: plan.createCounts,
  });
  await port.verifyExactNoop();
}

type TransactionClient = Prisma.TransactionClient;

const numberValue = (value: Prisma.Decimal | number) => Number(value);

async function loadTargetState(
  tx: TransactionClient,
): Promise<BackfillTargetState> {
  const departments = await tx.department.findMany({
    where: { code: canonical.metadata.departmentCode },
    select: {
      id: true,
      code: true,
      status: true,
      archivedAt: true,
      deletedAt: true,
    },
  });
  if (departments.length !== 1)
    fail(`Department 0421 expected exactly once; found ${departments.length}`);
  const department = departments[0]!;
  const programmes = await tx.academicProgram.findMany({
    where: {
      departmentId: department.id,
      code: canonical.metadata.academicProgramCode,
    },
    select: {
      id: true,
      departmentId: true,
      code: true,
      status: true,
      archivedAt: true,
    },
  });
  if (programmes.length !== 1)
    fail(`LLB programme expected exactly once; found ${programmes.length}`);
  const programme = programmes[0]!;
  const courses = (
    await tx.course.findMany({
      where: { departmentId: department.id },
      select: {
        id: true,
        departmentId: true,
        academicProgramId: true,
        code: true,
        title: true,
        creditHours: true,
        status: true,
        archivedAt: true,
      },
    })
  ).map((course) => ({
    ...course,
    creditHours: numberValue(course.creditHours),
  }));
  const curriculumVersions = (
    await tx.curriculumVersion.findMany({
      where: {
        departmentId: department.id,
        academicProgramId: programme.id,
        code: canonical.metadata.curriculumCode,
      },
    })
  ).map((row) => ({
    ...row,
    creditsOffered: numberValue(row.creditsOffered),
    minimumCreditsRequired: numberValue(row.minimumCreditsRequired),
    totalProgrammeMarks: numberValue(row.totalProgrammeMarks),
    coreCredits: numberValue(row.coreCredits),
    gedCredits: numberValue(row.gedCredits),
    capstoneCredits: numberValue(row.capstoneCredits),
  }));
  const templateCodes = canonical.assessmentTemplates.map(
    (template) => template.code,
  );
  const templates = (
    await tx.courseAssessmentTemplate.findMany({
      where: {
        departmentId: department.id,
        code: { in: [...templateCodes] },
        versionNumber: 1,
      },
    })
  ).map((row) => ({ ...row, totalMarks: numberValue(row.totalMarks) }));
  const templateIds = templates.map((template) => template.id);
  const templateById = new Map(
    templates.map((template) => [template.id, template.code]),
  );
  const components = (
    await tx.assessmentTemplateComponent.findMany({
      where: {
        departmentId: department.id,
        assessmentTemplateId: { in: templateIds },
      },
    })
  ).map((row) => ({
    ...row,
    templateCode: templateById.get(row.assessmentTemplateId) ?? "",
    maximumMarks: numberValue(row.maximumMarks),
  }));
  const curriculumIds = curriculumVersions.map((curriculum) => curriculum.id);
  const bindings = (
    await tx.curriculumCourse.findMany({
      where: {
        departmentId: department.id,
        curriculumVersionId: { in: curriculumIds },
      },
      include: { assessmentTemplate: { select: { code: true } } },
    })
  ).map(({ assessmentTemplate, ...row }) => ({
    ...row,
    templateCode: assessmentTemplate.code,
    creditHoursSnapshot: numberValue(row.creditHoursSnapshot),
    totalMarksSnapshot: numberValue(row.totalMarksSnapshot),
  }));
  return {
    department,
    programme,
    courses,
    curriculumVersions,
    templates,
    components,
    bindings,
  };
}

async function validateActor(
  tx: TransactionClient,
  actorUserId: string,
  departmentId: string,
): Promise<void> {
  const now = new Date();
  const actor = await tx.user.findFirst({
    where: {
      id: actorUserId,
      departmentId,
      status: "ACTIVE",
      archivedAt: null,
      deletedAt: null,
      userRoles: {
        some: {
          departmentId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          role: {
            departmentId,
            code: "department_admin",
            archivedAt: null,
          },
        },
      },
    },
    select: { id: true },
  });
  if (!actor) fail("Actor is not an active Department of Law department_admin");
}

async function createFoundation(
  tx: TransactionClient,
  state: BackfillTargetState,
): Promise<string> {
  const curriculum = await tx.curriculumVersion.create({
    data: expectedCurriculum(state.department.id, state.programme.id),
    select: { id: true },
  });
  const templateIds = new Map<string, string>();
  for (const template of canonical.assessmentTemplates) {
    const created = await tx.courseAssessmentTemplate.create({
      data: {
        departmentId: state.department.id,
        academicProgramId: state.programme.id,
        code: template.code,
        versionNumber: template.version,
        name: template.name,
        description: null,
        status: "DRAFT",
        totalMarks: template.totalMarks,
      },
      select: { id: true },
    });
    templateIds.set(template.code, created.id);
    for (const component of template.components)
      await tx.assessmentTemplateComponent.create({
        data: {
          departmentId: state.department.id,
          assessmentTemplateId: created.id,
          code: component.code,
          displayName: component.displayName,
          groupCode: null,
          maximumMarks: component.maximumMarks,
          displayOrder: component.displayOrder,
          isRequired: component.required,
        },
      });
  }
  const courseByCode = new Map(
    state.courses.map((course) => [course.code, course]),
  );
  for (const course of canonical.courses) {
    const existing = courseByCode.get(course.courseCode)!;
    await tx.curriculumCourse.create({
      data: {
        departmentId: state.department.id,
        curriculumVersionId: curriculum.id,
        courseId: existing.id,
        assessmentTemplateId: templateIds.get(course.assessmentTemplateCode)!,
        categoryCode: course.category,
        academicYearNumber: course.academicYear,
        semesterNumber: course.semester,
        displayOrder: course.displayOrder,
        courseCodeSnapshot: course.courseCode,
        courseTitleSnapshot: course.titleSnapshot,
        creditHoursSnapshot: course.credits,
        totalMarksSnapshot: course.totalMarks,
        isRequired: true,
      },
    });
  }
  return curriculum.id;
}

export type ApplyBackfillInput = Omit<ApplyGuardInput, "actualDatabaseName">;

export async function executeWithRequiredAdvisoryLock<T>(
  acquire: () => Promise<readonly { acquired: boolean }[]>,
  operation: () => Promise<T>,
): Promise<T> {
  const rows = await acquire();
  if (rows.length !== 1 || rows[0]?.acquired !== true)
    fail("Canonical curriculum backfill advisory lock is unavailable");
  return operation();
}

export function validateOptionalDatabaseExpectation(
  actualDatabaseName: string,
  expectedDatabaseName?: string,
): void {
  if (
    expectedDatabaseName !== undefined &&
    actualDatabaseName !== expectedDatabaseName
  )
    fail("Connected database name does not match explicit expectation");
}

export function validateRequiredDatabaseExpectation(
  actualDatabaseName: string,
  expectedDatabaseName: string,
): void {
  if (
    !expectedDatabaseName.trim() ||
    actualDatabaseName !== expectedDatabaseName
  )
    fail("Connected database name does not match explicit expectation");
}

export async function executeAfterRequiredDatabaseExpectation<T>(
  actualDatabaseName: string,
  expectedDatabaseName: string,
  operation: () => Promise<T>,
): Promise<T> {
  validateRequiredDatabaseExpectation(actualDatabaseName, expectedDatabaseName);
  return operation();
}

export async function runPlan(
  prisma: PrismaClient,
  expectedDatabaseName?: string,
): Promise<{ readonly databaseName: string; readonly plan: BackfillPlan }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      return executeWithRequiredAdvisoryLock(
        () =>
          tx.$queryRaw<readonly { acquired: boolean }[]>(
            Prisma.sql`SELECT pg_try_advisory_xact_lock_shared(${BACKFILL_ADVISORY_LOCK_KEY}) AS "acquired"`,
          ),
        async () => {
          const rows = await tx.$queryRaw<readonly { databaseName: string }[]>(
            Prisma.sql`SELECT current_database() AS "databaseName"`,
          );
          const databaseName = rows[0]?.databaseName ?? "";
          validateOptionalDatabaseExpectation(
            databaseName,
            expectedDatabaseName,
          );
          const state = await loadTargetState(tx);
          return { databaseName, plan: planCanonicalBackfill(state) };
        },
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

export async function runApply(
  prisma: PrismaClient,
  input: ApplyBackfillInput,
): Promise<BackfillPlan> {
  return prisma.$transaction(
    async (tx) => {
      return executeWithRequiredAdvisoryLock(
        () =>
          tx.$queryRaw<readonly { acquired: boolean }[]>(
            Prisma.sql`SELECT pg_try_advisory_xact_lock(${BACKFILL_ADVISORY_LOCK_KEY}) AS "acquired"`,
          ),
        async () => {
          const databaseRows = await tx.$queryRaw<
            readonly { databaseName: string }[]
          >(Prisma.sql`SELECT current_database() AS "databaseName"`);
          const actualDatabaseName = databaseRows[0]?.databaseName ?? "";
          return executeAfterRequiredDatabaseExpectation(
            actualDatabaseName,
            input.expectedDatabaseName,
            async () => {
              const state = await loadTargetState(tx);
              const plan = planCanonicalBackfill(state);
              const normalizedReason = validateApplyGuard(plan, {
                ...input,
                actualDatabaseName,
              });
              await validateActor(tx, input.actorUserId, state.department.id);
              if (plan.classification === "EXACT_NOOP") return plan;
              await executeFreshWrites(plan, {
                updateTitle: async (update) =>
                  (
                    await tx.course.updateMany({
                      where: {
                        id: update.courseId,
                        departmentId: state.department.id,
                        academicProgramId: state.programme.id,
                        code: update.courseCode,
                        title: update.oldTitle,
                        creditHours: update.creditHours,
                        status: "ACTIVE",
                        archivedAt: null,
                      },
                      data: { title: update.newTitle },
                    })
                  ).count,
                auditTitle: async (update) => {
                  await tx.auditLog.create({
                    data: {
                      actorUserId: input.actorUserId,
                      actorType: "USER",
                      departmentId: state.department.id,
                      action: "course.canonical-title.corrected",
                      targetType: "Course",
                      targetId: update.courseId,
                      outcome: "SUCCESS",
                      contextJson: {
                        reason: normalizedReason,
                        programmeId: state.programme.id,
                        curriculumCode: CANONICAL_CURRICULUM_CODE,
                        fingerprint: CANONICAL_FINGERPRINT,
                        courseCode: update.courseCode,
                        oldTitle: update.oldTitle,
                        newTitle: update.newTitle,
                      },
                    },
                  });
                },
                createFoundation: () => createFoundation(tx, state),
                auditOverall: async (overall) => {
                  await tx.auditLog.create({
                    data: {
                      actorUserId: input.actorUserId,
                      actorType: "USER",
                      departmentId: state.department.id,
                      action: "curriculum.canonical-backfill.applied",
                      targetType: "CurriculumVersion",
                      targetId: overall.curriculumVersionId,
                      outcome: "SUCCESS",
                      contextJson: {
                        reason: normalizedReason,
                        programmeId: state.programme.id,
                        curriculumCode: CANONICAL_CURRICULUM_CODE,
                        fingerprint: CANONICAL_FINGERPRINT,
                        sources: overall.sources,
                        titleUpdates: plan.titleUpdates.length,
                        createdRows: overall.createdRows,
                        preservedCourseIds: plan.canonicalCourseIds.length,
                        mode: "APPLY",
                      },
                    },
                  });
                },
                verifyExactNoop: async () => {
                  const verified = planCanonicalBackfill(
                    await loadTargetState(tx),
                  );
                  if (verified.classification !== "EXACT_NOOP")
                    fail("Post-write verification did not produce EXACT_NOOP");
                },
              });
              return plan;
            },
          );
        },
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

export function sanitizedSummary(
  mode: "PLAN" | "APPLY",
  databaseNameMatch: boolean | null,
  plan: BackfillPlan,
) {
  return {
    mode,
    databaseNameMatch,
    departmentCode: canonical.metadata.departmentCode,
    programmeCode: canonical.metadata.academicProgramCode,
    canonicalFingerprint: CANONICAL_FINGERPRINT,
    targetClassification: plan.classification,
    canonicalCourseCount: canonical.courses.length,
    preservedCourseIdCount: plan.canonicalCourseIds.length,
    plannedTitleUpdates: plan.titleUpdates.length,
    curriculumRowsToCreate: plan.createCounts.curriculumVersions,
    templatesToCreate: plan.createCounts.templates,
    componentsToCreate: plan.createCounts.components,
    curriculumBindingsToCreate: plan.createCounts.bindings,
    archivedExtrasObserved: plan.archivedExtras,
    finalVerificationCounts:
      plan.classification === "EXACT_NOOP"
        ? { curriculumVersions: 1, templates: 3, components: 8, bindings: 58 }
        : null,
    noOp: plan.classification === "EXACT_NOOP",
  };
}
