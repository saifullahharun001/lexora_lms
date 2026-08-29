export const SUMMATIVE_EXAMINATION_AUDIT_EVENTS = {
  EXAMINATION_CREATED: "summative-examination.examination.created",
  EXAMINATION_COURSE_CREATED: "summative-examination.examination-course.created",
  COMMITTEE_CREATED: "summative-examination.committee.created",
  INTERNAL_COMMITTEE_ASSIGNMENT_CREATED:
    "summative-examination.internal-committee-assignment.created",
  EXTERNAL_COMMITTEE_MEMBER_APPOINTED:
    "summative-examination.external-committee-member.appointed",
  COMMITTEE_ASSIGNMENT_EXPIRED_AUTO_RETIRED:
    "summative-examination.committee-assignment.expired-auto-retired",
  COMMITTEE_ASSIGNMENT_UNASSIGNED: "summative-examination.committee-assignment.unassigned",
  COMMITTEE_ASSIGNMENT_EXPIRY_UPDATED:
    "summative-examination.committee-assignment.expiry-updated",
  COMMITTEE_ASSIGNMENT_REACTIVATED:
    "summative-examination.committee-assignment.reactivated",
  COMMITTEE_ASSIGNMENT_ARCHIVED: "summative-examination.committee-assignment.archived",
} as const;
