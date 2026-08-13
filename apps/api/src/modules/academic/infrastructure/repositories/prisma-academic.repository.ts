import { Injectable } from "@nestjs/common";
import {
  AcademicProgramStatus,
  AcademicVersionStatus,
  CourseOfferingStatus,
  CourseStatus,
  EnrollmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";

import type {
  AcademicRepositoryPort,
  AcademicTermListFilters,
  AcademicYearListFilters,
  BindCourseOfferingCurriculumInput,
  CourseListFilters,
  CourseOfferingListFilters,
  CreateAcademicTermInput,
  CreateAcademicYearInput,
  CreateCourseInput,
  CreateCourseOfferingInput,
  CreateEnrollmentInput,
  CreateProgramInput,
  CreateStudentCurriculumAssignmentInput,
  CreateTeacherAssignmentInput,
  EnrollmentListFilters,
  ProgramListFilters,
  StudentCourseOfferingListFilters,
  TeacherAssignmentListFilters,
  TransitionCurriculumVersionInput,
  UpdateAcademicTermInput,
  UpdateAcademicYearInput,
  UpdateCourseInput,
  UpdateCourseOfferingInput,
  UpdateEnrollmentInput,
  UpdateProgramInput,
} from "../../application/ports/academic.repository.port";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";

const courseOfferingInclude = {
  course: true,
  academicTerm: true,
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

const ASSIGNABLE_STUDENT_CURRICULUM_STATUSES: readonly AcademicVersionStatus[] =
  [AcademicVersionStatus.APPROVED, AcademicVersionStatus.ACTIVE];

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

interface CourseOfferingReadRecord {
  id: string;
  departmentId: string;
  courseId: string;
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
  if (!curriculumCourse) {
    return offering;
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

  return {
    ...offering,
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

  updateCourse(departmentId: string, id: string, input: UpdateCourseInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.course.updateMany({
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

      return tx.course.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null,
        },
        include: {
          academicProgram: true,
        },
      });
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
}
