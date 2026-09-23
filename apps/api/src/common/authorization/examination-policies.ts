/** Exact coarse admission only. Every service also checks a live academic appointment. */
export const EXAMINATION_POLICIES = {
  APPOINT: "examination-authority.appointment.manage",
  CLASSIFY: "examination-candidate.classification.manage",
  READ: "comprehensive-examination.workspace.read",
  CONFIGURE: "comprehensive-examination.configuration.manage",
  MARK: "comprehensive-examination.mark.enter",
  REVIEW: "comprehensive-examination.chairman.review",
  FINALISE: "comprehensive-examination.chairman.finalise",
} as const;

export const EXAMINATION_PERMISSION_DEFINITIONS = Object.values(EXAMINATION_POLICIES).map((policy) => {
  const separator = policy.lastIndexOf(".");
  return { code: `${policy}_department`, resource: policy.slice(0, separator),
    action: policy.slice(separator + 1), scope: "department" as const };
});
