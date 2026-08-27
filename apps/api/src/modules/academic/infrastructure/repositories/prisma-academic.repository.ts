import { Injectable } from "@nestjs/common";
import {
  AcademicProgramStatus,
  AcademicVersionStatus,
  BatchCoordinatorAssignmentStatus,
  CourseOfferingStatus,
  CourseOutlineStatus,
  CourseStatus,
  DepartmentStatus,
  EnrollmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

import type {
  AcademicRepositoryPort,
  AcademicSessionListFilters,
  AcademicTermListFilters,
  AcademicYearListFilters,
  ActivateCourseOutlineVersionInput,
  ApproveCourseOutlineVersionInput,
  BindCourseOfferingCurriculumInput,
  BindCourseOfferingSyllabusInput,
  BindCourseOfferingStudentBatchInput,
  CourseListFilters,
  CourseOfferingLearningOutcomesView,
  CourseOfferingListFilters,
  CreateAcademicSessionWriteInput,
  CreateAcademicTermInput,
  CreateAcademicYearInput,
  CreateCourseInput,
  CreateCourseOfferingInput,
  CreateCourseOutlineVersionInput,
  CreateEnrollmentInput,
  CreateProgramInput,
  CreateStudentBatchWriteInput,
  CreateStudentCurriculumAssignmentInput,
  CreateSyllabusVersionInput,
  CreateTeacherAssignmentInput,
  EnrollmentListFilters,
  ProgramListFilters,
  ReturnCourseOutlineForCorrectionInput,
  StudentBatchListFilters,
  StudentBatchView,
  StudentCourseOfferingListFilters,
  StartCourseOutlineCoordinatorReviewInput,
  SubmitCourseOutlineVersionInput,
  SyllabusVersionListFilters,
  TeacherAssignmentListFilters,
  TransitionCurriculumVersionInput,
  TransitionSyllabusVersionInput,
  UpdateAcademicSessionWriteInput,
  UpdateAcademicTermInput,
  UpdateAcademicYearInput,
  UpdateCourseInput,
  UpdateCourseOfferingInput,
  UpdateCourseOutlineVersionInput,
  UpdateEnrollmentInput,
  UpdateProgramInput,
  UpdateStudentBatchWriteInput,
} from "../../application/ports/academic.repository.port";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import {
  COURSE_OUTLINE_DRAFT_FIELD_NAMES,
  selectCourseOutlineDraftFields,
} from "../../domain/course-outline-draft-fields";

class CourseOutlineActivationBindingConflictError extends Error {}

const courseOfferingInclude = {
  course: true,
  academicTerm: true,
  studentBatch: {
    select: {
      id: true,
      departmentId: true,
      academicProgramId: true,
      academicSessionId: true,
      code: true,
      name: true,
      archivedAt: true,
      academicProgram: {
        select: { id: true, departmentId: true },
      },
      academicSession: {
        select: { id: true, departmentId: true },
      },
    },
  },
  curriculumCourse: {
    select: {
      id: true,
      categoryCode: true,
      academicYearNumber: true,
      semesterNumber: true,
      displayOrder: true,
      courseCodeSnapshot: true,
      courseTitleSnapshot: true,
      creditHoursSnapshot: true,
      totalMarksSnapshot: true,
      isRequired: true,
      departmentId: true,
      courseId: true,
      curriculumVersionId: true,
      assessmentTemplateId: true,
      course: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
        },
      },
      curriculumVersion: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          name: true,
          status: true,
          effectiveAcademicSessionCode: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
      assessmentTemplate: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          versionNumber: true,
          name: true,
          status: true,
          totalMarks: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseOfferingInclude;

const BINDABLE_ACADEMIC_VERSION_STATUSES: readonly AcademicVersionStatus[] = [
  AcademicVersionStatus.DRAFT,
  AcademicVersionStatus.APPROVED,
  AcademicVersionStatus.ACTIVE,
];

const READABLE_LEARNING_OUTCOME_CURRICULUM_STATUSES: readonly AcademicVersionStatus[] =
  [
    AcademicVersionStatus.APPROVED,
    AcademicVersionStatus.ACTIVE,
    AcademicVersionStatus.RETIRED,
    AcademicVersionStatus.ARCHIVED,
  ];

const ASSIGNABLE_STUDENT_CURRICULUM_STATUSES: readonly AcademicVersionStatus[] =
  [AcademicVersionStatus.APPROVED, AcademicVersionStatus.ACTIVE];

const BINDABLE_SYLLABUS_VERSION_STATUSES: readonly AcademicVersionStatus[] = [
  AcademicVersionStatus.APPROVED,
  AcademicVersionStatus.ACTIVE,
];

const EDITABLE_COURSE_OUTLINE_STATUSES: readonly CourseOutlineStatus[] = [
  CourseOutlineStatus.DRAFT,
  CourseOutlineStatus.RETURNED_FOR_CORRECTION,
];

const OPEN_COURSE_OUTLINE_STATUSES: readonly CourseOutlineStatus[] = [
  CourseOutlineStatus.DRAFT,
  CourseOutlineStatus.SUBMITTED_BY_TEACHER,
  CourseOutlineStatus.COORDINATOR_REVIEW,
  CourseOutlineStatus.RETURNED_FOR_CORRECTION,
];

const courseOutlineVersionSelect = {
  id: true,
  departmentId: true,
  courseOfferingId: true,
  curriculumCourseId: true,
  syllabusVersionId: true,
  versionNumber: true,
  status: true,
  courseSummary: true,
  deliveryPlan: true,
  teachingStrategies: true,
  assessmentStrategy: true,
  evaluationPolicy: true,
  makeUpProcedure: true,
  submittedAt: true,
  approvedAt: true,
  activatedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseOutlineVersionSelect;

const courseOutlineOfferingSelect = {
  id: true,
  departmentId: true,
  courseId: true,
  curriculumCourseId: true,
  syllabusVersionId: true,
  curriculumCourse: {
    select: {
      id: true,
      departmentId: true,
      courseId: true,
    },
  },
  syllabusVersion: {
    select: {
      id: true,
      departmentId: true,
      curriculumCourseId: true,
    },
  },
} satisfies Prisma.CourseOfferingSelect;

const CURRICULUM_VERSION_TRANSITIONS = {
  APPROVE: {
    expectedStatus: AcademicVersionStatus.DRAFT,
    targetStatus: AcademicVersionStatus.APPROVED,
    auditAction: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_APPROVED,
  },
  ACTIVATE: {
    expectedStatus: AcademicVersionStatus.APPROVED,
    targetStatus: AcademicVersionStatus.ACTIVE,
    auditAction: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_ACTIVATED,
  },
  RETIRE: {
    expectedStatus: AcademicVersionStatus.ACTIVE,
    targetStatus: AcademicVersionStatus.RETIRED,
    auditAction: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_RETIRED,
  },
  ARCHIVE: {
    expectedStatus: AcademicVersionStatus.RETIRED,
    targetStatus: AcademicVersionStatus.ARCHIVED,
    auditAction: ACADEMIC_AUDIT_EVENTS.CURRICULUM_VERSION_ARCHIVED,
  },
} as const;

const SYLLABUS_VERSION_TRANSITIONS = {
  APPROVE: {
    expectedStatus: AcademicVersionStatus.DRAFT,
    targetStatus: AcademicVersionStatus.APPROVED,
    auditAction: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_APPROVED,
  },
  ACTIVATE: {
    expectedStatus: AcademicVersionStatus.APPROVED,
    targetStatus: AcademicVersionStatus.ACTIVE,
    auditAction: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_ACTIVATED,
  },
  RETIRE: {
    expectedStatus: AcademicVersionStatus.ACTIVE,
    targetStatus: AcademicVersionStatus.RETIRED,
    auditAction: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_RETIRED,
  },
  ARCHIVE: {
    expectedStatus: AcademicVersionStatus.RETIRED,
    targetStatus: AcademicVersionStatus.ARCHIVED,
    auditAction: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_ARCHIVED,
  },
} as const;

const curriculumVersionLifecycleSelect = {
  id: true,
  departmentId: true,
  academicProgramId: true,
  code: true,
  name: true,
  status: true,
  effectiveAcademicSessionCode: true,
  approvedAt: true,
  archivedAt: true,
  updatedAt: true,
  academicProgram: {
    select: { id: true, departmentId: true },
  },
} satisfies Prisma.CurriculumVersionSelect;

type CurriculumVersionLifecycleRecord =
  Prisma.CurriculumVersionGetPayload<{
    select: typeof curriculumVersionLifecycleSelect;
  }>;

class InvalidCurriculumVersionLifecycleStateError extends Error {}

function isCurriculumVersionLifecycleStateConsistent(
  version: Pick<
    CurriculumVersionLifecycleRecord,
    "status" | "approvedAt" | "archivedAt"
  >,
) {
  switch (version.status) {
    case AcademicVersionStatus.DRAFT:
      return version.approvedAt === null && version.archivedAt === null;
    case AcademicVersionStatus.APPROVED:
    case AcademicVersionStatus.ACTIVE:
    case AcademicVersionStatus.RETIRED:
      return version.approvedAt !== null && version.archivedAt === null;
    case AcademicVersionStatus.ARCHIVED:
      return version.approvedAt !== null && version.archivedAt !== null;
    default:
      return false;
  }
}

function sanitizeCurriculumVersionLifecycleRead(
  version: CurriculumVersionLifecycleRecord,
  departmentId: string,
) {
  if (
    version.departmentId !== departmentId ||
    version.academicProgram.id !== version.academicProgramId ||
    version.academicProgram.departmentId !== departmentId
  ) {
    return null;
  }

  return {
    id: version.id,
    departmentId: version.departmentId,
    academicProgramId: version.academicProgramId,
    code: version.code,
    name: version.name,
    status: version.status,
    effectiveAcademicSessionCode: version.effectiveAcademicSessionCode,
    approvedAt: version.approvedAt,
    archivedAt: version.archivedAt,
    updatedAt: version.updatedAt,
  };
}

const studentCurriculumAssignmentSelect = {
  id: true,
  departmentId: true,
  studentUserId: true,
  academicProgramId: true,
  curriculumVersionId: true,
  assignedByUserId: true,
  assignedAt: true,
  createdAt: true,
  studentUser: {
    select: { id: true, departmentId: true },
  },
  assignedByUser: {
    select: { id: true, departmentId: true },
  },
  academicProgram: {
    select: { id: true, departmentId: true, code: true, name: true },
  },
  curriculumVersion: {
    select: {
      id: true,
      departmentId: true,
      academicProgramId: true,
      code: true,
      name: true,
      status: true,
      effectiveAcademicSessionCode: true,
    },
  },
} satisfies Prisma.StudentCurriculumAssignmentSelect;

type StudentCurriculumAssignmentRecord =
  Prisma.StudentCurriculumAssignmentGetPayload<{
    select: typeof studentCurriculumAssignmentSelect;
  }>;

function sanitizeStudentCurriculumAssignment(
  assignment: StudentCurriculumAssignmentRecord,
  departmentId: string,
) {
  if (
    assignment.departmentId !== departmentId ||
    assignment.studentUser.id !== assignment.studentUserId ||
    assignment.studentUser.departmentId !== departmentId ||
    assignment.assignedByUser.id !== assignment.assignedByUserId ||
    assignment.assignedByUser.departmentId !== departmentId ||
    assignment.academicProgram.id !== assignment.academicProgramId ||
    assignment.academicProgram.departmentId !== departmentId ||
    assignment.curriculumVersion.id !== assignment.curriculumVersionId ||
    assignment.curriculumVersion.departmentId !== departmentId ||
    assignment.curriculumVersion.academicProgramId !==
      assignment.academicProgramId
  ) {
    return null;
  }

  return {
    id: assignment.id,
    studentUserId: assignment.studentUserId,
    academicProgram: {
      id: assignment.academicProgram.id,
      code: assignment.academicProgram.code,
      name: assignment.academicProgram.name,
    },
    curriculumVersion: {
      id: assignment.curriculumVersion.id,
      code: assignment.curriculumVersion.code,
      name: assignment.curriculumVersion.name,
      status: assignment.curriculumVersion.status,
      effectiveAcademicSessionCode:
        assignment.curriculumVersion.effectiveAcademicSessionCode,
    },
    assignedByUserId: assignment.assignedByUserId,
    assignedAt: assignment.assignedAt,
    createdAt: assignment.createdAt,
  };
}

function isStudentCurriculumAssignmentUniqueConflict(error: unknown) {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  const mappedColumns = [
    "department_id",
    "student_user_id",
    "academic_program_id",
  ];
  const prismaFields = ["departmentId", "studentUserId", "academicProgramId"];

  if (typeof target === "string") {
    return target === "student_curriculum_assignment_dept_student_program_uq";
  }

  if (!Array.isArray(target) || target.length !== 3) {
    return false;
  }

  return (
    mappedColumns.every((column) => target.includes(column)) ||
    prismaFields.every((field) => target.includes(field))
  );
}

function isCourseOfferingBoundIdentityConflict(error: unknown) {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === "string") {
    return target === "course_offering_bound_curriculum_identity_uq";
  }

  if (!Array.isArray(target) || target.length !== 4) {
    return false;
  }

  const mappedColumns = [
    "department_id",
    "academic_term_id",
    "curriculum_course_id",
    "section_code",
  ];
  const prismaFields = [
    "departmentId",
    "academicTermId",
    "curriculumCourseId",
    "sectionCode",
  ];

  return (
    mappedColumns.every((column) => target.includes(column)) ||
    prismaFields.every((field) => target.includes(field))
  );
}

function isCourseOfferingBoundBatchedIdentityConflict(error: unknown) {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === "string") {
    return target === "course_offering_bound_batched_curriculum_identity_uq";
  }

  if (!Array.isArray(target) || target.length !== 5) {
    return false;
  }

  const mappedColumns = [
    "department_id",
    "academic_term_id",
    "student_batch_id",
    "curriculum_course_id",
    "section_code",
  ];
  const prismaFields = [
    "departmentId",
    "academicTermId",
    "studentBatchId",
    "curriculumCourseId",
    "sectionCode",
  ];

  return (
    mappedColumns.every((column) => target.includes(column)) ||
    prismaFields.every((field) => target.includes(field))
  );
}

interface CourseOfferingReadRecord {
  id: string;
  departmentId: string;
  courseId: string;
  studentBatchId?: string | null;
  course: {
    id: string;
    departmentId: string;
    academicProgramId: string | null;
  };
  curriculumCourse: null | {
    id: string;
    departmentId: string;
    courseId: string;
    curriculumVersionId: string;
    assessmentTemplateId: string;
    categoryCode: string;
    academicYearNumber: number;
    semesterNumber: number;
    displayOrder: number;
    courseCodeSnapshot: string;
    courseTitleSnapshot: string;
    creditHoursSnapshot: Prisma.Decimal;
    totalMarksSnapshot: Prisma.Decimal;
    isRequired: boolean;
    course: {
      id: string;
      departmentId: string;
      academicProgramId: string | null;
    };
    curriculumVersion: {
      id: string;
      departmentId: string;
      academicProgramId: string;
      code: string;
      name: string;
      status: AcademicVersionStatus;
      effectiveAcademicSessionCode: string;
      academicProgram: { id: string; departmentId: string };
    };
    assessmentTemplate: {
      id: string;
      departmentId: string;
      academicProgramId: string | null;
      code: string;
      versionNumber: number;
      name: string;
      status: AcademicVersionStatus;
      totalMarks: Prisma.Decimal;
      academicProgram: { id: string; departmentId: string } | null;
    };
  };
  studentBatch?: null | {
    id: string;
    departmentId: string;
    academicProgramId: string;
    academicSessionId: string;
    code: string;
    name: string;
    archivedAt: Date | null;
    academicProgram: { id: string; departmentId: string };
    academicSession: { id: string; departmentId: string };
  };
  [key: string]: unknown;
}

function sanitizeCourseOfferingRead(
  value: unknown,
  departmentId: string,
): unknown | null {
  const offering = value as CourseOfferingReadRecord;

  if (
    offering.departmentId !== departmentId ||
    offering.course?.id !== offering.courseId ||
    offering.course.departmentId !== departmentId
  ) {
    return null;
  }

  const curriculumCourse = offering.curriculumCourse;
  const studentBatchId = offering.studentBatchId ?? null;
  const studentBatch = offering.studentBatch ?? null;

  if (
    (studentBatchId === null && studentBatch !== null) ||
    (studentBatchId !== null &&
      (!studentBatch ||
        studentBatch.id !== studentBatchId ||
        studentBatch.departmentId !== departmentId ||
        studentBatch.academicProgram.id !== studentBatch.academicProgramId ||
        studentBatch.academicProgram.departmentId !== departmentId ||
        studentBatch.academicSession.id !== studentBatch.academicSessionId ||
        studentBatch.academicSession.departmentId !== departmentId))
  ) {
    return null;
  }

  if (!curriculumCourse) {
    return studentBatchId === null ? offering : null;
  }

  const version = curriculumCourse.curriculumVersion;
  const template = curriculumCourse.assessmentTemplate;
  const academicProgramId = offering.course.academicProgramId;
  const templateProgramIsValid = template.academicProgramId
    ? template.academicProgramId === academicProgramId &&
      template.academicProgram?.id === template.academicProgramId &&
      template.academicProgram.departmentId === departmentId
    : template.academicProgram === null;

  if (
    !academicProgramId ||
    curriculumCourse.departmentId !== departmentId ||
    curriculumCourse.courseId !== offering.courseId ||
    curriculumCourse.course.id !== curriculumCourse.courseId ||
    curriculumCourse.course.departmentId !== departmentId ||
    curriculumCourse.course.academicProgramId !== academicProgramId ||
    version.id !== curriculumCourse.curriculumVersionId ||
    version.departmentId !== departmentId ||
    version.academicProgramId !== academicProgramId ||
    version.academicProgram.id !== version.academicProgramId ||
    version.academicProgram.departmentId !== departmentId ||
    template.id !== curriculumCourse.assessmentTemplateId ||
    template.departmentId !== departmentId ||
    !templateProgramIsValid
  ) {
    return null;
  }

  if (studentBatch && studentBatch.academicProgramId !== academicProgramId) {
    return null;
  }

  return {
    ...offering,
    ...("studentBatch" in offering || "studentBatchId" in offering
      ? {
          studentBatch: studentBatch
            ? {
                id: studentBatch.id,
                academicProgramId: studentBatch.academicProgramId,
                academicSessionId: studentBatch.academicSessionId,
                code: studentBatch.code,
                name: studentBatch.name,
                archivedAt: studentBatch.archivedAt,
              }
            : null,
        }
      : {}),
    curriculumCourse: {
      id: curriculumCourse.id,
      categoryCode: curriculumCourse.categoryCode,
      academicYearNumber: curriculumCourse.academicYearNumber,
      semesterNumber: curriculumCourse.semesterNumber,
      displayOrder: curriculumCourse.displayOrder,
      courseCodeSnapshot: curriculumCourse.courseCodeSnapshot,
      courseTitleSnapshot: curriculumCourse.courseTitleSnapshot,
      creditHoursSnapshot: curriculumCourse.creditHoursSnapshot,
      totalMarksSnapshot: curriculumCourse.totalMarksSnapshot,
      isRequired: curriculumCourse.isRequired,
      curriculumVersion: {
        id: version.id,
        code: version.code,
        name: version.name,
        status: version.status,
        effectiveAcademicSessionCode: version.effectiveAcademicSessionCode,
      },
      assessmentTemplate: {
        id: template.id,
        code: template.code,
        versionNumber: template.versionNumber,
        name: template.name,
        status: template.status,
        totalMarks: template.totalMarks,
      },
    },
  };
}

const courseOfferingLearningOutcomesSelect = {
  id: true,
  departmentId: true,
  courseId: true,
  curriculumCourseId: true,
  course: {
    select: {
      id: true,
      departmentId: true,
      academicProgramId: true,
    },
  },
  curriculumCourse: {
    select: {
      id: true,
      departmentId: true,
      curriculumVersionId: true,
      courseId: true,
      courseCodeSnapshot: true,
      courseTitleSnapshot: true,
      course: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
        },
      },
      curriculumVersion: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          name: true,
          status: true,
          effectiveAcademicSessionCode: true,
          approvedAt: true,
          archivedAt: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
      learningOutcomes: {
        select: {
          id: true,
          departmentId: true,
          curriculumVersionId: true,
          curriculumCourseId: true,
          code: true,
          statement: true,
          displayOrder: true,
          ploMappings: {
            select: {
              departmentId: true,
              curriculumVersionId: true,
              courseLearningOutcomeId: true,
              programLearningOutcomeId: true,
              programLearningOutcome: {
                select: {
                  id: true,
                  departmentId: true,
                  curriculumVersionId: true,
                  code: true,
                  statement: true,
                  displayOrder: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseOfferingSelect;

type CourseOfferingLearningOutcomesRecord = Prisma.CourseOfferingGetPayload<{
  select: typeof courseOfferingLearningOutcomesSelect;
}>;

function byDisplayOrderCodeAndId(
  left: { displayOrder: number; code: string; id: string },
  right: { displayOrder: number; code: string; id: string },
) {
  return (
    left.displayOrder - right.displayOrder ||
    left.code.localeCompare(right.code) ||
    left.id.localeCompare(right.id)
  );
}

function sanitizeCourseOfferingLearningOutcomes(
  offering: CourseOfferingLearningOutcomesRecord,
  departmentId: string,
): CourseOfferingLearningOutcomesView | null {
  const curriculumCourse = offering.curriculumCourse;
  const offeringCourse = offering.course;

  if (
    offering.departmentId !== departmentId ||
    offeringCourse.id !== offering.courseId ||
    offeringCourse.departmentId !== departmentId ||
    !offeringCourse.academicProgramId ||
    !offering.curriculumCourseId ||
    !curriculumCourse ||
    curriculumCourse.id !== offering.curriculumCourseId ||
    curriculumCourse.departmentId !== departmentId ||
    curriculumCourse.courseId !== offering.courseId ||
    curriculumCourse.course.id !== curriculumCourse.courseId ||
    curriculumCourse.course.departmentId !== departmentId ||
    curriculumCourse.course.academicProgramId !==
      offeringCourse.academicProgramId
  ) {
    return null;
  }

  const curriculumVersion = curriculumCourse.curriculumVersion;
  if (
    curriculumVersion.id !== curriculumCourse.curriculumVersionId ||
    curriculumVersion.departmentId !== departmentId ||
    curriculumVersion.academicProgramId !== offeringCourse.academicProgramId ||
    curriculumVersion.academicProgram.id !==
      curriculumVersion.academicProgramId ||
    curriculumVersion.academicProgram.departmentId !== departmentId ||
    !READABLE_LEARNING_OUTCOME_CURRICULUM_STATUSES.includes(
      curriculumVersion.status,
    ) ||
    !isCurriculumVersionLifecycleStateConsistent(curriculumVersion)
  ) {
    return null;
  }

  const courseLearningOutcomes = curriculumCourse.learningOutcomes.map(
    (courseLearningOutcome) => {
      if (
        courseLearningOutcome.departmentId !== departmentId ||
        courseLearningOutcome.curriculumVersionId !== curriculumVersion.id ||
        courseLearningOutcome.curriculumCourseId !== curriculumCourse.id
      ) {
        return null;
      }

      const mappedProgramLearningOutcomes =
        courseLearningOutcome.ploMappings.map((mapping) => {
          const programLearningOutcome = mapping.programLearningOutcome;

          if (
            mapping.departmentId !== departmentId ||
            mapping.curriculumVersionId !== curriculumVersion.id ||
            mapping.courseLearningOutcomeId !== courseLearningOutcome.id ||
            mapping.programLearningOutcomeId !== programLearningOutcome.id ||
            programLearningOutcome.departmentId !== departmentId ||
            programLearningOutcome.curriculumVersionId !== curriculumVersion.id
          ) {
            return null;
          }

          return {
            id: programLearningOutcome.id,
            code: programLearningOutcome.code,
            statement: programLearningOutcome.statement,
            displayOrder: programLearningOutcome.displayOrder,
          };
        });

      if (mappedProgramLearningOutcomes.some((outcome) => outcome === null)) {
        return null;
      }

      return {
        id: courseLearningOutcome.id,
        code: courseLearningOutcome.code,
        statement: courseLearningOutcome.statement,
        displayOrder: courseLearningOutcome.displayOrder,
        mappedProgramLearningOutcomes: mappedProgramLearningOutcomes
          .filter((outcome) => outcome !== null)
          .sort(byDisplayOrderCodeAndId),
      };
    },
  );

  if (courseLearningOutcomes.some((outcome) => outcome === null)) {
    return null;
  }

  return {
    courseOfferingId: offering.id,
    curriculumCourse: {
      id: curriculumCourse.id,
      courseCodeSnapshot: curriculumCourse.courseCodeSnapshot,
      courseTitleSnapshot: curriculumCourse.courseTitleSnapshot,
      curriculumVersion: {
        id: curriculumVersion.id,
        code: curriculumVersion.code,
        name: curriculumVersion.name,
        status: curriculumVersion.status,
        effectiveAcademicSessionCode:
          curriculumVersion.effectiveAcademicSessionCode,
      },
    },
    courseLearningOutcomes: courseLearningOutcomes
      .filter((outcome) => outcome !== null)
      .sort(byDisplayOrderCodeAndId),
  };
}

const syllabusVersionSelect = {
  id: true,
  departmentId: true,
  curriculumCourseId: true,
  code: true,
  versionNumber: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  approvedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  curriculumCourse: {
    select: {
      id: true,
      departmentId: true,
      curriculumVersionId: true,
      courseId: true,
      assessmentTemplateId: true,
      categoryCode: true,
      academicYearNumber: true,
      semesterNumber: true,
      courseCodeSnapshot: true,
      courseTitleSnapshot: true,
      creditHoursSnapshot: true,
      totalMarksSnapshot: true,
      course: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          title: true,
        },
      },
      curriculumVersion: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          name: true,
          status: true,
          effectiveAcademicSessionCode: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
      assessmentTemplate: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          code: true,
          versionNumber: true,
          name: true,
          status: true,
          totalMarks: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.SyllabusVersionSelect;

type SyllabusVersionRecord = Prisma.SyllabusVersionGetPayload<{
  select: typeof syllabusVersionSelect;
}>;

class InvalidSyllabusVersionLifecycleStateError extends Error {}

function isSyllabusVersionLifecycleStateConsistent(
  version: Pick<SyllabusVersionRecord, "status" | "approvedAt" | "archivedAt">,
) {
  switch (version.status) {
    case AcademicVersionStatus.DRAFT:
      return version.approvedAt === null && version.archivedAt === null;
    case AcademicVersionStatus.APPROVED:
    case AcademicVersionStatus.ACTIVE:
    case AcademicVersionStatus.RETIRED:
      return version.approvedAt !== null && version.archivedAt === null;
    case AcademicVersionStatus.ARCHIVED:
      return version.approvedAt !== null && version.archivedAt !== null;
    default:
      return false;
  }
}

type SyllabusCurriculumCourseRecord = SyllabusVersionRecord["curriculumCourse"];

function isSyllabusCurriculumCourseConsistent(
  curriculumCourse: SyllabusCurriculumCourseRecord,
  departmentId: string,
) {
  const course = curriculumCourse.course;
  const curriculumVersion = curriculumCourse.curriculumVersion;
  const assessmentTemplate = curriculumCourse.assessmentTemplate;
  const academicProgramId = course.academicProgramId;
  const templateProgramIsValid = assessmentTemplate.academicProgramId
    ? assessmentTemplate.academicProgramId === academicProgramId &&
      assessmentTemplate.academicProgram?.id ===
        assessmentTemplate.academicProgramId &&
      assessmentTemplate.academicProgram.departmentId === departmentId
    : assessmentTemplate.academicProgram === null;

  return Boolean(
    academicProgramId &&
    curriculumCourse.departmentId === departmentId &&
    course.id === curriculumCourse.courseId &&
    course.departmentId === departmentId &&
    curriculumVersion.id === curriculumCourse.curriculumVersionId &&
    curriculumVersion.departmentId === departmentId &&
    curriculumVersion.academicProgramId === academicProgramId &&
    curriculumVersion.academicProgram.id === academicProgramId &&
    curriculumVersion.academicProgram.departmentId === departmentId &&
    assessmentTemplate.id === curriculumCourse.assessmentTemplateId &&
    assessmentTemplate.departmentId === departmentId &&
    templateProgramIsValid,
  );
}

function sanitizeSyllabusVersion(
  syllabusVersion: SyllabusVersionRecord,
  departmentId: string,
) {
  const curriculumCourse = syllabusVersion.curriculumCourse;
  const course = curriculumCourse.course;
  const curriculumVersion = curriculumCourse.curriculumVersion;
  const assessmentTemplate = curriculumCourse.assessmentTemplate;

  if (
    syllabusVersion.departmentId !== departmentId ||
    curriculumCourse.id !== syllabusVersion.curriculumCourseId ||
    !isSyllabusCurriculumCourseConsistent(curriculumCourse, departmentId)
  ) {
    return null;
  }

  return {
    id: syllabusVersion.id,
    code: syllabusVersion.code,
    versionNumber: syllabusVersion.versionNumber,
    status: syllabusVersion.status,
    effectiveFrom: syllabusVersion.effectiveFrom,
    effectiveTo: syllabusVersion.effectiveTo,
    approvedAt: syllabusVersion.approvedAt,
    archivedAt: syllabusVersion.archivedAt,
    createdAt: syllabusVersion.createdAt,
    updatedAt: syllabusVersion.updatedAt,
    curriculumCourse: {
      id: curriculumCourse.id,
      categoryCode: curriculumCourse.categoryCode,
      academicYearNumber: curriculumCourse.academicYearNumber,
      semesterNumber: curriculumCourse.semesterNumber,
      courseCodeSnapshot: curriculumCourse.courseCodeSnapshot,
      courseTitleSnapshot: curriculumCourse.courseTitleSnapshot,
      creditHoursSnapshot: curriculumCourse.creditHoursSnapshot,
      totalMarksSnapshot: curriculumCourse.totalMarksSnapshot,
      course: {
        id: course.id,
        code: course.code,
        title: course.title,
      },
      curriculumVersion: {
        id: curriculumVersion.id,
        code: curriculumVersion.code,
        name: curriculumVersion.name,
        status: curriculumVersion.status,
        effectiveAcademicSessionCode:
          curriculumVersion.effectiveAcademicSessionCode,
      },
      assessmentTemplate: {
        id: assessmentTemplate.id,
        code: assessmentTemplate.code,
        versionNumber: assessmentTemplate.versionNumber,
        name: assessmentTemplate.name,
        status: assessmentTemplate.status,
        totalMarks: assessmentTemplate.totalMarks,
      },
    },
  };
}

const courseOfferingSyllabusBindingSelect = {
  id: true,
  departmentId: true,
  courseId: true,
  curriculumCourseId: true,
  syllabusVersionId: true,
  course: {
    select: {
      id: true,
      departmentId: true,
      academicProgramId: true,
    },
  },
  curriculumCourse: {
    select: syllabusVersionSelect.curriculumCourse.select,
  },
} satisfies Prisma.CourseOfferingSelect;

const courseOfferingStudentBatchBindingSelect = {
  id: true,
  departmentId: true,
  courseId: true,
  academicTermId: true,
  studentBatchId: true,
  curriculumCourseId: true,
  sectionCode: true,
  course: {
    select: {
      id: true,
      departmentId: true,
      academicProgramId: true,
      academicProgram: {
        select: { id: true, departmentId: true },
      },
    },
  },
  curriculumCourse: {
    select: {
      id: true,
      departmentId: true,
      courseId: true,
      curriculumVersionId: true,
      course: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
      curriculumVersion: {
        select: {
          id: true,
          departmentId: true,
          academicProgramId: true,
          academicProgram: {
            select: { id: true, departmentId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseOfferingSelect;

const studentBatchBindingSelect = {
  id: true,
  departmentId: true,
  academicProgramId: true,
  academicSessionId: true,
  archivedAt: true,
  academicProgram: {
    select: { id: true, departmentId: true },
  },
  academicSession: {
    select: { id: true, departmentId: true },
  },
} satisfies Prisma.StudentBatchSelect;

type CourseOfferingStudentBatchBindingRecord = Prisma.CourseOfferingGetPayload<{
  select: typeof courseOfferingStudentBatchBindingSelect;
}>;

type StudentBatchBindingRecord = Prisma.StudentBatchGetPayload<{
  select: typeof studentBatchBindingSelect;
}>;

function isCourseOfferingStudentBatchDependencyConsistent(
  offering: CourseOfferingStudentBatchBindingRecord,
  departmentId: string,
) {
  const course = offering.course;
  const curriculumCourse = offering.curriculumCourse;
  const curriculumVersion = curriculumCourse?.curriculumVersion;

  return Boolean(
    offering.departmentId === departmentId &&
    course.id === offering.courseId &&
    course.departmentId === departmentId &&
    course.academicProgramId &&
    course.academicProgram?.id === course.academicProgramId &&
    course.academicProgram.departmentId === departmentId &&
    offering.curriculumCourseId &&
    curriculumCourse &&
    curriculumCourse.id === offering.curriculumCourseId &&
    curriculumCourse.departmentId === departmentId &&
    curriculumCourse.courseId === offering.courseId &&
    curriculumCourse.course.id === curriculumCourse.courseId &&
    curriculumCourse.course.departmentId === departmentId &&
    curriculumCourse.course.academicProgramId === course.academicProgramId &&
    curriculumCourse.course.academicProgram?.id ===
      curriculumCourse.course.academicProgramId &&
    curriculumCourse.course.academicProgram.departmentId === departmentId &&
    curriculumVersion &&
    curriculumVersion.id === curriculumCourse.curriculumVersionId &&
    curriculumVersion.departmentId === departmentId &&
    curriculumVersion.academicProgram.id ===
      curriculumVersion.academicProgramId &&
    curriculumVersion.academicProgram.departmentId === departmentId,
  );
}

function isStudentBatchBindingDependencyConsistent(
  studentBatch: StudentBatchBindingRecord,
  departmentId: string,
) {
  return Boolean(
    studentBatch.departmentId === departmentId &&
    studentBatch.academicProgram.id === studentBatch.academicProgramId &&
    studentBatch.academicProgram.departmentId === departmentId &&
    studentBatch.academicSession.id === studentBatch.academicSessionId &&
    studentBatch.academicSession.departmentId === departmentId,
  );
}

type CourseOfferingSyllabusBindingRecord = Prisma.CourseOfferingGetPayload<{
  select: typeof courseOfferingSyllabusBindingSelect;
}>;

function isCourseOfferingCurriculumDependencyConsistent(
  offering: CourseOfferingSyllabusBindingRecord,
  departmentId: string,
) {
  const curriculumCourse = offering.curriculumCourse;

  return Boolean(
    offering.departmentId === departmentId &&
    offering.course.id === offering.courseId &&
    offering.course.departmentId === departmentId &&
    offering.course.academicProgramId &&
    offering.curriculumCourseId &&
    curriculumCourse &&
    curriculumCourse.id === offering.curriculumCourseId &&
    curriculumCourse.courseId === offering.courseId &&
    curriculumCourse.course.id === offering.courseId &&
    curriculumCourse.course.academicProgramId ===
      offering.course.academicProgramId &&
    isSyllabusCurriculumCourseConsistent(curriculumCourse, departmentId),
  );
}

function isSyllabusBindingDependencyConsistent(
  offering: CourseOfferingSyllabusBindingRecord,
  syllabusVersion: SyllabusVersionRecord,
  departmentId: string,
) {
  const offeringCurriculum = offering.curriculumCourse;
  const syllabusCurriculum = syllabusVersion.curriculumCourse;

  return Boolean(
    offeringCurriculum &&
    offering.curriculumCourseId &&
    syllabusVersion.departmentId === departmentId &&
    syllabusVersion.curriculumCourseId === offering.curriculumCourseId &&
    syllabusCurriculum.id === syllabusVersion.curriculumCourseId &&
    syllabusCurriculum.id === offeringCurriculum.id &&
    syllabusCurriculum.courseId === offering.courseId &&
    syllabusCurriculum.curriculumVersionId ===
      offeringCurriculum.curriculumVersionId &&
    syllabusCurriculum.assessmentTemplateId ===
      offeringCurriculum.assessmentTemplateId &&
    isSyllabusCurriculumCourseConsistent(syllabusCurriculum, departmentId),
  );
}

function syllabusVersionUniqueConflict(error: unknown) {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const target = error.meta?.target;
  if (typeof target === "string") {
    if (target === "syllabus_version_dept_curriculum_course_code_uq") {
      return "DUPLICATE_CODE" as const;
    }
    if (target === "syllabus_version_dept_curriculum_course_number_uq") {
      return "DUPLICATE_VERSION_NUMBER" as const;
    }
    return null;
  }

  if (!Array.isArray(target) || target.length !== 3) return null;
  const hasScope =
    (target.includes("department_id") &&
      target.includes("curriculum_course_id")) ||
    (target.includes("departmentId") && target.includes("curriculumCourseId"));
  if (!hasScope) return null;
  if (target.includes("code")) return "DUPLICATE_CODE" as const;
  if (target.includes("version_number") || target.includes("versionNumber")) {
    return "DUPLICATE_VERSION_NUMBER" as const;
  }
  return null;
}

const studentBatchManagementSelect = {
  id: true,
  departmentId: true,
  academicProgramId: true,
  academicSessionId: true,
  code: true,
  name: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  academicProgram: {
    select: {
      id: true,
      departmentId: true,
      code: true,
      name: true,
      archivedAt: true,
    },
  },
  academicSession: {
    select: {
      id: true,
      departmentId: true,
      code: true,
      name: true,
      archivedAt: true,
    },
  },
} satisfies Prisma.StudentBatchSelect;

type StudentBatchManagementRecord = Prisma.StudentBatchGetPayload<{
  select: typeof studentBatchManagementSelect;
}>;

function sanitizeStudentBatchManagementRead(
  batch: StudentBatchManagementRecord,
  departmentId: string,
): StudentBatchView | null {
  if (
    batch.departmentId !== departmentId ||
    batch.archivedAt !== null ||
    batch.academicProgram.id !== batch.academicProgramId ||
    batch.academicProgram.departmentId !== departmentId ||
    batch.academicProgram.archivedAt !== null ||
    batch.academicSession.id !== batch.academicSessionId ||
    batch.academicSession.departmentId !== departmentId ||
    batch.academicSession.archivedAt !== null
  ) {
    return null;
  }

  return {
    id: batch.id,
    departmentId: batch.departmentId,
    academicProgramId: batch.academicProgramId,
    academicSessionId: batch.academicSessionId,
    code: batch.code,
    name: batch.name,
    archivedAt: batch.archivedAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    academicProgram: {
      id: batch.academicProgram.id,
      code: batch.academicProgram.code,
      name: batch.academicProgram.name,
    },
    academicSession: {
      id: batch.academicSession.id,
      code: batch.academicSession.code,
      name: batch.academicSession.name,
    },
  };
}

@Injectable()
export class PrismaAcademicRepository implements AcademicRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findPrograms(filters: ProgramListFilters) {
    return this.prisma.academicProgram.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        status: filters.status,
        OR: filters.search
          ? [
              {
                code: {
                  contains: filters.search,
                },
              },
              {
                name: {
                  contains: filters.search,
                },
              },
            ]
          : undefined,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  findProgramById(departmentId: string, id: string) {
    return this.prisma.academicProgram.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
    });
  }

  createProgram(input: CreateProgramInput) {
    return this.prisma.academicProgram.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status,
      },
    });
  }

  updateProgram(departmentId: string, id: string, input: UpdateProgramInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.academicProgram.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: input,
      });

      if (result.count === 0) {
        return null;
      }

      return tx.academicProgram.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
      });
    });
  }

  findAcademicYears(filters: AcademicYearListFilters) {
    return this.prisma.academicYear.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        status: filters.status,
        isCurrent: filters.isCurrent,
        OR: filters.search
          ? [
              {
                code: {
                  contains: filters.search,
                },
              },
              {
                name: {
                  contains: filters.search,
                },
              },
            ]
          : undefined,
      },
      orderBy: {
        startDate: "desc",
      },
    });
  }

  findAcademicYearById(departmentId: string, id: string) {
    return this.prisma.academicYear.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
    });
  }

  createAcademicYear(input: CreateAcademicYearInput) {
    return this.prisma.academicYear.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: input.isCurrent,
        status: input.status,
      },
    });
  }

  updateAcademicYear(
    departmentId: string,
    id: string,
    input: UpdateAcademicYearInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.academicYear.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: input,
      });

      if (result.count === 0) {
        return null;
      }

      return tx.academicYear.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
      });
    });
  }

  findAcademicTerms(filters: AcademicTermListFilters) {
    return this.prisma.academicTerm.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicYearId: filters.academicYearId,
        status: filters.status,
      },
      include: {
        academicYear: true,
      },
      orderBy: [
        {
          startDate: "desc",
        },
        {
          sequence: "asc",
        },
      ],
    });
  }

  findAcademicTermById(departmentId: string, id: string) {
    return this.prisma.academicTerm.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
      include: {
        academicYear: true,
      },
    });
  }

  createAcademicTerm(input: CreateAcademicTermInput) {
    return this.prisma.academicTerm.create({
      data: {
        departmentId: input.departmentId,
        academicYearId: input.academicYearId,
        code: input.code,
        name: input.name,
        sequence: input.sequence,
        startDate: input.startDate,
        endDate: input.endDate,
        enrollmentStartAt: input.enrollmentStartAt,
        enrollmentEndAt: input.enrollmentEndAt,
        status: input.status,
      },
      include: {
        academicYear: true,
      },
    });
  }

  updateAcademicTerm(
    departmentId: string,
    id: string,
    input: UpdateAcademicTermInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.academicTerm.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: input,
      });

      if (result.count === 0) {
        return null;
      }

      return tx.academicTerm.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: {
          academicYear: true,
        },
      });
    });
  }

  findAcademicSessions(filters: AcademicSessionListFilters) {
    return this.prisma.academicSession.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        OR: filters.search
          ? [
              { code: { contains: filters.search } },
              { name: { contains: filters.search } },
            ]
          : undefined,
      },
      orderBy: [{ code: "desc" }, { createdAt: "desc" }],
    });
  }

  findAcademicSessionById(departmentId: string, id: string) {
    return this.prisma.academicSession.findFirst({
      where: { id, departmentId, archivedAt: null },
    });
  }

  createAcademicSession(input: CreateAcademicSessionWriteInput) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.academicSession.create({
        data: {
          departmentId: input.departmentId,
          code: input.code,
          name: input.name,
        },
        select: { id: true },
      });

      const academicSession = await tx.academicSession.findFirst({
        where: {
          id: created.id,
          departmentId: input.departmentId,
          archivedAt: null,
        },
      });
      if (!academicSession) {
        throw new Error("CREATED_ACADEMIC_SESSION_INTEGRITY_CHECK_FAILED");
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.ACADEMIC_SESSION_CREATED,
          targetType: "academic_session",
          targetId: academicSession.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: { code: input.code },
        },
      });

      return academicSession;
    });
  }

  updateAcademicSession(input: UpdateAcademicSessionWriteInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.academicSession.updateMany({
        where: {
          id: input.academicSessionId,
          departmentId: input.departmentId,
          archivedAt: null,
        },
        data: input.changes,
      });

      if (result.count === 0) return null;

      const academicSession = await tx.academicSession.findFirst({
        where: {
          id: input.academicSessionId,
          departmentId: input.departmentId,
          archivedAt: null,
        },
      });
      if (!academicSession) {
        throw new Error("UPDATED_ACADEMIC_SESSION_INTEGRITY_CHECK_FAILED");
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.ACADEMIC_SESSION_UPDATED,
          targetType: "academic_session",
          targetId: academicSession.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: { updatedFields: Object.keys(input.changes) },
        },
      });

      return academicSession;
    });
  }

  async findStudentBatches(filters: StudentBatchListFilters) {
    const batches = await this.prisma.studentBatch.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicProgramId: filters.academicProgramId,
        academicSessionId: filters.academicSessionId,
        academicProgram: {
          departmentId: filters.departmentId,
          archivedAt: null,
        },
        academicSession: {
          departmentId: filters.departmentId,
          archivedAt: null,
        },
        OR: filters.search
          ? [
              { code: { contains: filters.search } },
              { name: { contains: filters.search } },
            ]
          : undefined,
      },
      select: studentBatchManagementSelect,
      orderBy: [{ createdAt: "desc" }, { code: "asc" }],
    });

    return batches
      .map((batch) =>
        sanitizeStudentBatchManagementRead(batch, filters.departmentId),
      )
      .filter((batch): batch is StudentBatchView => batch !== null);
  }

  async findStudentBatchById(departmentId: string, id: string) {
    const batch = await this.prisma.studentBatch.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
        academicProgram: { departmentId, archivedAt: null },
        academicSession: { departmentId, archivedAt: null },
      },
      select: studentBatchManagementSelect,
    });

    return batch
      ? sanitizeStudentBatchManagementRead(batch, departmentId)
      : null;
  }

  createStudentBatch(input: CreateStudentBatchWriteInput) {
    return this.prisma.$transaction(async (tx) => {
      const lockedProgram = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "academic_programs"
          WHERE "id" = ${input.academicProgramId}
            AND "department_id" = ${input.departmentId}
            AND "archived_at" IS NULL
          FOR UPDATE
        `,
      );
      if (lockedProgram.length !== 1) return null;

      const lockedSession = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "academic_sessions"
          WHERE "id" = ${input.academicSessionId}
            AND "department_id" = ${input.departmentId}
            AND "archived_at" IS NULL
          FOR UPDATE
        `,
      );
      if (lockedSession.length !== 1) return null;

      const created = await tx.studentBatch.create({
        data: {
          departmentId: input.departmentId,
          academicProgramId: input.academicProgramId,
          academicSessionId: input.academicSessionId,
          code: input.code,
          name: input.name,
        },
        select: { id: true },
      });

      const batch = await tx.studentBatch.findFirst({
        where: {
          id: created.id,
          departmentId: input.departmentId,
          archivedAt: null,
          academicProgram: {
            departmentId: input.departmentId,
            archivedAt: null,
          },
          academicSession: {
            departmentId: input.departmentId,
            archivedAt: null,
          },
        },
        select: studentBatchManagementSelect,
      });
      const safeBatch = batch
        ? sanitizeStudentBatchManagementRead(batch, input.departmentId)
        : null;
      if (!safeBatch) {
        throw new Error("CREATED_STUDENT_BATCH_INTEGRITY_CHECK_FAILED");
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.STUDENT_BATCH_CREATED,
          targetType: "student_batch",
          targetId: safeBatch.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: {
            academicProgramId: input.academicProgramId,
            academicSessionId: input.academicSessionId,
            code: input.code,
          },
        },
      });

      return safeBatch;
    });
  }

  updateStudentBatch(input: UpdateStudentBatchWriteInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.studentBatch.findFirst({
        where: {
          id: input.studentBatchId,
          departmentId: input.departmentId,
          archivedAt: null,
        },
        select: {
          id: true,
          academicProgramId: true,
          academicSessionId: true,
        },
      });
      if (!existing) return null;

      const lockedProgram = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "academic_programs"
          WHERE "id" = ${existing.academicProgramId}
            AND "department_id" = ${input.departmentId}
            AND "archived_at" IS NULL
          FOR UPDATE
        `,
      );
      if (lockedProgram.length !== 1) return null;

      const lockedSession = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "academic_sessions"
          WHERE "id" = ${existing.academicSessionId}
            AND "department_id" = ${input.departmentId}
            AND "archived_at" IS NULL
          FOR UPDATE
        `,
      );
      if (lockedSession.length !== 1) return null;

      const result = await tx.studentBatch.updateMany({
        where: {
          id: input.studentBatchId,
          departmentId: input.departmentId,
          archivedAt: null,
          academicProgramId: existing.academicProgramId,
          academicSessionId: existing.academicSessionId,
        },
        data: input.changes,
      });

      if (result.count === 0) return null;

      const batch = await tx.studentBatch.findFirst({
        where: {
          id: input.studentBatchId,
          departmentId: input.departmentId,
          archivedAt: null,
          academicProgram: {
            departmentId: input.departmentId,
            archivedAt: null,
          },
          academicSession: {
            departmentId: input.departmentId,
            archivedAt: null,
          },
        },
        select: studentBatchManagementSelect,
      });
      const safeBatch = batch
        ? sanitizeStudentBatchManagementRead(batch, input.departmentId)
        : null;
      if (!safeBatch) {
        throw new Error("UPDATED_STUDENT_BATCH_INTEGRITY_CHECK_FAILED");
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.STUDENT_BATCH_UPDATED,
          targetType: "student_batch",
          targetId: safeBatch.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: { updatedFields: Object.keys(input.changes) },
        },
      });

      return safeBatch;
    });
  }

  findCourses(filters: CourseListFilters) {
    return this.prisma.course.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicProgramId: filters.academicProgramId,
        status: filters.status,
        OR: filters.search
          ? [
              {
                code: {
                  contains: filters.search,
                },
              },
              {
                title: {
                  contains: filters.search,
                },
              },
            ]
          : undefined,
      },
      include: {
        academicProgram: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  findCourseById(departmentId: string, id: string) {
    return this.prisma.course.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
      include: {
        academicProgram: true,
      },
    });
  }

  createCourse(input: CreateCourseInput) {
    return this.prisma.course.create({
      data: {
        departmentId: input.departmentId,
        academicProgramId: input.academicProgramId,
        code: input.code,
        title: input.title,
        description: input.description,
        creditHours: input.creditHours,
        lectureHours: input.lectureHours,
        labHours: input.labHours,
        status: input.status,
      },
      include: {
        academicProgram: true,
      },
    });
  }

  async updateCourse(
    departmentId: string,
    id: string,
    input: UpdateCourseInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (input.academicProgramId !== undefined) {
        // StudentBatch binding locks CourseOffering before Course. This path
        // shares only the Course lock and never requests CourseOffering rows,
        // so both workflows serialize without reversing their shared order.
        const lockedCourses = await tx.$queryRaw<
          Array<{ id: string; academicProgramId: string | null }>
        >(
          Prisma.sql`
            SELECT "id", "academic_program_id" AS "academicProgramId"
            FROM "courses"
            WHERE "id" = ${id}
              AND "department_id" = ${departmentId}
              AND "archived_at" IS NULL
            FOR UPDATE
          `,
        );
        if (lockedCourses.length !== 1) {
          return { outcome: "COURSE_NOT_FOUND" } as const;
        }

        const currentAcademicProgramId =
          lockedCourses[0]!.academicProgramId;
        if (input.academicProgramId !== null) {
          const lockedPrograms = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "academic_programs"
              WHERE "id" = ${input.academicProgramId}
                AND "department_id" = ${departmentId}
                AND "archived_at" IS NULL
              FOR UPDATE
            `,
          );
          if (lockedPrograms.length !== 1) {
            return { outcome: "ACADEMIC_PROGRAM_NOT_FOUND" } as const;
          }
        }

        if (currentAcademicProgramId !== input.academicProgramId) {
          const lockedCurriculumCourses = await tx.$queryRaw<
            Array<{
              id: string;
              departmentId: string;
            }>
          >(
            Prisma.sql`
              SELECT
                "id",
                "department_id" AS "departmentId"
              FROM "curriculum_courses"
              WHERE "course_id" = ${id}
              ORDER BY "id"
              FOR UPDATE
            `,
          );

          if (
            lockedCurriculumCourses.some(
              (dependency) => dependency.departmentId !== departmentId,
            )
          ) {
            return { outcome: "PROGRAMME_DEPENDENCY_CONFLICT" } as const;
          }

          if (lockedCurriculumCourses.length > 0) {
            return { outcome: "PROGRAMME_DEPENDENCY_CONFLICT" } as const;
          }
        }
      }

      const result = await tx.course.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: input,
      });

      if (result.count === 0) {
        return { outcome: "COURSE_NOT_FOUND" } as const;
      }

      const course = await tx.course.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: {
          academicProgram: true,
        },
      });
      return course
        ? ({ outcome: "UPDATED", course } as const)
        : ({ outcome: "COURSE_NOT_FOUND" } as const);
    });
  }

  async findCourseOfferings(filters: CourseOfferingListFilters) {
    const offerings = await this.prisma.courseOffering.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicTermId: filters.academicTermId,
        courseId: filters.courseId,
        status: filters.status,
        teacherAssignments: filters.assignedTeacherUserId
          ? {
              some: {
                departmentId: filters.departmentId,
                teacherUserId: filters.assignedTeacherUserId,
                status: filters.teacherAssignmentStatus,
                unassignedAt: null,
                archivedAt: null,
              },
            }
          : undefined,
      },
      include: courseOfferingInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    return offerings.flatMap((offering) => {
      const safe = sanitizeCourseOfferingRead(offering, filters.departmentId);
      return safe ? [safe] : [];
    });
  }

  findStudentVisibleCourseOfferings(filters: StudentCourseOfferingListFilters) {
    const now = filters.now ?? new Date();

    return this.prisma.courseOffering.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicTermId: filters.academicTermId,
        status: {
          in: [
            CourseOfferingStatus.ENROLLMENT_OPEN,
            CourseOfferingStatus.IN_PROGRESS,
          ],
        },
        AND: [
          {
            OR: [
              {
                visibilityStartAt: null,
              },
              {
                visibilityStartAt: {
                  lte: now,
                },
              },
            ],
          },
          {
            OR: [
              {
                visibilityEndAt: null,
              },
              {
                visibilityEndAt: {
                  gte: now,
                },
              },
            ],
          },
        ],
        course: {
          departmentId: filters.departmentId,
          status: CourseStatus.ACTIVE,
          archivedAt: null,
        },
        academicTerm: {
          departmentId: filters.departmentId,
          archivedAt: null,
          enrollments: {
            some: {
              departmentId: filters.departmentId,
              studentUserId: filters.studentUserId,
              status: EnrollmentStatus.APPROVED,
              archivedAt: null,
            },
          },
        },
      },
      select: {
        id: true,
        courseId: true,
        academicTermId: true,
        sectionCode: true,
        capacity: true,
        status: true,
        visibilityStartAt: true,
        visibilityEndAt: true,
        createdAt: true,
        updatedAt: true,
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            creditHours: true,
            lectureHours: true,
            labHours: true,
            status: true,
            academicProgramId: true,
          },
        },
        academicTerm: {
          select: {
            id: true,
            code: true,
            name: true,
            sequence: true,
            status: true,
            startDate: true,
            endDate: true,
            enrollmentStartAt: true,
            enrollmentEndAt: true,
            academicYearId: true,
          },
        },
        enrollments: {
          where: {
            departmentId: filters.departmentId,
            studentUserId: filters.studentUserId,
            archivedAt: null,
          },
          select: {
            id: true,
            status: true,
            eligibilityStatus: true,
            enrolledAt: true,
            droppedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          take: 1,
        },
      },
      orderBy: [
        {
          academicTerm: {
            startDate: "desc",
          },
        },
        {
          course: {
            code: "asc",
          },
        },
        {
          sectionCode: "asc",
        },
      ],
    });
  }

  async findCourseOfferingById(departmentId: string, id: string) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
      include: courseOfferingInclude,
    });

    return offering ? sanitizeCourseOfferingRead(offering, departmentId) : null;
  }

  async findCourseOfferingByIdForTeacher(
    departmentId: string,
    id: string,
    teacherUserId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
        teacherAssignments: {
          some: {
            departmentId,
            teacherUserId,
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null,
          },
        },
      },
      include: courseOfferingInclude,
    });

    return offering ? sanitizeCourseOfferingRead(offering, departmentId) : null;
  }

  async findBoundSyllabusVersionForCourseOffering(
    departmentId: string,
    courseOfferingId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        syllabusVersionId: { not: null },
        syllabusVersion: { isNot: null },
      },
      select: {
        syllabusVersion: { select: syllabusVersionSelect },
      },
    });

    return offering?.syllabusVersion
      ? sanitizeSyllabusVersion(offering.syllabusVersion, departmentId)
      : null;
  }

  async findBoundSyllabusVersionForCourseOfferingForTeacher(
    departmentId: string,
    courseOfferingId: string,
    teacherUserId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        syllabusVersionId: { not: null },
        syllabusVersion: { isNot: null },
        teacherAssignments: {
          some: {
            departmentId,
            teacherUserId,
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null,
          },
        },
      },
      select: {
        syllabusVersion: { select: syllabusVersionSelect },
      },
    });

    return offering?.syllabusVersion
      ? sanitizeSyllabusVersion(offering.syllabusVersion, departmentId)
      : null;
  }

  async findApprovedLearningOutcomesForCourseOffering(
    departmentId: string,
    courseOfferingId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        curriculumCourseId: { not: null },
        curriculumCourse: {
          is: {
            departmentId,
            curriculumVersion: {
              is: {
                departmentId,
                status: {
                  in: [...READABLE_LEARNING_OUTCOME_CURRICULUM_STATUSES],
                },
              },
            },
          },
        },
      },
      select: courseOfferingLearningOutcomesSelect,
    });

    return offering
      ? sanitizeCourseOfferingLearningOutcomes(offering, departmentId)
      : null;
  }

  async findApprovedLearningOutcomesForCourseOfferingForTeacher(
    departmentId: string,
    courseOfferingId: string,
    teacherUserId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        curriculumCourseId: { not: null },
        curriculumCourse: {
          is: {
            departmentId,
            curriculumVersion: {
              is: {
                departmentId,
                status: {
                  in: [...READABLE_LEARNING_OUTCOME_CURRICULUM_STATUSES],
                },
              },
            },
          },
        },
        teacherAssignments: {
          some: {
            departmentId,
            teacherUserId,
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null,
          },
        },
      },
      select: courseOfferingLearningOutcomesSelect,
    });

    return offering
      ? sanitizeCourseOfferingLearningOutcomes(offering, departmentId)
      : null;
  }

  async findCourseOutlineVersions(
    departmentId: string,
    courseOfferingId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!offering) return null;

    return this.prisma.courseOutlineVersion.findMany({
      where: { departmentId, courseOfferingId },
      select: courseOutlineVersionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  async findCourseOutlineVersionsForTeacher(
    departmentId: string,
    courseOfferingId: string,
    actorUserId: string,
  ) {
    if (!actorUserId) return null;

    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        teacherAssignments: {
          some: {
            departmentId,
            courseOfferingId,
            teacherUserId: actorUserId,
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null,
          },
        },
      },
      select: { id: true },
    });

    if (!offering) return null;

    return this.prisma.courseOutlineVersion.findMany({
      where: { departmentId, courseOfferingId },
      select: courseOutlineVersionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  async findCourseOutlineVersionById(
    departmentId: string,
    courseOfferingId: string,
    courseOutlineVersionId: string,
  ) {
    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!offering) return null;

    return this.prisma.courseOutlineVersion.findFirst({
      where: {
        id: courseOutlineVersionId,
        departmentId,
        courseOfferingId,
      },
      select: courseOutlineVersionSelect,
    });
  }

  async findCourseOutlineVersionByIdForTeacher(
    departmentId: string,
    courseOfferingId: string,
    courseOutlineVersionId: string,
    actorUserId: string,
  ) {
    if (!actorUserId) return null;

    const offering = await this.prisma.courseOffering.findFirst({
      where: {
        id: courseOfferingId,
        departmentId,
        archivedAt: null,
        teacherAssignments: {
          some: {
            departmentId,
            courseOfferingId,
            teacherUserId: actorUserId,
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null,
          },
        },
      },
      select: { id: true },
    });

    if (!offering) return null;

    return this.prisma.courseOutlineVersion.findFirst({
      where: {
        id: courseOutlineVersionId,
        departmentId,
        courseOfferingId,
      },
      select: courseOutlineVersionSelect,
    });
  }

  async createCourseOutlineVersion(input: CreateCourseOutlineVersionInput) {
    const draftFields = selectCourseOutlineDraftFields(input);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedOffering = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT co."id"
              FROM "course_offerings" co
              WHERE co."id" = ${input.courseOfferingId}
                AND co."department_id" = ${input.departmentId}
                AND co."archived_at" IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM "teacher_course_assignments" tca
                  WHERE tca."course_offering_id" = co."id"
                    AND tca."department_id" = ${input.departmentId}
                    AND tca."teacher_user_id" = ${input.actorUserId}
                    AND tca."status" = 'ACTIVE'
                    AND tca."unassigned_at" IS NULL
                    AND tca."archived_at" IS NULL
                )
              FOR UPDATE
            `,
          );

          if (lockedOffering.length === 0) {
            return { outcome: "OFFERING_NOT_FOUND" } as const;
          }

          const offering = await tx.courseOffering.findFirst({
            where: {
              id: input.courseOfferingId,
              departmentId: input.departmentId,
              archivedAt: null,
              teacherAssignments: {
                some: {
                  departmentId: input.departmentId,
                  courseOfferingId: input.courseOfferingId,
                  teacherUserId: input.actorUserId,
                  status: "ACTIVE",
                  unassignedAt: null,
                  archivedAt: null,
                },
              },
            },
            select: courseOutlineOfferingSelect,
          });

          if (!offering) return { outcome: "OFFERING_NOT_FOUND" } as const;

          const curriculumCourse = offering.curriculumCourse;
          const syllabusVersion = offering.syllabusVersion;
          if (
            !offering.curriculumCourseId ||
            !offering.syllabusVersionId ||
            !curriculumCourse ||
            !syllabusVersion ||
            curriculumCourse.id !== offering.curriculumCourseId ||
            curriculumCourse.departmentId !== input.departmentId ||
            curriculumCourse.courseId !== offering.courseId ||
            syllabusVersion.id !== offering.syllabusVersionId ||
            syllabusVersion.departmentId !== input.departmentId ||
            syllabusVersion.curriculumCourseId !== offering.curriculumCourseId
          ) {
            return { outcome: "OFFERING_NOT_FULLY_BOUND" } as const;
          }

          const openVersion = await tx.courseOutlineVersion.findFirst({
            where: {
              departmentId: input.departmentId,
              courseOfferingId: offering.id,
              status: { in: [...OPEN_COURSE_OUTLINE_STATUSES] },
            },
            select: { id: true },
          });
          if (openVersion) {
            return { outcome: "OPEN_VERSION_ALREADY_EXISTS" } as const;
          }

          const versionIdentity = await tx.courseOutlineVersion.aggregate({
            where: {
              departmentId: input.departmentId,
              courseOfferingId: offering.id,
            },
            _max: { versionNumber: true },
          });
          const versionNumber = (versionIdentity._max.versionNumber ?? 0) + 1;
          if (versionNumber > 32_767) {
            return { outcome: "VERSION_CONFLICT" } as const;
          }

          const courseOutlineVersion = await tx.courseOutlineVersion.create({
            data: {
              departmentId: input.departmentId,
              courseOfferingId: offering.id,
              curriculumCourseId: offering.curriculumCourseId,
              syllabusVersionId: offering.syllabusVersionId,
              versionNumber,
              status: CourseOutlineStatus.DRAFT,
              courseSummary: draftFields.courseSummary ?? null,
              deliveryPlan: draftFields.deliveryPlan ?? null,
              teachingStrategies: draftFields.teachingStrategies ?? null,
              assessmentStrategy: draftFields.assessmentStrategy ?? null,
              evaluationPolicy: draftFields.evaluationPolicy ?? null,
              makeUpProcedure: draftFields.makeUpProcedure ?? null,
            },
            select: courseOutlineVersionSelect,
          });

          await tx.auditLog.create({
            data: {
              requestId: input.requestId,
              actorUserId: input.actorUserId,
              actorType: "USER",
              departmentId: input.departmentId,
              action: ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_CREATED,
              targetType: "course_outline_version",
              targetId: courseOutlineVersion.id,
              outcome: "SUCCESS",
              ipAddress: input.ipAddress,
              userAgent: input.userAgent,
              contextJson: {
                courseOutlineVersionId: courseOutlineVersion.id,
                courseOfferingId: offering.id,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                versionNumber,
                status: CourseOutlineStatus.DRAFT,
              },
            },
          });

          return { outcome: "CREATED", courseOutlineVersion } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        return { outcome: "VERSION_CONFLICT" } as const;
      }
      throw error;
    }
  }

  async updateCourseOutlineVersion(input: UpdateCourseOutlineVersionInput) {
    const draftFields = selectCourseOutlineDraftFields(input);
    return this.prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findFirst({
        where: {
          id: input.courseOfferingId,
          departmentId: input.departmentId,
          archivedAt: null,
          teacherAssignments: {
            some: {
              departmentId: input.departmentId,
              courseOfferingId: input.courseOfferingId,
              teacherUserId: input.actorUserId,
              status: "ACTIVE",
              unassignedAt: null,
              archivedAt: null,
            },
          },
        },
        select: {
          id: true,
          departmentId: true,
          curriculumCourseId: true,
          syllabusVersionId: true,
        },
      });
      if (!offering) return { outcome: "OFFERING_NOT_FOUND" } as const;

      const existing = await tx.courseOutlineVersion.findFirst({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
        },
        select: courseOutlineVersionSelect,
      });
      if (
        !existing ||
        existing.departmentId !== offering.departmentId ||
        existing.curriculumCourseId !== offering.curriculumCourseId ||
        existing.syllabusVersionId !== offering.syllabusVersionId
      ) {
        return { outcome: "OUTLINE_NOT_FOUND" } as const;
      }
      if (!EDITABLE_COURSE_OUTLINE_STATUSES.includes(existing.status)) {
        return { outcome: "OUTLINE_NOT_EDITABLE" } as const;
      }

      const changedFields = COURSE_OUTLINE_DRAFT_FIELD_NAMES.filter(
        (field) =>
          Object.prototype.hasOwnProperty.call(draftFields, field) &&
          existing[field] !== draftFields[field],
      );
      if (changedFields.length === 0) {
        return { outcome: "NO_CHANGES" } as const;
      }

      const data = selectCourseOutlineDraftFields({
        courseSummary: changedFields.includes("courseSummary")
          ? draftFields.courseSummary
          : undefined,
        deliveryPlan: changedFields.includes("deliveryPlan")
          ? draftFields.deliveryPlan
          : undefined,
        teachingStrategies: changedFields.includes("teachingStrategies")
          ? draftFields.teachingStrategies
          : undefined,
        assessmentStrategy: changedFields.includes("assessmentStrategy")
          ? draftFields.assessmentStrategy
          : undefined,
        evaluationPolicy: changedFields.includes("evaluationPolicy")
          ? draftFields.evaluationPolicy
          : undefined,
        makeUpProcedure: changedFields.includes("makeUpProcedure")
          ? draftFields.makeUpProcedure
          : undefined,
      });
      const mutation = await tx.courseOutlineVersion.updateMany({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
          status: { in: [...EDITABLE_COURSE_OUTLINE_STATUSES] },
        },
        data,
      });

      if (mutation.count === 0) {
        const current = await tx.courseOutlineVersion.findFirst({
          where: {
            id: input.courseOutlineVersionId,
            departmentId: input.departmentId,
            courseOfferingId: input.courseOfferingId,
          },
          select: { status: true },
        });
        if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
        if (!EDITABLE_COURSE_OUTLINE_STATUSES.includes(current.status)) {
          return { outcome: "OUTLINE_NOT_EDITABLE" } as const;
        }
        return { outcome: "VERSION_CONFLICT" } as const;
      }

      const courseOutlineVersion = await tx.courseOutlineVersion.findFirst({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
        },
        select: courseOutlineVersionSelect,
      });
      if (!courseOutlineVersion) {
        return { outcome: "OUTLINE_NOT_FOUND" } as const;
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_UPDATED,
          targetType: "course_outline_version",
          targetId: courseOutlineVersion.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: {
            courseOutlineVersionId: courseOutlineVersion.id,
            courseOfferingId: courseOutlineVersion.courseOfferingId,
            curriculumCourseId: courseOutlineVersion.curriculumCourseId,
            syllabusVersionId: courseOutlineVersion.syllabusVersionId,
            versionNumber: courseOutlineVersion.versionNumber,
            status: courseOutlineVersion.status,
            changedFields,
          },
        },
      });

      return { outcome: "UPDATED", courseOutlineVersion } as const;
    });
  }

  async submitCourseOutlineVersion(input: SubmitCourseOutlineVersionInput) {
    return this.prisma.$transaction(async (tx) => {
      const lockedAuthority = await tx.$queryRaw<
        Array<{
          courseOfferingId: string;
          departmentId: string;
          studentBatchId: string | null;
          academicTermId: string;
          curriculumCourseId: string | null;
          syllabusVersionId: string | null;
          teacherCourseAssignmentId: string;
        }>
      >(
        Prisma.sql`
          SELECT
            co."id" AS "courseOfferingId",
            co."department_id" AS "departmentId",
            co."student_batch_id" AS "studentBatchId",
            co."academic_term_id" AS "academicTermId",
            co."curriculum_course_id" AS "curriculumCourseId",
            co."syllabus_version_id" AS "syllabusVersionId",
            tca."id" AS "teacherCourseAssignmentId"
          FROM "course_offerings" co
          INNER JOIN "teacher_course_assignments" tca
            ON tca."course_offering_id" = co."id"
            AND tca."department_id" = ${input.departmentId}
            AND tca."teacher_user_id" = ${input.actorUserId}
            AND tca."status" = 'ACTIVE'
            AND tca."unassigned_at" IS NULL
            AND tca."archived_at" IS NULL
          WHERE co."id" = ${input.courseOfferingId}
            AND co."department_id" = ${input.departmentId}
            AND co."archived_at" IS NULL
          FOR UPDATE OF co, tca
        `,
      );
      if (lockedAuthority.length === 0) {
        return { outcome: "OFFERING_NOT_FOUND" } as const;
      }

      const offering = await tx.courseOffering.findFirst({
        where: {
          id: input.courseOfferingId,
          departmentId: input.departmentId,
          archivedAt: null,
          teacherAssignments: {
            some: {
              departmentId: input.departmentId,
              courseOfferingId: input.courseOfferingId,
              teacherUserId: input.actorUserId,
              status: "ACTIVE",
              unassignedAt: null,
              archivedAt: null,
            },
          },
        },
        select: {
          id: true,
          departmentId: true,
          studentBatchId: true,
          academicTermId: true,
          curriculumCourseId: true,
          syllabusVersionId: true,
        },
      });
      if (!offering) return { outcome: "OFFERING_NOT_FOUND" } as const;

      const lockedOffering = lockedAuthority[0]!;
      if (
        offering.id !== lockedOffering.courseOfferingId ||
        offering.departmentId !== lockedOffering.departmentId ||
        offering.studentBatchId !== lockedOffering.studentBatchId ||
        offering.academicTermId !== lockedOffering.academicTermId ||
        offering.curriculumCourseId !== lockedOffering.curriculumCourseId ||
        offering.syllabusVersionId !== lockedOffering.syllabusVersionId
      ) {
        return { outcome: "OFFERING_NOT_FOUND" } as const;
      }

      const existing = await tx.courseOutlineVersion.findFirst({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
        },
        select: courseOutlineVersionSelect,
      });
      if (
        !existing ||
        existing.departmentId !== offering.departmentId ||
        existing.curriculumCourseId !== offering.curriculumCourseId ||
        existing.syllabusVersionId !== offering.syllabusVersionId
      ) {
        return { outcome: "OUTLINE_NOT_FOUND" } as const;
      }
      const isInitialSubmission =
        existing.status === CourseOutlineStatus.DRAFT &&
        existing.submittedAt === null &&
        existing.approvedAt === null &&
        existing.activatedAt === null &&
        existing.archivedAt === null;
      const isCorrectedResubmission =
        existing.status === CourseOutlineStatus.RETURNED_FOR_CORRECTION &&
        existing.submittedAt !== null &&
        existing.approvedAt === null &&
        existing.activatedAt === null &&
        existing.archivedAt === null;
      if (!isInitialSubmission && !isCorrectedResubmission) {
        return { outcome: "OUTLINE_NOT_SUBMITTABLE" } as const;
      }

      const previousStatus = existing.status;
      const previousSubmittedAt = existing.submittedAt;

      if (
        isCorrectedResubmission &&
        (!offering.studentBatchId ||
          !offering.academicTermId ||
          !offering.curriculumCourseId ||
          !offering.syllabusVersionId)
      ) {
        return { outcome: "OFFERING_NOT_FOUND" } as const;
      }

      const latestCorrectionRequest = isCorrectedResubmission
        ? await tx.courseOutlineCorrectionRequest.findFirst({
            where: {
              departmentId: input.departmentId,
              courseOfferingId: input.courseOfferingId,
              courseOutlineVersionId: input.courseOutlineVersionId,
              returnedAt: {
                gte: previousSubmittedAt!,
                lte: input.transitionAt,
              },
            },
            select: { id: true },
            orderBy: [
              { returnedAt: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
          })
        : null;
      if (isCorrectedResubmission && !latestCorrectionRequest) {
        return { outcome: "OUTLINE_NOT_SUBMITTABLE" } as const;
      }

      const transitionAt =
        isCorrectedResubmission &&
        previousSubmittedAt &&
        input.transitionAt.getTime() <= previousSubmittedAt.getTime()
          ? new Date(previousSubmittedAt.getTime() + 1)
          : input.transitionAt;

      const mutation = await tx.courseOutlineVersion.updateMany({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
          curriculumCourseId: offering.curriculumCourseId ?? undefined,
          syllabusVersionId: offering.syllabusVersionId ?? undefined,
          status: previousStatus,
          submittedAt: previousSubmittedAt,
          approvedAt: null,
          activatedAt: null,
          archivedAt: null,
        },
        data: {
          status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
          submittedAt: transitionAt,
        },
      });

      if (mutation.count === 0) {
        const current = await tx.courseOutlineVersion.findFirst({
          where: {
            id: input.courseOutlineVersionId,
            departmentId: input.departmentId,
            courseOfferingId: input.courseOfferingId,
            curriculumCourseId: offering.curriculumCourseId ?? undefined,
            syllabusVersionId: offering.syllabusVersionId ?? undefined,
          },
          select: {
            status: true,
            submittedAt: true,
            approvedAt: true,
            activatedAt: true,
            archivedAt: true,
          },
        });
        if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
        const remainsInitiallySubmittable =
          current.status === CourseOutlineStatus.DRAFT &&
          current.submittedAt === null &&
          current.approvedAt === null &&
          current.activatedAt === null &&
          current.archivedAt === null;
        const remainsCorrectlyResubmittable =
          current.status === CourseOutlineStatus.RETURNED_FOR_CORRECTION &&
          current.submittedAt !== null &&
          current.approvedAt === null &&
          current.activatedAt === null &&
          current.archivedAt === null;
        if (!remainsInitiallySubmittable && !remainsCorrectlyResubmittable) {
          return { outcome: "OUTLINE_NOT_SUBMITTABLE" } as const;
        }
        return { outcome: "VERSION_CONFLICT" } as const;
      }

      const courseOutlineVersion = await tx.courseOutlineVersion.findFirst({
        where: {
          id: input.courseOutlineVersionId,
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
          curriculumCourseId: offering.curriculumCourseId ?? undefined,
          syllabusVersionId: offering.syllabusVersionId ?? undefined,
        },
        select: courseOutlineVersionSelect,
      });
      if (!courseOutlineVersion) {
        throw new Error("Submitted Course Outline version could not be reloaded");
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: isCorrectedResubmission
            ? ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_RESUBMITTED
            : ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_SUBMITTED,
          targetType: "course_outline_version",
          targetId: courseOutlineVersion.id,
          outcome: "SUCCESS",
          occurredAt: transitionAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: isCorrectedResubmission
            ? {
                courseOutlineVersionId: courseOutlineVersion.id,
                courseOfferingId: courseOutlineVersion.courseOfferingId,
                studentBatchId: offering.studentBatchId!,
                academicTermId: offering.academicTermId,
                curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                versionNumber: courseOutlineVersion.versionNumber,
                courseOutlineCorrectionRequestId: latestCorrectionRequest!.id,
                previousSubmittedAt: previousSubmittedAt!.toISOString(),
                previousStatus: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
                newStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
                transitionTimestamp: transitionAt.toISOString(),
              }
            : {
                courseOutlineVersionId: courseOutlineVersion.id,
                courseOfferingId: courseOutlineVersion.courseOfferingId,
                curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                versionNumber: courseOutlineVersion.versionNumber,
                previousStatus: CourseOutlineStatus.DRAFT,
                newStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
                transitionTimestamp: transitionAt.toISOString(),
              },
        },
      });

      return { outcome: "SUBMITTED", courseOutlineVersion } as const;
    });
  }

  async startCourseOutlineCoordinatorReview(
    input: StartCourseOutlineCoordinatorReviewInput,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const lockedOfferings = await tx.$queryRaw<
              Array<{
                id: string;
                departmentId: string;
                studentBatchId: string | null;
                academicTermId: string;
                curriculumCourseId: string | null;
                syllabusVersionId: string | null;
              }>
            >(Prisma.sql`
              SELECT
                co."id",
                co."department_id" AS "departmentId",
                co."student_batch_id" AS "studentBatchId",
                co."academic_term_id" AS "academicTermId",
                co."curriculum_course_id" AS "curriculumCourseId",
                co."syllabus_version_id" AS "syllabusVersionId"
              FROM "course_offerings" co
              WHERE co."id" = ${input.courseOfferingId}
                AND co."department_id" = ${input.departmentId}
                AND co."archived_at" IS NULL
              FOR UPDATE OF co
            `);
            if (lockedOfferings.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const offering = lockedOfferings[0]!;
            if (
              !offering.studentBatchId ||
              !offering.curriculumCourseId ||
              !offering.syllabusVersionId
            ) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const lockedAssignments = await tx.$queryRaw<
              Array<{ id: string }>
            >(Prisma.sql`
              SELECT bca."id"
              FROM "batch_coordinator_assignments" bca
              WHERE bca."department_id" = ${input.departmentId}
                AND bca."student_batch_id" = ${offering.studentBatchId}
                AND bca."academic_term_id" = ${offering.academicTermId}
                AND bca."coordinator_user_id" = ${input.actorUserId}
              FOR UPDATE OF bca
            `);
            if (lockedAssignments.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const transitionAt = new Date();
            const assignment = await tx.batchCoordinatorAssignment.findFirst({
              where: {
                id: lockedAssignments[0]!.id,
                departmentId: input.departmentId,
                studentBatchId: offering.studentBatchId,
                academicTermId: offering.academicTermId,
                coordinatorUserId: input.actorUserId,
                status: BatchCoordinatorAssignmentStatus.ACTIVE,
                archivedAt: null,
                unassignedAt: null,
                assignedAt: { lte: transitionAt },
                OR: [{ expiresAt: null }, { expiresAt: { gt: transitionAt } }],
                department: {
                  is: {
                    id: input.departmentId,
                    status: DepartmentStatus.ACTIVE,
                    archivedAt: null,
                    deletedAt: null,
                  },
                },
                studentBatch: {
                  is: {
                    id: offering.studentBatchId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                    academicProgram: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                    academicSession: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                  },
                },
                academicTerm: {
                  is: {
                    id: offering.academicTermId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                  },
                },
                coordinatorUser: {
                  is: {
                    id: input.actorUserId,
                    departmentId: input.departmentId,
                    status: UserStatus.ACTIVE,
                    archivedAt: null,
                    deletedAt: null,
                  },
                },
              },
              select: { id: true },
            });
            if (!assignment) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const existing = await tx.courseOutlineVersion.findFirst({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
              },
              select: courseOutlineVersionSelect,
            });
            if (
              !existing ||
              existing.curriculumCourseId !== offering.curriculumCourseId ||
              existing.syllabusVersionId !== offering.syllabusVersionId
            ) {
              return { outcome: "OUTLINE_NOT_FOUND" } as const;
            }
            if (
              existing.status !== CourseOutlineStatus.SUBMITTED_BY_TEACHER ||
              existing.submittedAt === null ||
              existing.approvedAt !== null ||
              existing.activatedAt !== null ||
              existing.archivedAt !== null
            ) {
              return { outcome: "OUTLINE_NOT_REVIEWABLE" } as const;
            }

            const mutation = await tx.courseOutlineVersion.updateMany({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
                submittedAt: { not: null },
                approvedAt: null,
                activatedAt: null,
                archivedAt: null,
              },
              data: { status: CourseOutlineStatus.COORDINATOR_REVIEW },
            });

            if (mutation.count === 0) {
              const current = await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: {
                  status: true,
                  submittedAt: true,
                  approvedAt: true,
                  activatedAt: true,
                  archivedAt: true,
                },
              });
              if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
              if (
                current.status !== CourseOutlineStatus.SUBMITTED_BY_TEACHER ||
                current.submittedAt === null ||
                current.approvedAt !== null ||
                current.activatedAt !== null ||
                current.archivedAt !== null
              ) {
                return { outcome: "OUTLINE_NOT_REVIEWABLE" } as const;
              }
              return { outcome: "CONCURRENT_CONFLICT" } as const;
            }

            const courseOutlineVersion =
              await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: courseOutlineVersionSelect,
              });
            if (!courseOutlineVersion) {
              throw new Error(
                "Coordinator-review Course Outline version could not be reloaded",
              );
            }

            await tx.auditLog.create({
              data: {
                requestId: input.requestId,
                actorUserId: input.actorUserId,
                actorType: "USER",
                departmentId: input.departmentId,
                action:
                  ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_COORDINATOR_REVIEW_STARTED,
                targetType: "course_outline_version",
                targetId: courseOutlineVersion.id,
                outcome: "SUCCESS",
                occurredAt: transitionAt,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                contextJson: {
                  courseOutlineVersionId: courseOutlineVersion.id,
                  courseOfferingId: courseOutlineVersion.courseOfferingId,
                  studentBatchId: offering.studentBatchId,
                  academicTermId: offering.academicTermId,
                  curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                  syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                  versionNumber: courseOutlineVersion.versionNumber,
                  batchCoordinatorAssignmentId: assignment.id,
                  previousStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
                  newStatus: CourseOutlineStatus.COORDINATOR_REVIEW,
                  transitionTimestamp: transitionAt.toISOString(),
                },
              },
            });

            return {
              outcome: "COORDINATOR_REVIEW_STARTED",
              courseOutlineVersion,
            } as const;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (!this.isRetryableSerializableConflict(error)) throw error;
        if (attempt >= 2) return { outcome: "CONCURRENT_CONFLICT" } as const;
      }
    }
  }

  async returnCourseOutlineForCorrection(
    input: ReturnCourseOutlineForCorrectionInput,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const lockedOfferings = await tx.$queryRaw<
              Array<{
                id: string;
                departmentId: string;
                studentBatchId: string | null;
                academicTermId: string;
                curriculumCourseId: string | null;
                syllabusVersionId: string | null;
              }>
            >(Prisma.sql`
              SELECT
                co."id",
                co."department_id" AS "departmentId",
                co."student_batch_id" AS "studentBatchId",
                co."academic_term_id" AS "academicTermId",
                co."curriculum_course_id" AS "curriculumCourseId",
                co."syllabus_version_id" AS "syllabusVersionId"
              FROM "course_offerings" co
              WHERE co."id" = ${input.courseOfferingId}
                AND co."department_id" = ${input.departmentId}
                AND co."archived_at" IS NULL
              FOR UPDATE OF co
            `);
            if (lockedOfferings.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const offering = lockedOfferings[0]!;
            if (
              !offering.studentBatchId ||
              !offering.curriculumCourseId ||
              !offering.syllabusVersionId
            ) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const lockedAssignments = await tx.$queryRaw<
              Array<{ id: string }>
            >(Prisma.sql`
              SELECT bca."id"
              FROM "batch_coordinator_assignments" bca
              WHERE bca."department_id" = ${input.departmentId}
                AND bca."student_batch_id" = ${offering.studentBatchId}
                AND bca."academic_term_id" = ${offering.academicTermId}
                AND bca."coordinator_user_id" = ${input.actorUserId}
              FOR UPDATE OF bca
            `);
            if (lockedAssignments.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const transitionAt = new Date();
            const assignment = await tx.batchCoordinatorAssignment.findFirst({
              where: {
                id: lockedAssignments[0]!.id,
                departmentId: input.departmentId,
                studentBatchId: offering.studentBatchId,
                academicTermId: offering.academicTermId,
                coordinatorUserId: input.actorUserId,
                status: BatchCoordinatorAssignmentStatus.ACTIVE,
                archivedAt: null,
                unassignedAt: null,
                assignedAt: { lte: transitionAt },
                OR: [{ expiresAt: null }, { expiresAt: { gt: transitionAt } }],
                department: {
                  is: {
                    id: input.departmentId,
                    status: DepartmentStatus.ACTIVE,
                    archivedAt: null,
                    deletedAt: null,
                  },
                },
                studentBatch: {
                  is: {
                    id: offering.studentBatchId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                    academicProgram: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                    academicSession: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                  },
                },
                academicTerm: {
                  is: {
                    id: offering.academicTermId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                  },
                },
                coordinatorUser: {
                  is: {
                    id: input.actorUserId,
                    departmentId: input.departmentId,
                    status: UserStatus.ACTIVE,
                    archivedAt: null,
                    deletedAt: null,
                  },
                },
              },
              select: { id: true },
            });
            if (!assignment) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const existing = await tx.courseOutlineVersion.findFirst({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
              },
              select: courseOutlineVersionSelect,
            });
            if (
              !existing ||
              existing.curriculumCourseId !== offering.curriculumCourseId ||
              existing.syllabusVersionId !== offering.syllabusVersionId
            ) {
              return { outcome: "OUTLINE_NOT_FOUND" } as const;
            }
            if (
              existing.status !== CourseOutlineStatus.COORDINATOR_REVIEW ||
              existing.submittedAt === null ||
              existing.approvedAt !== null ||
              existing.activatedAt !== null ||
              existing.archivedAt !== null
            ) {
              return { outcome: "OUTLINE_NOT_RETURNABLE" } as const;
            }

            const mutation = await tx.courseOutlineVersion.updateMany({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                status: CourseOutlineStatus.COORDINATOR_REVIEW,
                submittedAt: { not: null },
                approvedAt: null,
                activatedAt: null,
                archivedAt: null,
              },
              data: { status: CourseOutlineStatus.RETURNED_FOR_CORRECTION },
            });

            if (mutation.count === 0) {
              const current = await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: {
                  status: true,
                  submittedAt: true,
                  approvedAt: true,
                  activatedAt: true,
                  archivedAt: true,
                },
              });
              if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
              if (
                current.status !== CourseOutlineStatus.COORDINATOR_REVIEW ||
                current.submittedAt === null ||
                current.approvedAt !== null ||
                current.activatedAt !== null ||
                current.archivedAt !== null
              ) {
                return { outcome: "OUTLINE_NOT_RETURNABLE" } as const;
              }
              return { outcome: "CONCURRENT_CONFLICT" } as const;
            }

            const courseOutlineCorrectionRequest =
              await tx.courseOutlineCorrectionRequest.create({
                data: {
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  courseOutlineVersionId: input.courseOutlineVersionId,
                  batchCoordinatorAssignmentId: assignment.id,
                  actorUserId: input.actorUserId,
                  reason: input.reason,
                  returnedAt: transitionAt,
                },
              });

            const courseOutlineVersion =
              await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: courseOutlineVersionSelect,
              });
            if (!courseOutlineVersion) {
              throw new Error(
                "Returned-for-correction Course Outline version could not be reloaded",
              );
            }

            await tx.auditLog.create({
              data: {
                requestId: input.requestId,
                actorUserId: input.actorUserId,
                actorType: "USER",
                departmentId: input.departmentId,
                action:
                  ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_RETURNED_FOR_CORRECTION,
                targetType: "course_outline_version",
                targetId: courseOutlineVersion.id,
                outcome: "SUCCESS",
                occurredAt: transitionAt,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                contextJson: {
                  courseOutlineVersionId: courseOutlineVersion.id,
                  courseOfferingId: courseOutlineVersion.courseOfferingId,
                  studentBatchId: offering.studentBatchId,
                  academicTermId: offering.academicTermId,
                  curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                  syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                  versionNumber: courseOutlineVersion.versionNumber,
                  batchCoordinatorAssignmentId: assignment.id,
                  courseOutlineCorrectionRequestId:
                    courseOutlineCorrectionRequest.id,
                  previousStatus: CourseOutlineStatus.COORDINATOR_REVIEW,
                  newStatus: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
                  transitionTimestamp: transitionAt.toISOString(),
                },
              },
            });

            return {
              outcome: "RETURNED_FOR_CORRECTION",
              courseOutlineVersion,
              courseOutlineCorrectionRequest,
            } as const;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (!this.isRetryableSerializableConflict(error)) throw error;
        if (attempt >= 2) return { outcome: "CONCURRENT_CONFLICT" } as const;
      }
    }
  }

  async approveCourseOutlineVersion(input: ApproveCourseOutlineVersionInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const lockedOfferings = await tx.$queryRaw<
              Array<{
                id: string;
                departmentId: string;
                courseId: string;
                studentBatchId: string | null;
                academicTermId: string;
                curriculumCourseId: string | null;
                syllabusVersionId: string | null;
                status: CourseOfferingStatus;
                archivedAt: Date | null;
              }>
            >(Prisma.sql`
              SELECT
                co."id",
                co."department_id" AS "departmentId",
                co."course_id" AS "courseId",
                co."student_batch_id" AS "studentBatchId",
                co."academic_term_id" AS "academicTermId",
                co."curriculum_course_id" AS "curriculumCourseId",
                co."syllabus_version_id" AS "syllabusVersionId",
                co."status",
                co."archived_at" AS "archivedAt"
              FROM "course_offerings" co
              WHERE co."id" = ${input.courseOfferingId}
                AND co."department_id" = ${input.departmentId}
                AND co."archived_at" IS NULL
                AND co."status" <> ${CourseOfferingStatus.ARCHIVED}::"CourseOfferingStatus"
              FOR UPDATE OF co
            `);
            if (lockedOfferings.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const offering = lockedOfferings[0]!;
            if (
              !offering.studentBatchId ||
              !offering.academicTermId ||
              !offering.curriculumCourseId ||
              !offering.syllabusVersionId ||
              offering.status === CourseOfferingStatus.ARCHIVED ||
              offering.archivedAt !== null
            ) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const authorityRows = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT u."id"
                FROM "users" u
                JOIN "departments" d ON d."id" = u."department_id"
                JOIN "user_roles" ur
                  ON ur."user_id" = u."id"
                  AND ur."department_id" = d."id"
                JOIN "roles" r
                  ON r."id" = ur."role_id"
                  AND r."department_id" = d."id"
                JOIN "role_permissions" rp ON rp."role_id" = r."id"
                JOIN "permissions" p ON p."id" = rp."permission_id"
                WHERE u."id" = ${input.actorUserId}
                  AND u."department_id" = ${input.departmentId}
                  AND u."status" = ${UserStatus.ACTIVE}::"UserStatus"
                  AND u."archived_at" IS NULL
                  AND u."deleted_at" IS NULL
                  AND d."status" = ${DepartmentStatus.ACTIVE}::"DepartmentStatus"
                  AND d."archived_at" IS NULL
                  AND d."deleted_at" IS NULL
                  AND ur."id" = ${input.authorizationUserRoleId}
                  AND ur."role_id" = ${input.authorizationRoleId}
                  AND ur."revoked_at" IS NULL
                  AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
                  AND r."id" = ${input.authorizationRoleId}
                  AND r."archived_at" IS NULL
                  AND p."code" = ${PERMISSIONS.COURSE_MANAGEMENT.COURSE_OUTLINE_APPROVE}
                  AND p."resource" = 'course-management.course-outline'
                  AND p."action" = 'approve'
                  AND p."scope" = 'DEPARTMENT'::"PermissionScope"
                FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p
              `,
            );
            if (authorityRows.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const authoritativeOffering = await tx.courseOffering.findFirst({
              where: {
                id: offering.id,
                departmentId: input.departmentId,
                courseId: offering.courseId,
                studentBatchId: offering.studentBatchId,
                academicTermId: offering.academicTermId,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                archivedAt: null,
                status: { not: CourseOfferingStatus.ARCHIVED },
                department: {
                  is: {
                    id: input.departmentId,
                    status: DepartmentStatus.ACTIVE,
                    archivedAt: null,
                    deletedAt: null,
                  },
                },
                course: {
                  is: {
                    id: offering.courseId,
                    departmentId: input.departmentId,
                    academicProgramId: { not: null },
                    archivedAt: null,
                    academicProgram: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                  },
                },
                academicTerm: {
                  is: {
                    id: offering.academicTermId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                    academicYear: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                  },
                },
                studentBatch: {
                  is: {
                    id: offering.studentBatchId,
                    departmentId: input.departmentId,
                    archivedAt: null,
                    academicProgram: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                    academicSession: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                      },
                    },
                  },
                },
                curriculumCourse: {
                  is: {
                    id: offering.curriculumCourseId,
                    departmentId: input.departmentId,
                    courseId: offering.courseId,
                    course: {
                      is: {
                        id: offering.courseId,
                        departmentId: input.departmentId,
                        academicProgramId: { not: null },
                        archivedAt: null,
                      },
                    },
                    curriculumVersion: {
                      is: {
                        departmentId: input.departmentId,
                        archivedAt: null,
                        academicProgram: {
                          is: {
                            departmentId: input.departmentId,
                            archivedAt: null,
                          },
                        },
                      },
                    },
                  },
                },
                syllabusVersion: {
                  is: {
                    id: offering.syllabusVersionId,
                    departmentId: input.departmentId,
                    curriculumCourseId: offering.curriculumCourseId,
                    archivedAt: null,
                  },
                },
              },
              select: {
                id: true,
                departmentId: true,
                courseId: true,
                studentBatchId: true,
                academicTermId: true,
                curriculumCourseId: true,
                syllabusVersionId: true,
                status: true,
                archivedAt: true,
                department: {
                  select: {
                    id: true,
                  },
                },
                course: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicProgramId: true,
                    archivedAt: true,
                    academicProgram: {
                      select: {
                        id: true,
                        departmentId: true,
                        archivedAt: true,
                      },
                    },
                  },
                },
                academicTerm: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicYearId: true,
                    archivedAt: true,
                    academicYear: {
                      select: {
                        id: true,
                        departmentId: true,
                        archivedAt: true,
                      },
                    },
                  },
                },
                studentBatch: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicProgramId: true,
                    academicSessionId: true,
                    archivedAt: true,
                    academicProgram: {
                      select: {
                        id: true,
                        departmentId: true,
                        archivedAt: true,
                      },
                    },
                    academicSession: {
                      select: {
                        id: true,
                        departmentId: true,
                        archivedAt: true,
                      },
                    },
                  },
                },
                curriculumCourse: {
                  select: {
                    id: true,
                    departmentId: true,
                    courseId: true,
                    curriculumVersionId: true,
                    course: {
                      select: {
                        id: true,
                        departmentId: true,
                        academicProgramId: true,
                        archivedAt: true,
                      },
                    },
                    curriculumVersion: {
                      select: {
                        id: true,
                        departmentId: true,
                        academicProgramId: true,
                        archivedAt: true,
                        academicProgram: {
                          select: {
                            id: true,
                            departmentId: true,
                            archivedAt: true,
                          },
                        },
                      },
                    },
                  },
                },
                syllabusVersion: {
                  select: {
                    id: true,
                    departmentId: true,
                    curriculumCourseId: true,
                    archivedAt: true,
                  },
                },
              },
            });
            if (!authoritativeOffering) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const {
              department,
              course,
              academicTerm,
              studentBatch,
              curriculumCourse,
              syllabusVersion,
            } = authoritativeOffering;
            const curriculumVersion = curriculumCourse?.curriculumVersion;
            const courseAcademicProgramId = course.academicProgramId;
            if (
              authoritativeOffering.id !== offering.id ||
              authoritativeOffering.departmentId !== offering.departmentId ||
              authoritativeOffering.courseId !== offering.courseId ||
              authoritativeOffering.studentBatchId !==
                offering.studentBatchId ||
              authoritativeOffering.academicTermId !==
                offering.academicTermId ||
              authoritativeOffering.curriculumCourseId !==
                offering.curriculumCourseId ||
              authoritativeOffering.syllabusVersionId !==
                offering.syllabusVersionId ||
              authoritativeOffering.status !== offering.status ||
              authoritativeOffering.archivedAt !== null ||
              department.id !== input.departmentId ||
              course.id !== offering.courseId ||
              course.departmentId !== input.departmentId ||
              course.archivedAt !== null ||
              !courseAcademicProgramId ||
              !course.academicProgram ||
              course.academicProgram.id !== courseAcademicProgramId ||
              course.academicProgram.departmentId !== input.departmentId ||
              course.academicProgram.archivedAt !== null ||
              academicTerm.id !== offering.academicTermId ||
              academicTerm.departmentId !== input.departmentId ||
              academicTerm.archivedAt !== null ||
              academicTerm.academicYear.id !== academicTerm.academicYearId ||
              academicTerm.academicYear.departmentId !== input.departmentId ||
              academicTerm.academicYear.archivedAt !== null ||
              !studentBatch ||
              studentBatch.id !== offering.studentBatchId ||
              studentBatch.departmentId !== input.departmentId ||
              studentBatch.archivedAt !== null ||
              studentBatch.academicProgram.id !==
                studentBatch.academicProgramId ||
              studentBatch.academicProgram.departmentId !==
                input.departmentId ||
              studentBatch.academicProgram.archivedAt !== null ||
              studentBatch.academicSession.id !==
                studentBatch.academicSessionId ||
              studentBatch.academicSession.departmentId !==
                input.departmentId ||
              studentBatch.academicSession.archivedAt !== null ||
              !curriculumCourse ||
              curriculumCourse.id !== offering.curriculumCourseId ||
              curriculumCourse.departmentId !== input.departmentId ||
              curriculumCourse.courseId !== offering.courseId ||
              curriculumCourse.course.id !== course.id ||
              curriculumCourse.course.departmentId !== input.departmentId ||
              curriculumCourse.course.academicProgramId !==
                courseAcademicProgramId ||
              curriculumCourse.course.archivedAt !== null ||
              !curriculumVersion ||
              curriculumVersion.id !== curriculumCourse.curriculumVersionId ||
              curriculumVersion.departmentId !== input.departmentId ||
              curriculumVersion.archivedAt !== null ||
              curriculumVersion.academicProgram.id !==
                curriculumVersion.academicProgramId ||
              curriculumVersion.academicProgram.departmentId !==
                input.departmentId ||
              curriculumVersion.academicProgram.archivedAt !== null ||
              !syllabusVersion ||
              syllabusVersion.id !== offering.syllabusVersionId ||
              syllabusVersion.departmentId !== input.departmentId ||
              syllabusVersion.curriculumCourseId !== curriculumCourse.id ||
              syllabusVersion.archivedAt !== null ||
              courseAcademicProgramId !==
                curriculumVersion.academicProgramId ||
              courseAcademicProgramId !== studentBatch.academicProgramId
            ) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const existing = await tx.courseOutlineVersion.findFirst({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
              },
              select: courseOutlineVersionSelect,
            });
            if (
              !existing ||
              existing.departmentId !== offering.departmentId ||
              existing.courseOfferingId !== offering.id ||
              existing.curriculumCourseId !== offering.curriculumCourseId ||
              existing.syllabusVersionId !== offering.syllabusVersionId
            ) {
              return { outcome: "OUTLINE_NOT_FOUND" } as const;
            }
            if (
              existing.status !== CourseOutlineStatus.COORDINATOR_REVIEW ||
              existing.submittedAt === null ||
              existing.approvedAt !== null ||
              existing.activatedAt !== null ||
              existing.archivedAt !== null
            ) {
              return { outcome: "OUTLINE_NOT_APPROVABLE" } as const;
            }

            const transitionAt = new Date();
            const mutation = await tx.courseOutlineVersion.updateMany({
              where: {
                id: existing.id,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                status: CourseOutlineStatus.COORDINATOR_REVIEW,
                submittedAt: existing.submittedAt,
                approvedAt: null,
                activatedAt: null,
                archivedAt: null,
              },
              data: {
                status: CourseOutlineStatus.APPROVED,
                approvedAt: transitionAt,
              },
            });
            if (mutation.count !== 1) {
              const current = await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: {
                  status: true,
                  submittedAt: true,
                  approvedAt: true,
                  activatedAt: true,
                  archivedAt: true,
                },
              });
              if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
              if (
                current.status !== CourseOutlineStatus.COORDINATOR_REVIEW ||
                current.submittedAt === null ||
                current.approvedAt !== null ||
                current.activatedAt !== null ||
                current.archivedAt !== null
              ) {
                return { outcome: "OUTLINE_NOT_APPROVABLE" } as const;
              }
              return { outcome: "CONCURRENT_CONFLICT" } as const;
            }

            const courseOutlineVersion =
              await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: courseOutlineVersionSelect,
              });
            if (!courseOutlineVersion) {
              throw new Error(
                "Approved Course Outline version could not be reloaded",
              );
            }

            await tx.auditLog.create({
              data: {
                requestId: input.requestId,
                actorUserId: input.actorUserId,
                actorType: "USER",
                departmentId: input.departmentId,
                action: ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_APPROVED,
                targetType: "course_outline_version",
                targetId: courseOutlineVersion.id,
                outcome: "SUCCESS",
                occurredAt: transitionAt,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                contextJson: {
                  courseOutlineVersionId: courseOutlineVersion.id,
                  courseOfferingId: courseOutlineVersion.courseOfferingId,
                  studentBatchId: offering.studentBatchId,
                  academicTermId: offering.academicTermId,
                  curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                  syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                  versionNumber: courseOutlineVersion.versionNumber,
                  previousStatus: CourseOutlineStatus.COORDINATOR_REVIEW,
                  newStatus: CourseOutlineStatus.APPROVED,
                  transitionTimestamp: transitionAt.toISOString(),
                },
              },
            });

            return { outcome: "APPROVED", courseOutlineVersion } as const;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (!this.isRetryableSerializableConflict(error)) throw error;
        if (attempt >= 2) return { outcome: "CONCURRENT_CONFLICT" } as const;
      }
    }
  }

  async activateCourseOutlineVersion(input: ActivateCourseOutlineVersionInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const lockedOfferings = await tx.$queryRaw<
              Array<{
                id: string;
                departmentId: string;
                courseId: string;
                studentBatchId: string | null;
                academicTermId: string;
                curriculumCourseId: string | null;
                syllabusVersionId: string | null;
                activeCourseOutlineVersionId: string | null;
                status: CourseOfferingStatus;
                archivedAt: Date | null;
              }>
            >(Prisma.sql`
              SELECT
                co."id",
                co."department_id" AS "departmentId",
                co."course_id" AS "courseId",
                co."student_batch_id" AS "studentBatchId",
                co."academic_term_id" AS "academicTermId",
                co."curriculum_course_id" AS "curriculumCourseId",
                co."syllabus_version_id" AS "syllabusVersionId",
                co."active_course_outline_version_id" AS "activeCourseOutlineVersionId",
                co."status",
                co."archived_at" AS "archivedAt"
              FROM "course_offerings" co
              WHERE co."id" = ${input.courseOfferingId}
                AND co."department_id" = ${input.departmentId}
                AND co."archived_at" IS NULL
                AND co."status" <> ${CourseOfferingStatus.ARCHIVED}::"CourseOfferingStatus"
              FOR UPDATE OF co
            `);
            if (lockedOfferings.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const offering = lockedOfferings[0]!;
            // Pending governance: no source-backed narrower CourseOffering status
            // allowlist exists for activation, so preserve approval's archive-only rule.
            if (
              !offering.studentBatchId ||
              !offering.academicTermId ||
              !offering.curriculumCourseId ||
              !offering.syllabusVersionId ||
              offering.status === CourseOfferingStatus.ARCHIVED ||
              offering.archivedAt !== null
            ) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const authorityRows = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT u."id"
                FROM "users" u
                JOIN "departments" d ON d."id" = u."department_id"
                JOIN "user_roles" ur
                  ON ur."user_id" = u."id"
                  AND ur."department_id" = d."id"
                JOIN "roles" r
                  ON r."id" = ur."role_id"
                  AND r."department_id" = d."id"
                JOIN "role_permissions" rp ON rp."role_id" = r."id"
                JOIN "permissions" p ON p."id" = rp."permission_id"
                WHERE u."id" = ${input.actorUserId}
                  AND u."department_id" = ${input.departmentId}
                  AND u."status" = ${UserStatus.ACTIVE}::"UserStatus"
                  AND u."archived_at" IS NULL
                  AND u."deleted_at" IS NULL
                  AND d."status" = ${DepartmentStatus.ACTIVE}::"DepartmentStatus"
                  AND d."archived_at" IS NULL
                  AND d."deleted_at" IS NULL
                  AND ur."id" = ${input.authorizationUserRoleId}
                  AND ur."role_id" = ${input.authorizationRoleId}
                  AND ur."revoked_at" IS NULL
                  AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
                  AND r."id" = ${input.authorizationRoleId}
                  AND r."archived_at" IS NULL
                  AND p."code" = ${PERMISSIONS.COURSE_MANAGEMENT.COURSE_OUTLINE_ACTIVATE}
                  AND p."resource" = 'course-management.course-outline'
                  AND p."action" = 'activate'
                  AND p."scope" = 'DEPARTMENT'::"PermissionScope"
                FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p
              `,
            );
            if (authorityRows.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const academicChainRows = await tx.$queryRaw<
              Array<{ id: string }>
            >(Prisma.sql`
              SELECT co."id"
              FROM "course_offerings" co
              JOIN "departments" d
                ON d."id" = co."department_id"
              JOIN "courses" c
                ON c."id" = co."course_id"
                AND c."department_id" = co."department_id"
              JOIN "academic_programs" cap
                ON cap."id" = c."academic_program_id"
                AND cap."department_id" = co."department_id"
              JOIN "academic_terms" term
                ON term."id" = co."academic_term_id"
                AND term."department_id" = co."department_id"
              JOIN "academic_years" ay
                ON ay."id" = term."academic_year_id"
                AND ay."department_id" = co."department_id"
              JOIN "student_batches" sb
                ON sb."id" = co."student_batch_id"
                AND sb."department_id" = co."department_id"
              JOIN "academic_programs" sbap
                ON sbap."id" = sb."academic_program_id"
                AND sbap."department_id" = co."department_id"
              JOIN "academic_sessions" acs
                ON acs."id" = sb."academic_session_id"
                AND acs."department_id" = co."department_id"
              JOIN "curriculum_courses" cc
                ON cc."id" = co."curriculum_course_id"
                AND cc."department_id" = co."department_id"
                AND cc."course_id" = co."course_id"
              JOIN "curriculum_versions" cv
                ON cv."id" = cc."curriculum_version_id"
                AND cv."department_id" = co."department_id"
              JOIN "academic_programs" cvap
                ON cvap."id" = cv."academic_program_id"
                AND cvap."department_id" = co."department_id"
              JOIN "syllabus_versions" sv
                ON sv."id" = co."syllabus_version_id"
                AND sv."department_id" = co."department_id"
                AND sv."curriculum_course_id" = co."curriculum_course_id"
              WHERE co."id" = ${offering.id}
                AND co."department_id" = ${input.departmentId}
                AND co."course_id" = ${offering.courseId}
                AND co."student_batch_id" = ${offering.studentBatchId}
                AND co."academic_term_id" = ${offering.academicTermId}
                AND co."curriculum_course_id" = ${offering.curriculumCourseId}
                AND co."syllabus_version_id" = ${offering.syllabusVersionId}
                AND co."archived_at" IS NULL
                AND co."status" <> ${CourseOfferingStatus.ARCHIVED}::"CourseOfferingStatus"
                AND d."status" = ${DepartmentStatus.ACTIVE}::"DepartmentStatus"
                AND d."archived_at" IS NULL
                AND d."deleted_at" IS NULL
                AND c."academic_program_id" IS NOT NULL
                AND c."archived_at" IS NULL
                AND cap."archived_at" IS NULL
                AND term."archived_at" IS NULL
                AND ay."archived_at" IS NULL
                AND sb."archived_at" IS NULL
                AND sbap."archived_at" IS NULL
                AND acs."archived_at" IS NULL
                AND cv."archived_at" IS NULL
                AND cvap."archived_at" IS NULL
                AND sv."archived_at" IS NULL
                AND c."academic_program_id" = cv."academic_program_id"
                AND c."academic_program_id" = sb."academic_program_id"
              FOR SHARE OF d, c, cap, term, ay, sb, sbap, acs, cc, cv, cvap, sv
            `);
            if (academicChainRows.length !== 1) {
              return { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" } as const;
            }

            const lockedTargets = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT cov."id"
                FROM "course_outline_versions" cov
                WHERE cov."id" = ${input.courseOutlineVersionId}
                  AND cov."department_id" = ${input.departmentId}
                  AND cov."course_offering_id" = ${offering.id}
                FOR UPDATE OF cov
              `,
            );
            if (lockedTargets.length !== 1) {
              return { outcome: "OUTLINE_NOT_FOUND" } as const;
            }

            const existing = await tx.courseOutlineVersion.findFirst({
              where: {
                id: input.courseOutlineVersionId,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
              },
              select: courseOutlineVersionSelect,
            });
            if (
              !existing ||
              existing.departmentId !== offering.departmentId ||
              existing.courseOfferingId !== offering.id ||
              existing.curriculumCourseId !== offering.curriculumCourseId ||
              existing.syllabusVersionId !== offering.syllabusVersionId
            ) {
              return { outcome: "OUTLINE_NOT_FOUND" } as const;
            }
            if (
              existing.status !== CourseOutlineStatus.APPROVED ||
              existing.submittedAt === null ||
              existing.approvedAt === null ||
              existing.activatedAt !== null ||
              existing.archivedAt !== null
            ) {
              return { outcome: "OUTLINE_NOT_ACTIVATABLE" } as const;
            }

            if (offering.activeCourseOutlineVersionId !== null) {
              return { outcome: "ACTIVE_OUTLINE_ALREADY_EXISTS" } as const;
            }

            const activeOutlines = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT cov."id"
                FROM "course_outline_versions" cov
                WHERE cov."department_id" = ${input.departmentId}
                  AND cov."course_offering_id" = ${offering.id}
                  AND cov."status" = ${CourseOutlineStatus.ACTIVE}::"CourseOutlineStatus"
                ORDER BY cov."id"
                FOR UPDATE OF cov
              `,
            );
            if (activeOutlines.length !== 0) {
              return { outcome: "ACTIVE_OUTLINE_ALREADY_EXISTS" } as const;
            }

            const transitionAt = new Date();
            const outlineMutation = await tx.courseOutlineVersion.updateMany({
              where: {
                id: existing.id,
                departmentId: input.departmentId,
                courseOfferingId: offering.id,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                status: CourseOutlineStatus.APPROVED,
                submittedAt: existing.submittedAt,
                approvedAt: existing.approvedAt,
                activatedAt: null,
                archivedAt: null,
              },
              data: {
                status: CourseOutlineStatus.ACTIVE,
                activatedAt: transitionAt,
              },
            });
            if (outlineMutation.count !== 1) {
              const current = await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                },
                select: {
                  status: true,
                  submittedAt: true,
                  approvedAt: true,
                  activatedAt: true,
                  archivedAt: true,
                },
              });
              if (!current) return { outcome: "OUTLINE_NOT_FOUND" } as const;
              if (
                current.status !== CourseOutlineStatus.APPROVED ||
                current.submittedAt === null ||
                current.approvedAt === null ||
                current.activatedAt !== null ||
                current.archivedAt !== null
              ) {
                return { outcome: "OUTLINE_NOT_ACTIVATABLE" } as const;
              }
              return { outcome: "CONCURRENT_CONFLICT" } as const;
            }

            const bindingMutation = await tx.courseOffering.updateMany({
              where: {
                id: offering.id,
                departmentId: input.departmentId,
                courseId: offering.courseId,
                studentBatchId: offering.studentBatchId,
                academicTermId: offering.academicTermId,
                curriculumCourseId: offering.curriculumCourseId,
                syllabusVersionId: offering.syllabusVersionId,
                activeCourseOutlineVersionId: null,
                archivedAt: null,
                status: { not: CourseOfferingStatus.ARCHIVED },
              },
              data: {
                activeCourseOutlineVersionId: existing.id,
              },
            });
            if (bindingMutation.count !== 1) {
              throw new CourseOutlineActivationBindingConflictError();
            }

            const courseOutlineVersion =
              await tx.courseOutlineVersion.findFirst({
                where: {
                  id: input.courseOutlineVersionId,
                  departmentId: input.departmentId,
                  courseOfferingId: offering.id,
                  curriculumCourseId: offering.curriculumCourseId,
                  syllabusVersionId: offering.syllabusVersionId,
                  status: CourseOutlineStatus.ACTIVE,
                  submittedAt: existing.submittedAt,
                  approvedAt: existing.approvedAt,
                  activatedAt: transitionAt,
                  archivedAt: null,
                },
                select: courseOutlineVersionSelect,
              });
            if (!courseOutlineVersion) {
              throw new Error(
                "Activated Course Outline version could not be reloaded",
              );
            }

            await tx.auditLog.create({
              data: {
                requestId: input.requestId,
                actorUserId: input.actorUserId,
                actorType: "USER",
                departmentId: input.departmentId,
                action: ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_ACTIVATED,
                targetType: "course_outline_version",
                targetId: courseOutlineVersion.id,
                outcome: "SUCCESS",
                occurredAt: transitionAt,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                contextJson: {
                  courseOutlineVersionId: courseOutlineVersion.id,
                  courseOfferingId: courseOutlineVersion.courseOfferingId,
                  activeCourseOutlineVersionId: courseOutlineVersion.id,
                  studentBatchId: offering.studentBatchId,
                  academicTermId: offering.academicTermId,
                  curriculumCourseId: courseOutlineVersion.curriculumCourseId,
                  syllabusVersionId: courseOutlineVersion.syllabusVersionId,
                  versionNumber: courseOutlineVersion.versionNumber,
                  previousStatus: CourseOutlineStatus.APPROVED,
                  newStatus: CourseOutlineStatus.ACTIVE,
                  transitionTimestamp: transitionAt.toISOString(),
                },
              },
            });

            return { outcome: "ACTIVATED", courseOutlineVersion } as const;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (error instanceof CourseOutlineActivationBindingConflictError) {
          return { outcome: "CONCURRENT_CONFLICT" } as const;
        }
        if (this.isActiveCourseOutlineUniqueConflict(error)) {
          return { outcome: "ACTIVE_OUTLINE_ALREADY_EXISTS" } as const;
        }
        if (!this.isRetryableSerializableConflict(error)) throw error;
        if (attempt >= 2) return { outcome: "CONCURRENT_CONFLICT" } as const;
      }
    }
  }

  async createCourseOffering(input: CreateCourseOfferingInput) {
    const offering = await this.prisma.courseOffering.create({
      data: {
        departmentId: input.departmentId,
        courseId: input.courseId,
        academicTermId: input.academicTermId,
        sectionCode: input.sectionCode,
        capacity: input.capacity,
        status: input.status,
        visibilityStartAt: input.visibilityStartAt,
        visibilityEndAt: input.visibilityEndAt,
      },
      include: courseOfferingInclude,
    });

    return sanitizeCourseOfferingRead(offering, input.departmentId);
  }

  updateCourseOffering(
    departmentId: string,
    id: string,
    input: UpdateCourseOfferingInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.courseOffering.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: input,
      });

      if (result.count === 0) {
        return null;
      }

      const offering = await tx.courseOffering.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: courseOfferingInclude,
      });

      return offering
        ? sanitizeCourseOfferingRead(offering, departmentId)
        : null;
    });
  }

  async bindCourseOfferingCurriculum(input: BindCourseOfferingCurriculumInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const offering = await tx.courseOffering.findFirst({
          where: {
            id: input.courseOfferingId,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          select: {
            id: true,
            departmentId: true,
            academicTermId: true,
            courseId: true,
            curriculumCourseId: true,
            sectionCode: true,
            course: {
              select: {
                id: true,
                departmentId: true,
                academicProgramId: true,
              },
            },
            curriculumCourse: {
              select: {
                id: true,
                departmentId: true,
                courseId: true,
                curriculumVersionId: true,
                assessmentTemplateId: true,
                course: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicProgramId: true,
                  },
                },
                curriculumVersion: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicProgramId: true,
                    academicProgram: {
                      select: { id: true, departmentId: true },
                    },
                  },
                },
                assessmentTemplate: {
                  select: {
                    id: true,
                    departmentId: true,
                    academicProgramId: true,
                    academicProgram: {
                      select: { id: true, departmentId: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!offering) {
          return { outcome: "OFFERING_NOT_FOUND" } as const;
        }

        if (offering.curriculumCourseId) {
          if (offering.curriculumCourseId !== input.curriculumCourseId) {
            return { outcome: "BINDING_CONFLICT" } as const;
          }

          const current = offering.curriculumCourse;
          const academicProgramId = offering.course.academicProgramId;
          const templateProgramIsValid = current?.assessmentTemplate
            .academicProgramId
            ? current.assessmentTemplate.academicProgramId ===
                academicProgramId &&
              current.assessmentTemplate.academicProgram?.id ===
                current.assessmentTemplate.academicProgramId &&
              current.assessmentTemplate.academicProgram.departmentId ===
                input.departmentId
            : current?.assessmentTemplate.academicProgram === null;
          if (
            !academicProgramId ||
            offering.departmentId !== input.departmentId ||
            offering.course.id !== offering.courseId ||
            offering.course.departmentId !== input.departmentId ||
            !current ||
            current.id !== offering.curriculumCourseId ||
            current.departmentId !== input.departmentId ||
            current.courseId !== offering.courseId ||
            current.course.id !== current.courseId ||
            current.course.departmentId !== input.departmentId ||
            current.course.academicProgramId !== academicProgramId ||
            current.curriculumVersion.id !== current.curriculumVersionId ||
            current.curriculumVersion.departmentId !== input.departmentId ||
            current.curriculumVersion.academicProgramId !== academicProgramId ||
            current.curriculumVersion.academicProgram.id !==
              academicProgramId ||
            current.curriculumVersion.academicProgram.departmentId !==
              input.departmentId ||
            current.assessmentTemplate.id !== current.assessmentTemplateId ||
            current.assessmentTemplate.departmentId !== input.departmentId ||
            !templateProgramIsValid
          ) {
            return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
          }

          const existing = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
            },
            include: courseOfferingInclude,
          });

          if (!existing) {
            return { outcome: "OFFERING_NOT_FOUND" } as const;
          }

          const safeExisting = sanitizeCourseOfferingRead(
            existing,
            input.departmentId,
          );

          return safeExisting
            ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
            : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
        }

        if (
          offering.departmentId !== input.departmentId ||
          offering.course.id !== offering.courseId ||
          offering.course.departmentId !== input.departmentId
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        const curriculumCourse = await tx.curriculumCourse.findFirst({
          where: {
            id: input.curriculumCourseId,
            departmentId: input.departmentId,
          },
          select: {
            id: true,
            departmentId: true,
            courseId: true,
            curriculumVersionId: true,
            assessmentTemplateId: true,
            course: {
              select: {
                id: true,
                departmentId: true,
                academicProgramId: true,
              },
            },
            curriculumVersion: {
              select: {
                id: true,
                departmentId: true,
                status: true,
                archivedAt: true,
                academicProgramId: true,
                academicProgram: {
                  select: { id: true, departmentId: true },
                },
              },
            },
            assessmentTemplate: {
              select: {
                id: true,
                departmentId: true,
                status: true,
                archivedAt: true,
                academicProgramId: true,
                academicProgram: {
                  select: { id: true, departmentId: true },
                },
              },
            },
          },
        });

        if (!curriculumCourse) {
          return { outcome: "CURRICULUM_COURSE_NOT_FOUND" } as const;
        }

        const academicProgramId = offering.course.academicProgramId;
        const templateProgramIsValid = curriculumCourse.assessmentTemplate
          .academicProgramId
          ? curriculumCourse.assessmentTemplate.academicProgramId ===
              academicProgramId &&
            curriculumCourse.assessmentTemplate.academicProgram?.id ===
              curriculumCourse.assessmentTemplate.academicProgramId &&
            curriculumCourse.assessmentTemplate.academicProgram.departmentId ===
              input.departmentId
          : curriculumCourse.assessmentTemplate.academicProgram === null;

        if (
          !academicProgramId ||
          curriculumCourse.departmentId !== input.departmentId ||
          curriculumCourse.course.id !== curriculumCourse.courseId ||
          curriculumCourse.course.departmentId !== input.departmentId ||
          curriculumCourse.course.academicProgramId !== academicProgramId ||
          curriculumCourse.curriculumVersion.id !==
            curriculumCourse.curriculumVersionId ||
          curriculumCourse.curriculumVersion.departmentId !==
            input.departmentId ||
          curriculumCourse.curriculumVersion.academicProgramId !==
            academicProgramId ||
          curriculumCourse.curriculumVersion.academicProgram.id !==
            academicProgramId ||
          curriculumCourse.curriculumVersion.academicProgram.departmentId !==
            input.departmentId ||
          curriculumCourse.assessmentTemplate.id !==
            curriculumCourse.assessmentTemplateId ||
          curriculumCourse.assessmentTemplate.departmentId !==
            input.departmentId ||
          !templateProgramIsValid
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        if (curriculumCourse.courseId !== offering.courseId) {
          return { outcome: "COURSE_MISMATCH" } as const;
        }

        if (
          curriculumCourse.curriculumVersion.archivedAt ||
          !BINDABLE_ACADEMIC_VERSION_STATUSES.includes(
            curriculumCourse.curriculumVersion.status,
          )
        ) {
          return { outcome: "INACTIVE_CURRICULUM_VERSION" } as const;
        }

        if (
          curriculumCourse.assessmentTemplate.archivedAt ||
          !BINDABLE_ACADEMIC_VERSION_STATUSES.includes(
            curriculumCourse.assessmentTemplate.status,
          )
        ) {
          return { outcome: "INACTIVE_ASSESSMENT_TEMPLATE" } as const;
        }

        const identityConflict = await tx.courseOffering.findFirst({
          where: {
            id: { not: offering.id },
            departmentId: input.departmentId,
            academicTermId: offering.academicTermId,
            curriculumCourseId: curriculumCourse.id,
            sectionCode: offering.sectionCode,
          },
          select: { id: true },
        });
        if (identityConflict) {
          return { outcome: "BINDING_CONFLICT" } as const;
        }

        const updated = await tx.courseOffering.updateMany({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
            curriculumCourseId: null,
          },
          data: { curriculumCourseId: curriculumCourse.id },
        });

        if (updated.count === 0) {
          const concurrent = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
            },
            select: { curriculumCourseId: true },
          });

          if (!concurrent) {
            return { outcome: "OFFERING_NOT_FOUND" } as const;
          }

          if (concurrent.curriculumCourseId !== curriculumCourse.id) {
            return { outcome: "BINDING_CONFLICT" } as const;
          }

          const existing = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
            },
            include: courseOfferingInclude,
          });

          if (!existing) {
            return { outcome: "OFFERING_NOT_FOUND" } as const;
          }

          const safeExisting = sanitizeCourseOfferingRead(
            existing,
            input.departmentId,
          );

          return safeExisting
            ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
            : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
        }

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: ACADEMIC_AUDIT_EVENTS.OFFERING_CURRICULUM_BOUND,
            targetType: "course_offering",
            targetId: offering.id,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            contextJson: {
              courseOfferingId: offering.id,
              curriculumCourseId: curriculumCourse.id,
              curriculumVersionId: curriculumCourse.curriculumVersionId,
              assessmentTemplateId: curriculumCourse.assessmentTemplateId,
              courseId: offering.courseId,
              previousBindingValue: null,
              newBindingValue: curriculumCourse.id,
              curriculumVersionStatus:
                curriculumCourse.curriculumVersion.status,
              assessmentTemplateStatus:
                curriculumCourse.assessmentTemplate.status,
            },
          },
        });

        const bound = await tx.courseOffering.findFirst({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          include: courseOfferingInclude,
        });

        const safeBound = bound
          ? sanitizeCourseOfferingRead(bound, input.departmentId)
          : null;

        if (!safeBound) {
          throw new Error("BOUND_COURSE_OFFERING_NOT_FOUND");
        }

        return { outcome: "BOUND", offering: safeBound } as const;
      });
    } catch (error) {
      if (!isCourseOfferingBoundIdentityConflict(error)) {
        throw error;
      }

      const offering = await this.prisma.courseOffering.findFirst({
        where: {
          id: input.courseOfferingId,
          departmentId: input.departmentId,
          archivedAt: null,
        },
        select: {
          academicTermId: true,
          sectionCode: true,
        },
      });
      if (!offering) {
        throw error;
      }

      const conflict = await this.prisma.courseOffering.findFirst({
        where: {
          id: { not: input.courseOfferingId },
          departmentId: input.departmentId,
          academicTermId: offering.academicTermId,
          curriculumCourseId: input.curriculumCourseId,
          sectionCode: offering.sectionCode,
        },
        select: { id: true },
      });

      if (conflict) {
        return { outcome: "BINDING_CONFLICT" } as const;
      }
      throw error;
    }
  }

  async bindCourseOfferingSyllabus(input: BindCourseOfferingSyllabusInput) {
    return this.prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findFirst({
        where: {
          id: input.courseOfferingId,
          departmentId: input.departmentId,
          archivedAt: null,
        },
        select: courseOfferingSyllabusBindingSelect,
      });

      if (!offering) {
        return { outcome: "OFFERING_NOT_FOUND" } as const;
      }
      if (!offering.curriculumCourseId) {
        return { outcome: "OFFERING_CURRICULUM_NOT_BOUND" } as const;
      }
      if (
        !isCourseOfferingCurriculumDependencyConsistent(
          offering,
          input.departmentId,
        )
      ) {
        return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
      }
      if (
        offering.syllabusVersionId &&
        offering.syllabusVersionId !== input.syllabusVersionId
      ) {
        return { outcome: "BINDING_CONFLICT" } as const;
      }

      const lockedSyllabus = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "syllabus_versions"
          WHERE "id" = ${input.syllabusVersionId}
            AND "department_id" = ${input.departmentId}
          FOR UPDATE
        `,
      );
      if (lockedSyllabus.length !== 1) {
        return { outcome: "SYLLABUS_VERSION_NOT_FOUND" } as const;
      }

      const syllabusVersion = await tx.syllabusVersion.findFirst({
        where: {
          id: input.syllabusVersionId,
          departmentId: input.departmentId,
        },
        select: syllabusVersionSelect,
      });
      if (!syllabusVersion) {
        return { outcome: "SYLLABUS_VERSION_NOT_FOUND" } as const;
      }
      if (syllabusVersion.curriculumCourseId !== offering.curriculumCourseId) {
        return { outcome: "SYLLABUS_CURRICULUM_MISMATCH" } as const;
      }
      if (
        syllabusVersion.id !== input.syllabusVersionId ||
        !isSyllabusBindingDependencyConsistent(
          offering,
          syllabusVersion,
          input.departmentId,
        )
      ) {
        return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
      }
      if (!isSyllabusVersionLifecycleStateConsistent(syllabusVersion)) {
        return { outcome: "MALFORMED_SYLLABUS_VERSION" } as const;
      }

      const isEligibleForNewBinding =
        BINDABLE_SYLLABUS_VERSION_STATUSES.includes(syllabusVersion.status);

      if (offering.syllabusVersionId === input.syllabusVersionId) {
        const isValidHistoricalTarget =
          syllabusVersion.status === AcademicVersionStatus.RETIRED ||
          syllabusVersion.status === AcademicVersionStatus.ARCHIVED;
        if (!isEligibleForNewBinding && !isValidHistoricalTarget) {
          return { outcome: "INELIGIBLE_SYLLABUS_VERSION" } as const;
        }

        const existing = await tx.courseOffering.findFirst({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          include: courseOfferingInclude,
        });
        const safeExisting = existing
          ? sanitizeCourseOfferingRead(existing, input.departmentId)
          : null;

        return safeExisting
          ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
          : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
      }

      if (!isEligibleForNewBinding) {
        return { outcome: "INELIGIBLE_SYLLABUS_VERSION" } as const;
      }

      const updated = await tx.courseOffering.updateMany({
        where: {
          id: offering.id,
          departmentId: input.departmentId,
          archivedAt: null,
          curriculumCourseId: offering.curriculumCourseId,
          syllabusVersionId: null,
        },
        data: {
          syllabusVersionId: syllabusVersion.id,
        },
      });

      if (updated.count === 0) {
        const concurrent = await tx.courseOffering.findFirst({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          select: courseOfferingSyllabusBindingSelect,
        });
        if (!concurrent) {
          return { outcome: "OFFERING_NOT_FOUND" } as const;
        }
        if (
          !isCourseOfferingCurriculumDependencyConsistent(
            concurrent,
            input.departmentId,
          )
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }
        if (concurrent.syllabusVersionId !== syllabusVersion.id) {
          if (concurrent.syllabusVersionId) {
            return { outcome: "BINDING_CONFLICT" } as const;
          }
          throw new Error("SYLLABUS_BINDING_GUARD_MISSED");
        }

        const existing = await tx.courseOffering.findFirst({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          include: courseOfferingInclude,
        });
        const safeExisting = existing
          ? sanitizeCourseOfferingRead(existing, input.departmentId)
          : null;

        return safeExisting
          ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
          : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
      }

      await tx.auditLog.create({
        data: {
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          actorType: "USER",
          departmentId: input.departmentId,
          action: ACADEMIC_AUDIT_EVENTS.OFFERING_SYLLABUS_BOUND,
          targetType: "course_offering",
          targetId: offering.id,
          outcome: "SUCCESS",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          contextJson: {
            courseOfferingId: offering.id,
            courseId: offering.courseId,
            curriculumCourseId: offering.curriculumCourseId,
            syllabusVersionId: syllabusVersion.id,
            syllabusCode: syllabusVersion.code,
            syllabusVersionNumber: syllabusVersion.versionNumber,
            syllabusStatusAtBinding: syllabusVersion.status,
            previousBindingValue: null,
            newBindingValue: syllabusVersion.id,
          },
        },
      });

      const bound = await tx.courseOffering.findFirst({
        where: {
          id: offering.id,
          departmentId: input.departmentId,
          archivedAt: null,
        },
        include: courseOfferingInclude,
      });
      const safeBound = bound
        ? sanitizeCourseOfferingRead(bound, input.departmentId)
        : null;
      if (!safeBound) {
        throw new Error("BOUND_COURSE_OFFERING_NOT_FOUND");
      }

      return { outcome: "BOUND", offering: safeBound } as const;
    });
  }

  async bindCourseOfferingStudentBatch(
    input: BindCourseOfferingStudentBatchInput,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockedOffering = await tx.$queryRaw<
          Array<{ id: string; courseId: string }>
        >(
          Prisma.sql`
            SELECT "id", "course_id" AS "courseId"
            FROM "course_offerings"
            WHERE "id" = ${input.courseOfferingId}
              AND "department_id" = ${input.departmentId}
              AND "archived_at" IS NULL
              AND "status" <> 'ARCHIVED'
            FOR UPDATE
          `,
        );
        if (lockedOffering.length !== 1) {
          return { outcome: "OFFERING_NOT_FOUND" } as const;
        }

        const lockedCourse = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "courses"
            WHERE "id" = ${lockedOffering[0]!.courseId}
              AND "department_id" = ${input.departmentId}
            FOR UPDATE
          `,
        );
        if (lockedCourse.length !== 1) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        const offering = await tx.courseOffering.findFirst({
          where: {
            id: input.courseOfferingId,
            departmentId: input.departmentId,
            archivedAt: null,
            status: { not: CourseOfferingStatus.ARCHIVED },
          },
          select: courseOfferingStudentBatchBindingSelect,
        });

        if (!offering) {
          return { outcome: "OFFERING_NOT_FOUND" } as const;
        }
        if (!offering.curriculumCourseId) {
          return { outcome: "OFFERING_CURRICULUM_NOT_BOUND" } as const;
        }
        if (
          offering.studentBatchId &&
          offering.studentBatchId !== input.studentBatchId
        ) {
          return { outcome: "BINDING_CONFLICT" } as const;
        }
        if (
          !isCourseOfferingStudentBatchDependencyConsistent(
            offering,
            input.departmentId,
          )
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        const isExactHistoricalBinding =
          offering.studentBatchId === input.studentBatchId;
        const lockedStudentBatch = await tx.$queryRaw<Array<{ id: string }>>(
          isExactHistoricalBinding
            ? Prisma.sql`
                SELECT "id"
                FROM "student_batches"
                WHERE "id" = ${input.studentBatchId}
                  AND "department_id" = ${input.departmentId}
                FOR UPDATE
              `
            : Prisma.sql`
                SELECT "id"
                FROM "student_batches"
                WHERE "id" = ${input.studentBatchId}
                  AND "department_id" = ${input.departmentId}
                  AND "archived_at" IS NULL
                FOR UPDATE
              `,
        );
        if (lockedStudentBatch.length !== 1) {
          return { outcome: "STUDENT_BATCH_NOT_FOUND" } as const;
        }

        const studentBatch = await tx.studentBatch.findFirst({
          where: {
            id: input.studentBatchId,
            departmentId: input.departmentId,
            ...(isExactHistoricalBinding ? {} : { archivedAt: null }),
          },
          select: studentBatchBindingSelect,
        });
        if (!studentBatch) {
          return { outcome: "STUDENT_BATCH_NOT_FOUND" } as const;
        }
        if (
          !isStudentBatchBindingDependencyConsistent(
            studentBatch,
            input.departmentId,
          )
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        const courseAcademicProgramId = offering.course.academicProgramId!;
        const curriculumAcademicProgramId =
          offering.curriculumCourse!.curriculumVersion.academicProgramId;
        if (
          courseAcademicProgramId !== curriculumAcademicProgramId ||
          courseAcademicProgramId !== studentBatch.academicProgramId
        ) {
          return { outcome: "PROGRAMME_MISMATCH" } as const;
        }

        if (isExactHistoricalBinding) {
          const existing = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
              status: { not: CourseOfferingStatus.ARCHIVED },
            },
            include: courseOfferingInclude,
          });
          const safeExisting = existing
            ? sanitizeCourseOfferingRead(existing, input.departmentId)
            : null;

          return safeExisting
            ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
            : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
        }

        const identityConflict = await tx.courseOffering.findFirst({
          where: {
            id: { not: offering.id },
            departmentId: input.departmentId,
            academicTermId: offering.academicTermId,
            studentBatchId: studentBatch.id,
            curriculumCourseId: offering.curriculumCourseId,
            sectionCode: offering.sectionCode,
          },
          select: { id: true },
        });
        if (identityConflict) {
          return { outcome: "BINDING_CONFLICT" } as const;
        }

        const updated = await tx.courseOffering.updateMany({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
            status: { not: CourseOfferingStatus.ARCHIVED },
            curriculumCourseId: offering.curriculumCourseId,
            studentBatchId: null,
          },
          data: { studentBatchId: studentBatch.id },
        });

        if (updated.count === 0) {
          const concurrent = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
              status: { not: CourseOfferingStatus.ARCHIVED },
            },
            select: courseOfferingStudentBatchBindingSelect,
          });
          if (!concurrent) {
            return { outcome: "OFFERING_NOT_FOUND" } as const;
          }
          if (
            !concurrent.curriculumCourseId ||
            !isCourseOfferingStudentBatchDependencyConsistent(
              concurrent,
              input.departmentId,
            )
          ) {
            return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
          }
          if (concurrent.studentBatchId !== studentBatch.id) {
            if (concurrent.studentBatchId) {
              return { outcome: "BINDING_CONFLICT" } as const;
            }
            throw new Error("STUDENT_BATCH_BINDING_GUARD_MISSED");
          }

          const existing = await tx.courseOffering.findFirst({
            where: {
              id: offering.id,
              departmentId: input.departmentId,
              archivedAt: null,
              status: { not: CourseOfferingStatus.ARCHIVED },
            },
            include: courseOfferingInclude,
          });
          const safeExisting = existing
            ? sanitizeCourseOfferingRead(existing, input.departmentId)
            : null;

          return safeExisting
            ? ({ outcome: "ALREADY_BOUND", offering: safeExisting } as const)
            : ({ outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const);
        }

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: ACADEMIC_AUDIT_EVENTS.OFFERING_STUDENT_BATCH_BOUND,
            targetType: "course_offering",
            targetId: offering.id,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            contextJson: {
              courseOfferingId: offering.id,
              studentBatchId: studentBatch.id,
              courseId: offering.courseId,
              curriculumCourseId: offering.curriculumCourseId,
              curriculumVersionId:
                offering.curriculumCourse!.curriculumVersionId,
              academicProgramId: courseAcademicProgramId,
              courseAcademicProgramId,
              curriculumAcademicProgramId,
              studentBatchAcademicProgramId: studentBatch.academicProgramId,
              previousBindingValue: null,
              newBindingValue: studentBatch.id,
            },
          },
        });

        const bound = await tx.courseOffering.findFirst({
          where: {
            id: offering.id,
            departmentId: input.departmentId,
            archivedAt: null,
            status: { not: CourseOfferingStatus.ARCHIVED },
          },
          include: courseOfferingInclude,
        });
        const safeBound = bound
          ? sanitizeCourseOfferingRead(bound, input.departmentId)
          : null;
        if (!safeBound) {
          throw new Error("BOUND_COURSE_OFFERING_NOT_FOUND");
        }

        return { outcome: "BOUND", offering: safeBound } as const;
      });
    } catch (error) {
      if (isCourseOfferingBoundBatchedIdentityConflict(error)) {
        return { outcome: "BINDING_CONFLICT" } as const;
      }
      throw error;
    }
  }

  async findSyllabusVersions(filters: SyllabusVersionListFilters) {
    const records = await this.prisma.syllabusVersion.findMany({
      where: {
        departmentId: filters.departmentId,
        curriculumCourseId: filters.curriculumCourseId,
        status: filters.status,
      },
      select: syllabusVersionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return records.flatMap((record) => {
      const safe = sanitizeSyllabusVersion(record, filters.departmentId);
      return safe ? [safe] : [];
    });
  }

  async findSyllabusVersionById(departmentId: string, id: string) {
    const record = await this.prisma.syllabusVersion.findFirst({
      where: { id, departmentId },
      select: syllabusVersionSelect,
    });

    return record ? sanitizeSyllabusVersion(record, departmentId) : null;
  }

  async createSyllabusVersion(input: CreateSyllabusVersionInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const curriculumCourse = await tx.curriculumCourse.findFirst({
          where: {
            id: input.curriculumCourseId,
            departmentId: input.departmentId,
          },
          select: syllabusVersionSelect.curriculumCourse.select,
        });

        if (!curriculumCourse) {
          return { outcome: "CURRICULUM_COURSE_NOT_FOUND" } as const;
        }
        if (
          !isSyllabusCurriculumCourseConsistent(
            curriculumCourse,
            input.departmentId,
          )
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        const created = await tx.syllabusVersion.create({
          data: {
            departmentId: input.departmentId,
            curriculumCourseId: input.curriculumCourseId,
            code: input.code,
            versionNumber: input.versionNumber,
            status: AcademicVersionStatus.DRAFT,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
            approvedAt: null,
            archivedAt: null,
          },
          select: syllabusVersionSelect,
        });

        const safeCreated = sanitizeSyllabusVersion(
          created,
          input.departmentId,
        );
        if (!safeCreated) {
          throw new Error("CREATED_SYLLABUS_VERSION_NOT_FOUND");
        }

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_CREATED,
            targetType: "syllabus_version",
            targetId: created.id,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            contextJson: {
              syllabusVersionId: created.id,
              curriculumCourseId: input.curriculumCourseId,
              code: input.code,
              versionNumber: input.versionNumber,
              status: AcademicVersionStatus.DRAFT,
            },
          },
        });

        return { outcome: "CREATED", syllabusVersion: safeCreated } as const;
      });
    } catch (error) {
      const outcome = syllabusVersionUniqueConflict(error);
      if (outcome) return { outcome } as const;
      throw error;
    }
  }

  async transitionSyllabusVersion(input: TransitionSyllabusVersionInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const transition = SYLLABUS_VERSION_TRANSITIONS[input.action];
        const findScoped = () =>
          tx.syllabusVersion.findFirst({
            where: {
              id: input.syllabusVersionId,
              departmentId: input.departmentId,
            },
            select: syllabusVersionSelect,
          });

        const existing = await findScoped();
        if (!existing) {
          return { outcome: "SYLLABUS_VERSION_NOT_FOUND" } as const;
        }

        const safeExisting = sanitizeSyllabusVersion(
          existing,
          input.departmentId,
        );
        if (!safeExisting) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        if (!isSyllabusVersionLifecycleStateConsistent(existing)) {
          return { outcome: "INVALID_TRANSITION" } as const;
        }

        if (existing.status === transition.targetStatus) {
          return {
            outcome: "ALREADY_TARGET",
            syllabusVersion: safeExisting,
          } as const;
        }

        if (existing.status !== transition.expectedStatus) {
          return { outcome: "INVALID_TRANSITION" } as const;
        }

        const updated = await tx.syllabusVersion.updateMany({
          where: {
            id: input.syllabusVersionId,
            departmentId: input.departmentId,
            curriculumCourseId: existing.curriculumCourseId,
            status: transition.expectedStatus,
            ...(input.action === "APPROVE"
              ? { approvedAt: null }
              : { approvedAt: { not: null } }),
            archivedAt: null,
            curriculumCourse: {
              is: {
                id: existing.curriculumCourseId,
                departmentId: input.departmentId,
              },
            },
          },
          data: {
            status: transition.targetStatus,
            ...(input.action === "APPROVE"
              ? { approvedAt: input.transitionAt }
              : {}),
            ...(input.action === "ARCHIVE"
              ? { archivedAt: input.transitionAt }
              : {}),
          },
        });

        if (updated.count === 0) {
          const concurrent = await findScoped();
          if (!concurrent) {
            return { outcome: "SYLLABUS_VERSION_NOT_FOUND" } as const;
          }

          const safeConcurrent = sanitizeSyllabusVersion(
            concurrent,
            input.departmentId,
          );
          if (!safeConcurrent) {
            return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
          }

          if (!isSyllabusVersionLifecycleStateConsistent(concurrent)) {
            return { outcome: "INVALID_TRANSITION" } as const;
          }

          return concurrent.status === transition.targetStatus
            ? ({
                outcome: "ALREADY_TARGET",
                syllabusVersion: safeConcurrent,
              } as const)
            : ({ outcome: "INVALID_TRANSITION" } as const);
        }

        const transitioned = await findScoped();
        if (!transitioned) {
          throw new Error("TRANSITIONED_SYLLABUS_VERSION_NOT_FOUND");
        }
        const safeTransitioned = sanitizeSyllabusVersion(
          transitioned,
          input.departmentId,
        );
        if (!safeTransitioned) {
          throw new Error("TRANSITIONED_SYLLABUS_VERSION_NOT_FOUND");
        }
        if (
          transitioned.status !== transition.targetStatus ||
          !isSyllabusVersionLifecycleStateConsistent(transitioned)
        ) {
          throw new InvalidSyllabusVersionLifecycleStateError();
        }

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: transition.auditAction,
            targetType: "syllabus_version",
            targetId: input.syllabusVersionId,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            occurredAt: input.transitionAt,
            contextJson: {
              syllabusVersionId: input.syllabusVersionId,
              curriculumCourseId: existing.curriculumCourseId,
              code: existing.code,
              versionNumber: existing.versionNumber,
              previousStatus: transition.expectedStatus,
              newStatus: transition.targetStatus,
              reason: input.reason,
              actorUserId: input.actorUserId,
              departmentId: input.departmentId,
              transitionTimestamp: input.transitionAt.toISOString(),
            },
          },
        });

        return {
          outcome: "TRANSITIONED",
          syllabusVersion: safeTransitioned,
        } as const;
      });
    } catch (error) {
      if (error instanceof InvalidSyllabusVersionLifecycleStateError) {
        return { outcome: "INVALID_TRANSITION" } as const;
      }
      throw error;
    }
  }

  async transitionCurriculumVersion(input: TransitionCurriculumVersionInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const transition = CURRICULUM_VERSION_TRANSITIONS[input.action];
        const findScoped = () =>
          tx.curriculumVersion.findFirst({
            where: {
              id: input.curriculumVersionId,
              departmentId: input.departmentId,
            },
            select: curriculumVersionLifecycleSelect,
          });

        const existing = await findScoped();
        if (!existing) {
          return { outcome: "CURRICULUM_VERSION_NOT_FOUND" } as const;
        }

        const safeExisting = sanitizeCurriculumVersionLifecycleRead(
          existing,
          input.departmentId,
        );
        if (!safeExisting) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        if (!isCurriculumVersionLifecycleStateConsistent(existing)) {
          return { outcome: "INVALID_TRANSITION" } as const;
        }

        if (existing.status === transition.targetStatus) {
          return {
            outcome: "ALREADY_TARGET",
            curriculumVersion: safeExisting,
          } as const;
        }

        if (existing.status !== transition.expectedStatus) {
          return { outcome: "INVALID_TRANSITION" } as const;
        }

        const updated = await tx.curriculumVersion.updateMany({
          where: {
            id: input.curriculumVersionId,
            departmentId: input.departmentId,
            academicProgramId: existing.academicProgramId,
            status: transition.expectedStatus,
            ...(input.action === "APPROVE"
              ? { approvedAt: null }
              : { approvedAt: { not: null } }),
            archivedAt: null,
            academicProgram: {
              is: {
                id: existing.academicProgramId,
                departmentId: input.departmentId,
              },
            },
          },
          data: {
            status: transition.targetStatus,
            ...(input.action === "APPROVE"
              ? { approvedAt: input.transitionAt }
              : {}),
            ...(input.action === "ARCHIVE"
              ? { archivedAt: input.transitionAt }
              : {}),
          },
        });

        if (updated.count === 0) {
          const concurrent = await findScoped();
          if (!concurrent) {
            return { outcome: "CURRICULUM_VERSION_NOT_FOUND" } as const;
          }

          const safeConcurrent = sanitizeCurriculumVersionLifecycleRead(
            concurrent,
            input.departmentId,
          );
          if (!safeConcurrent) {
            return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
          }

          if (!isCurriculumVersionLifecycleStateConsistent(concurrent)) {
            return { outcome: "INVALID_TRANSITION" } as const;
          }

          return concurrent.status === transition.targetStatus
            ? ({
                outcome: "ALREADY_TARGET",
                curriculumVersion: safeConcurrent,
              } as const)
            : ({ outcome: "INVALID_TRANSITION" } as const);
        }

        const transitioned = await findScoped();
        if (!transitioned) {
          throw new Error("TRANSITIONED_CURRICULUM_VERSION_NOT_FOUND");
        }
        const safeTransitioned = sanitizeCurriculumVersionLifecycleRead(
          transitioned,
          input.departmentId,
        );
        if (!safeTransitioned) {
          throw new Error("TRANSITIONED_CURRICULUM_VERSION_NOT_FOUND");
        }
        if (
          transitioned.status !== transition.targetStatus ||
          !isCurriculumVersionLifecycleStateConsistent(transitioned)
        ) {
          throw new InvalidCurriculumVersionLifecycleStateError();
        }

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: transition.auditAction,
            targetType: "curriculum_version",
            targetId: input.curriculumVersionId,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            occurredAt: input.transitionAt,
            contextJson: {
              curriculumVersionId: input.curriculumVersionId,
              academicProgramId: existing.academicProgramId,
              previousStatus: transition.expectedStatus,
              newStatus: transition.targetStatus,
              reason: input.reason,
              ...(input.approvalReference
                ? { approvalReference: input.approvalReference }
                : {}),
              actorUserId: input.actorUserId,
              departmentId: input.departmentId,
              transitionTimestamp: input.transitionAt.toISOString(),
            },
          },
        });

        return {
          outcome: "TRANSITIONED",
          curriculumVersion: safeTransitioned,
        } as const;
      });
    } catch (error) {
      if (error instanceof InvalidCurriculumVersionLifecycleStateError) {
        return { outcome: "INVALID_TRANSITION" } as const;
      }
      throw error;
    }
  }

  async createStudentCurriculumAssignment(
    input: CreateStudentCurriculumAssignmentInput,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.studentCurriculumAssignment.findUnique({
          where: {
            departmentId_studentUserId_academicProgramId: {
              departmentId: input.departmentId,
              studentUserId: input.studentUserId,
              academicProgramId: input.academicProgramId,
            },
          },
          select: studentCurriculumAssignmentSelect,
        });

        if (existing) {
          const safeExisting = sanitizeStudentCurriculumAssignment(
            existing,
            input.departmentId,
          );
          if (!safeExisting) {
            return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
          }
          return existing.curriculumVersionId === input.curriculumVersionId
            ? ({
                outcome: "ALREADY_ASSIGNED",
                assignment: safeExisting,
              } as const)
            : ({ outcome: "ASSIGNMENT_CONFLICT" } as const);
        }

        const now = new Date();
        const student = await tx.user.findFirst({
          where: {
            id: input.studentUserId,
            departmentId: input.departmentId,
            status: "ACTIVE",
            archivedAt: null,
            deletedAt: null,
            department: {
              id: input.departmentId,
              status: "ACTIVE",
              archivedAt: null,
              deletedAt: null,
            },
            userRoles: {
              some: {
                departmentId: input.departmentId,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                role: {
                  code: "student",
                  departmentId: input.departmentId,
                  archivedAt: null,
                },
              },
            },
          },
          select: { id: true },
        });

        if (!student) {
          return { outcome: "STUDENT_NOT_FOUND" } as const;
        }

        const academicProgram = await tx.academicProgram.findFirst({
          where: {
            id: input.academicProgramId,
            departmentId: input.departmentId,
            status: AcademicProgramStatus.ACTIVE,
            archivedAt: null,
          },
          select: { id: true, departmentId: true },
        });

        if (!academicProgram) {
          return { outcome: "ACADEMIC_PROGRAM_NOT_FOUND" } as const;
        }

        const curriculumVersion = await tx.curriculumVersion.findFirst({
          where: {
            id: input.curriculumVersionId,
            departmentId: input.departmentId,
            academicProgramId: input.academicProgramId,
          },
          select: {
            id: true,
            departmentId: true,
            academicProgramId: true,
            status: true,
            archivedAt: true,
            academicProgram: {
              select: { id: true, departmentId: true },
            },
          },
        });

        if (!curriculumVersion) {
          return { outcome: "CURRICULUM_VERSION_NOT_FOUND" } as const;
        }

        if (
          curriculumVersion.departmentId !== input.departmentId ||
          curriculumVersion.academicProgramId !== input.academicProgramId ||
          curriculumVersion.academicProgram.id !== input.academicProgramId ||
          curriculumVersion.academicProgram.departmentId !== input.departmentId
        ) {
          return { outcome: "DEPENDENCY_SCOPE_MISMATCH" } as const;
        }

        if (
          curriculumVersion.archivedAt ||
          !ASSIGNABLE_STUDENT_CURRICULUM_STATUSES.includes(
            curriculumVersion.status,
          )
        ) {
          return { outcome: "INACTIVE_CURRICULUM_VERSION" } as const;
        }

        const created = await tx.studentCurriculumAssignment.create({
          data: {
            departmentId: input.departmentId,
            studentUserId: input.studentUserId,
            academicProgramId: input.academicProgramId,
            curriculumVersionId: input.curriculumVersionId,
            assignedByUserId: input.actorUserId,
          },
          select: studentCurriculumAssignmentSelect,
        });

        await tx.auditLog.create({
          data: {
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            actorType: "USER",
            departmentId: input.departmentId,
            action: ACADEMIC_AUDIT_EVENTS.STUDENT_CURRICULUM_ASSIGNED,
            targetType: "student_curriculum_assignment",
            targetId: created.id,
            outcome: "SUCCESS",
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            contextJson: {
              studentCurriculumAssignmentId: created.id,
              studentUserId: input.studentUserId,
              academicProgramId: input.academicProgramId,
              curriculumVersionId: input.curriculumVersionId,
            },
          },
        });

        const safeCreated = sanitizeStudentCurriculumAssignment(
          created,
          input.departmentId,
        );
        if (!safeCreated) {
          throw new Error("CREATED_STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND");
        }

        return { outcome: "CREATED", assignment: safeCreated } as const;
      });
    } catch (error) {
      if (!isStudentCurriculumAssignmentUniqueConflict(error)) {
        throw error;
      }

      const concurrent =
        await this.prisma.studentCurriculumAssignment.findUnique({
          where: {
            departmentId_studentUserId_academicProgramId: {
              departmentId: input.departmentId,
              studentUserId: input.studentUserId,
              academicProgramId: input.academicProgramId,
            },
          },
          select: studentCurriculumAssignmentSelect,
        });
      if (!concurrent) {
        throw error;
      }

      const safeConcurrent = sanitizeStudentCurriculumAssignment(
        concurrent,
        input.departmentId,
      );
      if (!safeConcurrent) {
        throw error;
      }

      return concurrent.curriculumVersionId === input.curriculumVersionId
        ? ({ outcome: "ALREADY_ASSIGNED", assignment: safeConcurrent } as const)
        : ({ outcome: "ASSIGNMENT_CONFLICT" } as const);
    }
  }

  findTeacherAssignments(filters: TeacherAssignmentListFilters) {
    return this.prisma.teacherCourseAssignment.findMany({
      where: {
        departmentId: filters.departmentId,
        courseOfferingId: filters.courseOfferingId,
        archivedAt: null,
      },
      include: this.teacherAssignmentInclude(),
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  createOrReactivateTeacherAssignment(input: CreateTeacherAssignmentInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.teacherCourseAssignment.findUnique({
        where: {
          courseOfferingId_teacherUserId_roleCode: {
            courseOfferingId: input.courseOfferingId,
            teacherUserId: input.teacherUserId,
            roleCode: input.roleCode,
          },
        },
        select: {
          id: true,
          departmentId: true,
          archivedAt: true,
        },
      });

      if (existing?.archivedAt) {
        return null;
      }

      if (existing) {
        const now = new Date();
        const result = await tx.teacherCourseAssignment.updateMany({
          where: {
            id: existing.id,
            departmentId: input.departmentId,
            archivedAt: null,
          },
          data: {
            status: "ACTIVE",
            assignedAt: now,
            unassignedAt: null,
          },
        });

        if (result.count === 0) {
          return null;
        }
      } else {
        await tx.teacherCourseAssignment.create({
          data: {
            departmentId: input.departmentId,
            courseOfferingId: input.courseOfferingId,
            teacherUserId: input.teacherUserId,
            roleCode: input.roleCode,
            status: "ACTIVE",
            unassignedAt: null,
          },
        });
      }

      return tx.teacherCourseAssignment.findFirst({
        where: {
          departmentId: input.departmentId,
          courseOfferingId: input.courseOfferingId,
          teacherUserId: input.teacherUserId,
          roleCode: input.roleCode,
          archivedAt: null,
        },
        include: this.teacherAssignmentInclude(),
      });
    });
  }

  findTeacherAssignmentById(departmentId: string, id: string) {
    return this.prisma.teacherCourseAssignment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
      include: this.teacherAssignmentInclude(),
    });
  }

  unassignTeacherAssignment(
    departmentId: string,
    id: string,
    unassignedAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.teacherCourseAssignment.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: {
          status: "INACTIVE",
          unassignedAt,
        },
      });

      if (result.count === 0) {
        return null;
      }

      return tx.teacherCourseAssignment.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: this.teacherAssignmentInclude(),
      });
    });
  }

  findEnrollments(filters: EnrollmentListFilters) {
    return this.prisma.enrollment.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicTermId: filters.academicTermId,
        courseOfferingId: filters.courseOfferingId,
        studentUserId: filters.studentUserId,
        status: filters.status,
        eligibilityStatus: filters.eligibilityStatus,
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true,
          },
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  findEnrollmentById(departmentId: string, id: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true,
          },
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });
  }

  findEnrollmentByIdForStudent(
    departmentId: string,
    id: string,
    studentUserId: string,
  ) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        studentUserId,
        archivedAt: null,
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true,
          },
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });
  }

  async createEnrollment(input: CreateEnrollmentInput) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const offering = await tx.courseOffering.findFirst({
            where: {
              id: input.courseOfferingId,
              departmentId: input.departmentId,
              archivedAt: null,
            },
            select: {
              id: true,
              departmentId: true,
              academicTermId: true,
              courseId: true,
              curriculumCourseId: true,
              course: {
                select: { id: true, departmentId: true },
              },
              academicTerm: {
                select: { departmentId: true, archivedAt: true },
              },
              curriculumCourse: {
                select: {
                  id: true,
                  departmentId: true,
                  courseId: true,
                  curriculumVersionId: true,
                  course: {
                    select: { id: true, departmentId: true },
                  },
                  curriculumVersion: {
                    select: {
                      id: true,
                      departmentId: true,
                      academicProgramId: true,
                      academicProgram: {
                        select: { id: true, departmentId: true },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!offering) return { outcome: "OFFERING_NOT_FOUND" } as const;
          if (offering.academicTermId !== input.academicTermId)
            return { outcome: "TERM_MISMATCH" } as const;
          if (
            offering.academicTerm.departmentId !== input.departmentId ||
            offering.academicTerm.archivedAt !== null
          )
            return { outcome: "CURRICULUM_DEPENDENCY_MISMATCH" } as const;
          if (!offering.curriculumCourseId || !offering.curriculumCourse)
            return { outcome: "OFFERING_CURRICULUM_NOT_BOUND" } as const;

          const curriculumCourse = offering.curriculumCourse;
          const curriculumVersion = curriculumCourse.curriculumVersion;
          if (
            offering.departmentId !== input.departmentId ||
            offering.course.id !== offering.courseId ||
            offering.course.departmentId !== input.departmentId ||
            curriculumCourse.id !== offering.curriculumCourseId ||
            curriculumCourse.departmentId !== input.departmentId ||
            curriculumCourse.courseId !== offering.courseId ||
            curriculumCourse.course.id !== curriculumCourse.courseId ||
            curriculumCourse.course.departmentId !== input.departmentId ||
            curriculumVersion.id !== curriculumCourse.curriculumVersionId ||
            curriculumVersion.departmentId !== input.departmentId ||
            curriculumVersion.academicProgram.id !==
              curriculumVersion.academicProgramId ||
            curriculumVersion.academicProgram.departmentId !==
              input.departmentId
          )
            return { outcome: "CURRICULUM_DEPENDENCY_MISMATCH" } as const;

          const student = await tx.user.findFirst({
            where: {
              id: input.studentUserId,
              departmentId: input.departmentId,
              status: UserStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
              department: {
                id: input.departmentId,
                status: "ACTIVE",
                archivedAt: null,
                deletedAt: null,
              },
              userRoles: {
                some: {
                  departmentId: input.departmentId,
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  role: {
                    code: "student",
                    departmentId: input.departmentId,
                    archivedAt: null,
                  },
                },
              },
            },
            select: { id: true, departmentId: true },
          });
          if (!student) return { outcome: "STUDENT_NOT_FOUND" } as const;

          const assignment = await tx.studentCurriculumAssignment.findFirst({
            where: {
              departmentId: input.departmentId,
              studentUserId: student.id,
              academicProgramId: curriculumVersion.academicProgram.id,
            },
            select: {
              id: true,
              departmentId: true,
              studentUserId: true,
              academicProgramId: true,
              curriculumVersionId: true,
            },
          });
          if (!assignment)
            return {
              outcome: "STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND",
            } as const;
          if (
            assignment.departmentId !== input.departmentId ||
            assignment.studentUserId !== student.id ||
            assignment.academicProgramId !==
              curriculumVersion.academicProgram.id
          )
            return { outcome: "CURRICULUM_DEPENDENCY_MISMATCH" } as const;
          if (
            assignment.curriculumVersionId !==
            curriculumCourse.curriculumVersionId
          )
            return {
              outcome: "STUDENT_CURRICULUM_VERSION_MISMATCH",
            } as const;

          const existing = await tx.enrollment.findUnique({
            where: {
              courseOfferingId_studentUserId: {
                courseOfferingId: offering.id,
                studentUserId: student.id,
              },
            },
            select: { id: true },
          });
          if (existing) return { outcome: "DUPLICATE_ENROLLMENT" } as const;

          const enrollment = await tx.enrollment.create({
            data: {
              departmentId: input.departmentId,
              academicTermId: input.academicTermId,
              courseOfferingId: offering.id,
              studentUserId: student.id,
              studentCurriculumAssignmentId: assignment.id,
              curriculumCourseId: curriculumCourse.id,
              approvedByUserId: input.approvedByUserId,
              sourceType: input.sourceType,
              status: input.status,
              eligibilityStatus: input.eligibilityStatus,
              eligibilitySnapshotJson: input.eligibilitySnapshotJson,
              enrolledAt: input.status === "APPROVED" ? new Date() : null,
            },
            include: {
              academicTerm: true,
              courseOffering: { include: { course: true } },
              studentUser: {
                select: { id: true, displayName: true, email: true },
              },
              approvedByUser: {
                select: { id: true, displayName: true, email: true },
              },
            },
          });
          return { outcome: "CREATED", enrollment } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return { outcome: "DUPLICATE_ENROLLMENT" } as const;
      throw error;
    }
  }

  updateEnrollment(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { approvedByUserId, ...rest } = input;

      const result = await tx.enrollment.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        data: {
          ...rest,
          approvedByUserId,
        },
      });

      if (result.count === 0) {
        return null;
      }

      return tx.enrollment.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: {
          academicTerm: true,
          courseOffering: {
            include: {
              course: true,
            },
          },
          studentUser: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          approvedByUser: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      });
    });
  }

  private teacherAssignmentInclude() {
    return {
      teacherUser: {
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
        },
      },
    };
  }

  private isRetryableSerializableConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    if (error.code === "P2034") return true;
    return error.code === "P2010" && error.meta?.code === "40001";
  }

  private isActiveCourseOutlineUniqueConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    if (error.code !== "P2002") return false;
    const target = error.meta?.target;
    // Named-index form: Prisma reports the constraint name as a string.
    if (typeof target === "string") {
      return target === "course_outline_version_one_active_per_offering_uq";
    }
    // Column-array form: Prisma reports the affected columns as a string[].
    // Require exactly the two columns that compose the partial unique index,
    // with no additional columns, to avoid misclassifying unrelated P2002
    // violations that coincidentally include these columns alongside others.
    if (Array.isArray(target)) {
      const EXPECTED = ["course_offering_id", "department_id"];
      const sorted = [...target].sort();
      return (
        sorted.length === EXPECTED.length &&
        sorted.every((col, i) => col === EXPECTED[i])
      );
    }
    return false;
  }
}
