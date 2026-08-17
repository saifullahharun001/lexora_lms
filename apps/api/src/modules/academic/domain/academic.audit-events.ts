export const ACADEMIC_AUDIT_EVENTS = {
  PROGRAM_CREATED: "course-management.program.created",
  PROGRAM_UPDATED: "course-management.program.updated",
  ACADEMIC_YEAR_CREATED: "course-management.academic-year.created",
  ACADEMIC_YEAR_UPDATED: "course-management.academic-year.updated",
  ACADEMIC_TERM_CREATED: "course-management.academic-term.created",
  ACADEMIC_TERM_UPDATED: "course-management.academic-term.updated",
  COURSE_CREATED: "course-management.course.created",
  COURSE_UPDATED: "course-management.course.updated",
  OFFERING_CREATED: "course-management.offering.created",
  OFFERING_UPDATED: "course-management.offering.updated",
  OFFERING_CURRICULUM_BOUND: "course-management.offering.curriculum-bound",
  CURRICULUM_VERSION_APPROVED:
    "course-management.curriculum-version.approved",
  CURRICULUM_VERSION_ACTIVATED:
    "course-management.curriculum-version.activated",
  CURRICULUM_VERSION_RETIRED:
    "course-management.curriculum-version.retired",
  CURRICULUM_VERSION_ARCHIVED:
    "course-management.curriculum-version.archived",
  SYLLABUS_VERSION_CREATED: "course-management.syllabus-version.created",
  SYLLABUS_VERSION_APPROVED: "course-management.syllabus-version.approved",
  SYLLABUS_VERSION_ACTIVATED: "course-management.syllabus-version.activated",
  SYLLABUS_VERSION_RETIRED: "course-management.syllabus-version.retired",
  SYLLABUS_VERSION_ARCHIVED: "course-management.syllabus-version.archived",
  STUDENT_CURRICULUM_ASSIGNED:
    "course-management.student-curriculum-assignment.created",
  TEACHER_ASSIGNMENT_ASSIGNED:
    "course-management.teacher-assignment.assigned",
  TEACHER_ASSIGNMENT_UNASSIGNED:
    "course-management.teacher-assignment.unassigned",
  ENROLLMENT_CREATED: "enrollment.record.created",
  ENROLLMENT_UPDATED: "enrollment.record.updated",
} as const;
