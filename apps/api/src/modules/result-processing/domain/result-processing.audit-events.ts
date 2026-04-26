export const RESULT_PROCESSING_AUDIT_EVENTS = {
  GRADE_SCALE_CREATED: "result-processing.grade-scale.created",
  GRADE_SCALE_UPDATED: "result-processing.grade-scale.updated",
  RESULT_COMPUTED: "result-processing.result.computed",
  RESULT_VERIFIED: "result-processing.result.verified",
  RESULT_PUBLISHED: "result-processing.result.published",
  RESULT_LOCKED: "result-processing.result.locked",
  GPA_COMPUTED: "result-processing.gpa.computed",
  CGPA_COMPUTED: "result-processing.cgpa.computed",
  PUBLICATION_BATCH_CREATED: "result-processing.publication-batch.created",
  PUBLICATION_BATCH_PROCESSING: "result-processing.publication-batch.processing",
  PUBLICATION_BATCH_PUBLISHED: "result-processing.publication-batch.published",
  PUBLICATION_BATCH_FAILED: "result-processing.publication-batch.failed",
  AMENDMENT_REQUESTED: "result-processing.amendment.requested",
  AMENDMENT_APPROVED: "result-processing.amendment.approved",
  AMENDMENT_REJECTED: "result-processing.amendment.rejected",
  AMENDMENT_APPLIED: "result-processing.amendment.applied",
  REGRADE_PROPAGATED: "result-processing.regrade.propagated"
} as const;
