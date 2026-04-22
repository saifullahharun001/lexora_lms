export const COURSE_MANAGEMENT_AUDIT_EVENTS = {
  PROGRAM_CREATED: "course-management.program.created",
  PROGRAM_UPDATED: "course-management.program.updated",
  PROGRAM_ARCHIVED: "course-management.program.archived",
  TERM_CREATED: "course-management.term.created",
  TERM_STATE_CHANGED: "course-management.term.state-changed",
  COURSE_CREATED: "course-management.course.created",
  COURSE_UPDATED: "course-management.course.updated",
  COURSE_ARCHIVED: "course-management.course.archived",
  OFFERING_CREATED: "course-management.offering.created",
  OFFERING_UPDATED: "course-management.offering.updated",
  OFFERING_STATE_CHANGED: "course-management.offering.state-changed",
  TEACHER_ASSIGNMENT_ASSIGNED: "course-management.teacher-assignment.assigned",
  TEACHER_ASSIGNMENT_UNASSIGNED: "course-management.teacher-assignment.unassigned",
  ELIGIBILITY_RULE_CREATED: "course-management.eligibility-rule.created",
  ELIGIBILITY_RULE_UPDATED: "course-management.eligibility-rule.updated",
  ELIGIBILITY_RULE_BOUND: "course-management.eligibility-rule.bound"
} as const;

