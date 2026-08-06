import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  LLB_COURSE_CATEGORIES,
  llb20252026CurriculumDefinition as definition,
  type LlbCourseCategory,
} from "./llb-2025-2026-curriculum.definition";

const sourceExpectations = [
  {
    kind: "ACADEMIC_ORDINANCE",
    path: "docs/academic-sources/llb/Academic_Ordinance_LLB.pdf",
    sha256: "283ac34518c9a23364ddc1a9ccb12e882a4026605418c9cc254ebab295d158f0",
  },
  {
    kind: "OBE_CURRICULUM",
    path: "docs/academic-sources/llb/Outcome-Based_Education_Curriculum_LLB.pdf",
    sha256: "61872ba54cd39a3b8452fa20f3457f6749a834a41d6a786fb93e88f07063779c",
  },
] as const;

const categoryExpectations = {
  CORE: { courseCount: 42, credits: 98 },
  GED: { courseCount: 13, credits: 35 },
  CAPSTONE: { courseCount: 3, credits: 7 },
} as const satisfies Readonly<
  Record<
    LlbCourseCategory,
    { readonly courseCount: number; readonly credits: number }
  >
>;

const semesterExpectations = [
  {
    academicYear: 1,
    semester: 1,
    semesterSequence: 1,
    credits: { CORE: 10, GED: 5, CAPSTONE: 0, TOTAL: 15 },
    courseCounts: { CORE: 4, GED: 2, CAPSTONE: 0, TOTAL: 6 },
    totalMarks: 600,
  },
  {
    academicYear: 1,
    semester: 2,
    semesterSequence: 2,
    credits: { CORE: 7, GED: 9, CAPSTONE: 0, TOTAL: 16 },
    courseCounts: { CORE: 3, GED: 3, CAPSTONE: 0, TOTAL: 6 },
    totalMarks: 600,
  },
  {
    academicYear: 2,
    semester: 1,
    semesterSequence: 3,
    credits: { CORE: 11, GED: 6, CAPSTONE: 0, TOTAL: 17 },
    courseCounts: { CORE: 5, GED: 2, CAPSTONE: 0, TOTAL: 7 },
    totalMarks: 700,
  },
  {
    academicYear: 2,
    semester: 2,
    semesterSequence: 4,
    credits: { CORE: 13, GED: 5, CAPSTONE: 0, TOTAL: 18 },
    courseCounts: { CORE: 6, GED: 2, CAPSTONE: 0, TOTAL: 8 },
    totalMarks: 800,
  },
  {
    academicYear: 3,
    semester: 1,
    semesterSequence: 5,
    credits: { CORE: 14, GED: 3, CAPSTONE: 0, TOTAL: 17 },
    courseCounts: { CORE: 6, GED: 1, CAPSTONE: 0, TOTAL: 7 },
    totalMarks: 700,
  },
  {
    academicYear: 3,
    semester: 2,
    semesterSequence: 6,
    credits: { CORE: 16, GED: 3, CAPSTONE: 0, TOTAL: 19 },
    courseCounts: { CORE: 7, GED: 1, CAPSTONE: 0, TOTAL: 8 },
    totalMarks: 800,
  },
  {
    academicYear: 4,
    semester: 1,
    semesterSequence: 7,
    credits: { CORE: 15, GED: 2, CAPSTONE: 2, TOTAL: 19 },
    courseCounts: { CORE: 6, GED: 1, CAPSTONE: 1, TOTAL: 8 },
    totalMarks: 800,
  },
  {
    academicYear: 4,
    semester: 2,
    semesterSequence: 8,
    credits: { CORE: 12, GED: 2, CAPSTONE: 5, TOTAL: 19 },
    courseCounts: { CORE: 5, GED: 1, CAPSTONE: 2, TOTAL: 8 },
    totalMarks: 800,
  },
] as const;

const templateExpectations = [
  {
    code: "LLB-STANDARD-100-V1",
    version: 1,
    name: "Standard Theoretical Course - 100 Marks",
    intendedInitialStatus: "DRAFT",
    totalMarks: 100,
    components: [
      {
        code: "FORMATIVE_ACTIVITIES",
        displayName: "Formative Activities",
        maximumMarks: 30,
        displayOrder: 1,
        required: true,
      },
      {
        code: "ATTENDANCE",
        displayName: "Attendance",
        maximumMarks: 5,
        displayOrder: 2,
        required: true,
      },
      {
        code: "COMPREHENSIVE_EXAMINATION",
        displayName: "Comprehensive Examination",
        maximumMarks: 5,
        displayOrder: 3,
        required: true,
      },
      {
        code: "SUMMATIVE_EXAMINATION",
        displayName: "Summative Examination",
        maximumMarks: 60,
        displayOrder: 4,
        required: true,
      },
    ],
  },
  {
    code: "LLB-CAPSTONE-DEFENCE-PRACTICAL-100-V1",
    version: 1,
    name: "Capstone Defence and Practical - 100 Marks",
    intendedInitialStatus: "DRAFT",
    totalMarks: 100,
    components: [
      {
        code: "DEFENCE",
        displayName: "Defence",
        maximumMarks: 40,
        displayOrder: 1,
        required: true,
      },
      {
        code: "PRACTICAL",
        displayName: "Practical",
        maximumMarks: 60,
        displayOrder: 2,
        required: true,
      },
    ],
  },
  {
    code: "LLB-CAPSTONE-DEFENCE-DISSERTATION-100-V1",
    version: 1,
    name: "Capstone Defence and Dissertation - 100 Marks",
    intendedInitialStatus: "DRAFT",
    totalMarks: 100,
    components: [
      {
        code: "DEFENCE",
        displayName: "Defence",
        maximumMarks: 40,
        displayOrder: 1,
        required: true,
      },
      {
        code: "DISSERTATION",
        displayName: "Dissertation",
        maximumMarks: 60,
        displayOrder: 2,
        required: true,
      },
    ],
  },
] as const;

const capstoneExpectations = {
  "0421-4108": {
    title:
      "Clinical Legal Education (Criminal Trial and Report on Court Visit) (Capstone)",
    credits: 2,
    academicYear: 4,
    semester: 1,
    semesterSequence: 7,
    displayOrder: 8,
    template: "LLB-CAPSTONE-DEFENCE-PRACTICAL-100-V1",
  },
  "0421-4207": {
    title: "Research Paper (Capstone)",
    credits: 3,
    academicYear: 4,
    semester: 2,
    semesterSequence: 8,
    displayOrder: 7,
    template: "LLB-CAPSTONE-DEFENCE-DISSERTATION-100-V1",
  },
  "0421-4208": {
    title:
      "Clinical Legal Education (Civil Trial and Report on Court Visit) (Capstone)",
    credits: 2,
    academicYear: 4,
    semester: 2,
    semesterSequence: 8,
    displayOrder: 8,
    template: "LLB-CAPSTONE-DEFENCE-PRACTICAL-100-V1",
  },
} as const;

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

test("authoritative source metadata and committed file hashes are independently pinned", () => {
  assert.equal(definition.sources.length, 2, "source entry count");
  assert.deepEqual(definition.sources, sourceExpectations, "source metadata");
  assert.equal(
    new Set(definition.sources.map((source) => source.kind)).size,
    2,
    "unique source kinds",
  );
  assert.equal(
    new Set(definition.sources.map((source) => source.path)).size,
    2,
    "unique source paths",
  );
  for (const expected of sourceExpectations) {
    assert.ok(
      existsSync(expected.path),
      `missing academic source: ${expected.path}`,
    );
    const actualHash = createHash("sha256")
      .update(readFileSync(expected.path))
      .digest("hex");
    assert.equal(
      actualHash,
      expected.sha256,
      `source hash mismatch: ${expected.path}`,
    );
  }
});

test("curriculum metadata pins the approved draft programme shape", () => {
  assert.equal(definition.metadata.intendedInitialStatus, "DRAFT");
  assert.equal(definition.metadata.departmentCode, "0421");
  assert.equal(definition.metadata.academicProgramCode, "LLB");
  assert.equal(definition.metadata.applicableSession, "2025-2026");
  assert.equal(definition.metadata.durationYears, 4);
  assert.equal(definition.metadata.totalSemesters, 8);
  assert.equal(definition.metadata.creditsOffered, 140);
  assert.equal(definition.metadata.minimumGraduatingCredits, 134);
  assert.equal(definition.metadata.totalCourses, 58);
  assert.equal(definition.metadata.totalMarks, 5_800);
  assert.equal(definition.metadata.teachingWeeksPerSemester, 14);
  assert.equal(definition.metadata.notionalHoursPerCredit, 40);
});

test("category metadata and derived totals match independent expectations", () => {
  assert.equal(
    definition.metadata.categoryAggregates.length,
    3,
    "category aggregate count",
  );
  const metadataCategories = new Set<string>();
  for (const aggregate of definition.metadata.categoryAggregates) {
    assert.ok(
      LLB_COURSE_CATEGORIES.includes(aggregate.category),
      `unknown metadata category: ${aggregate.category}`,
    );
    assert.ok(
      !metadataCategories.has(aggregate.category),
      `duplicate metadata category: ${aggregate.category}`,
    );
    metadataCategories.add(aggregate.category);
    assert.deepEqual(
      { courseCount: aggregate.courseCount, credits: aggregate.credits },
      categoryExpectations[aggregate.category],
      `${aggregate.category} metadata aggregate`,
    );
  }
  assert.deepEqual(
    [...metadataCategories].sort(),
    [...LLB_COURSE_CATEGORIES].sort(),
  );
  for (const category of LLB_COURSE_CATEGORIES) {
    const courses = definition.courses.filter(
      (course) => course.category === category,
    );
    assert.equal(
      courses.length,
      categoryExpectations[category].courseCount,
      `${category} derived course count`,
    );
    assert.equal(
      sum(courses.map((course) => course.credits)),
      categoryExpectations[category].credits,
      `${category} derived credits`,
    );
  }
});

test("all eight metadata and derived semester rows match independent expectations", () => {
  assert.equal(
    definition.expectedSemesterAggregates.length,
    8,
    "semester aggregate count",
  );
  assert.deepEqual(
    definition.expectedSemesterAggregates,
    semesterExpectations,
    "semester metadata rows",
  );
  const keys = new Set<string>();
  const sequences = new Set<number>();
  for (const expected of semesterExpectations) {
    const key = `${expected.academicYear}:${expected.semester}`;
    assert.ok(!keys.has(key), `duplicate expected semester key: ${key}`);
    keys.add(key);
    assert.ok(
      !sequences.has(expected.semesterSequence),
      `duplicate semester sequence: ${expected.semesterSequence}`,
    );
    sequences.add(expected.semesterSequence);
    const courses = definition.courses.filter(
      (course) =>
        course.academicYear === expected.academicYear &&
        course.semester === expected.semester,
    );
    assert.equal(
      courses.length,
      expected.courseCounts.TOTAL,
      `${key} derived course count`,
    );
    assert.equal(
      sum(courses.map((course) => course.credits)),
      expected.credits.TOTAL,
      `${key} derived credits`,
    );
    assert.equal(
      sum(courses.map((course) => course.totalMarks)),
      expected.totalMarks,
      `${key} derived marks`,
    );
    assert.ok(
      courses.every(
        (course) => course.semesterSequence === expected.semesterSequence,
      ),
      `${key} semester sequence mismatch`,
    );
    for (const category of LLB_COURSE_CATEGORIES) {
      const categoryCourses = courses.filter(
        (course) => course.category === category,
      );
      assert.equal(
        categoryCourses.length,
        expected.courseCounts[category],
        `${key} ${category} course count`,
      );
      assert.equal(
        sum(categoryCourses.map((course) => course.credits)),
        expected.credits[category],
        `${key} ${category} credits`,
      );
    }
  }
  assert.deepEqual(
    [...sequences].sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("assessment templates match the exact independently pinned distributions", () => {
  assert.equal(
    definition.assessmentTemplates.length,
    3,
    "assessment template count",
  );
  assert.deepEqual(
    definition.assessmentTemplates,
    templateExpectations,
    "exact assessment templates",
  );
  const templateCodes = new Set<string>();
  for (const template of definition.assessmentTemplates) {
    assert.ok(
      !templateCodes.has(template.code),
      `duplicate template code: ${template.code}`,
    );
    templateCodes.add(template.code);
    assert.equal(template.version, 1, `${template.code} version`);
    assert.equal(
      template.intendedInitialStatus,
      "DRAFT",
      `${template.code} status`,
    );
    assert.equal(template.totalMarks, 100, `${template.code} total marks`);
    const componentCodes = new Set<string>();
    const componentOrders = new Set<number>();
    for (const component of template.components) {
      assert.equal(
        component.required,
        true,
        `${template.code}/${component.code} required`,
      );
      assert.ok(
        !componentCodes.has(component.code),
        `duplicate component code: ${template.code}/${component.code}`,
      );
      componentCodes.add(component.code);
      assert.ok(
        !componentOrders.has(component.displayOrder),
        `duplicate component order: ${template.code}/${component.displayOrder}`,
      );
      componentOrders.add(component.displayOrder);
    }
    assert.deepEqual(
      [...componentOrders].sort((left, right) => left - right),
      Array.from(
        { length: template.components.length },
        (_, index) => index + 1,
      ),
      `${template.code} contiguous component order`,
    );
    assert.equal(
      sum(template.components.map((component) => component.maximumMarks)),
      100,
      `${template.code} component marks`,
    );
  }
});

test("the ordered 58-course authoritative snapshot has the reviewed fingerprint", () => {
  const tuples = definition.courses.map((course) => [
    course.courseCode,
    course.titleSnapshot,
    course.credits,
    course.totalMarks,
    course.category,
    course.academicYear,
    course.semester,
    course.semesterSequence,
    course.displayOrder,
    course.assessmentTemplateCode,
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(tuples))
    .digest("hex");
  // Pins the reviewed, ordered 58-course authoritative academic snapshot.
  assert.equal(
    fingerprint,
    "b25fb4585a364c35d9ace53ae20e9c8677fa6c4759fbed6d02bc9f4983598b33",
  );
});

test("course identity, content, placement, and ordering invariants hold", () => {
  assert.equal(definition.courses.length, 58, "canonical course count");
  assert.equal(
    sum(definition.courses.map((course) => course.credits)),
    140,
    "canonical credits",
  );
  assert.equal(
    sum(definition.courses.map((course) => course.totalMarks)),
    5_800,
    "canonical marks",
  );
  const codes = new Set<string>();
  const semesterGroups = new Map<string, number[]>();
  for (const course of definition.courses) {
    assert.ok(
      !codes.has(course.courseCode),
      `duplicate course code: ${course.courseCode}`,
    );
    codes.add(course.courseCode);
    assert.ok(
      course.titleSnapshot.trim().length > 0,
      `empty title: ${course.courseCode}`,
    );
    assert.ok(
      course.sourceReference.trim().length > 0,
      `empty source reference: ${course.courseCode}`,
    );
    assert.ok(
      Number.isInteger(course.credits) && course.credits > 0,
      `invalid credits: ${course.courseCode}`,
    );
    assert.equal(
      course.totalMarks,
      100,
      `invalid total marks: ${course.courseCode}`,
    );
    assert.ok(
      LLB_COURSE_CATEGORIES.includes(course.category),
      `invalid category: ${course.courseCode}`,
    );
    assert.ok(
      [1, 2, 3, 4].includes(course.academicYear),
      `invalid academic year: ${course.courseCode}`,
    );
    assert.ok(
      [1, 2].includes(course.semester),
      `invalid semester: ${course.courseCode}`,
    );
    assert.equal(
      course.semesterSequence,
      (course.academicYear - 1) * 2 + course.semester,
      `semester sequence mismatch: ${course.courseCode}`,
    );
    const key = `${course.academicYear}:${course.semester}`;
    semesterGroups.set(key, [
      ...(semesterGroups.get(key) ?? []),
      course.displayOrder,
    ]);
  }
  assert.equal(semesterGroups.size, 8, "semester group count");
  for (const [key, orders] of semesterGroups) {
    assert.equal(
      new Set(orders).size,
      orders.length,
      `duplicate display order in ${key}`,
    );
    assert.deepEqual(
      [...orders].sort((left, right) => left - right),
      Array.from({ length: orders.length }, (_, index) => index + 1),
      `non-contiguous display order in ${key}`,
    );
  }
  for (const forbidden of ["0421-4209", "LAW-101", "LAW-999"]) {
    assert.ok(
      !codes.has(forbidden),
      `forbidden canonical course code: ${forbidden}`,
    );
  }
});

test("template references and the ordinary/Capstone split are exact", () => {
  const templateCodes = new Set<string>(
    definition.assessmentTemplates.map((template) => template.code),
  );
  const approvedCapstones = new Set<string>(Object.keys(capstoneExpectations));
  for (const course of definition.courses) {
    assert.ok(
      templateCodes.has(course.assessmentTemplateCode),
      `unknown template: ${course.courseCode}`,
    );
    if (approvedCapstones.has(course.courseCode)) {
      assert.equal(
        course.category,
        "CAPSTONE",
        `${course.courseCode} category`,
      );
      assert.notEqual(
        course.assessmentTemplateCode,
        "LLB-STANDARD-100-V1",
        `${course.courseCode} standard template`,
      );
    } else {
      assert.notEqual(
        course.category,
        "CAPSTONE",
        `unapproved Capstone: ${course.courseCode}`,
      );
      assert.equal(
        course.assessmentTemplateCode,
        "LLB-STANDARD-100-V1",
        `ordinary template: ${course.courseCode}`,
      );
    }
  }
  for (const [code, expected] of Object.entries(capstoneExpectations)) {
    const course = definition.courses.find(
      (candidate) => candidate.courseCode === code,
    );
    assert.ok(course, `missing approved Capstone: ${code}`);
    assert.deepEqual(
      {
        title: course.titleSnapshot,
        credits: course.credits,
        academicYear: course.academicYear,
        semester: course.semester,
        semesterSequence: course.semesterSequence,
        displayOrder: course.displayOrder,
        template: course.assessmentTemplateCode,
      },
      expected,
      `${code} exact Capstone record`,
    );
  }
});

test("the reusable definition contains no live database identifier dependency", () => {
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert.ok(
          !/(^id$|Id$)/.test(key),
          `database identifier field found: ${path}.${key}`,
        );
        visit(child, `${path}.${key}`);
      }
    }
  };
  visit(definition, "definition");
});
