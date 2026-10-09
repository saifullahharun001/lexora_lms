import { ConflictException } from "@nestjs/common";
import type { CourseCompositionSources } from "./course-result-composition.service";

// Scalar identities/marks live in constrained aggregate columns. JSON retains only
// additional immutable evidence; source IDs identify versions of immutable rows.
export const COMPOSITION_SOURCE_KEYS = [
  "departmentId", "examinationId", "examinationCourseId", "courseOfferingId", "enrollmentId", "studentUserId",
  "academicProgramId", "academicSessionId", "academicTermId", "studentBatchId", "curriculumAssignmentId",
  "curriculumVersionId", "curriculumCourseId", "syllabusVersionId", "assessmentTemplateId", "candidateListId",
  "candidateListVersion", "registrationId", "registrationVersion", "candidateCourseId", "candidateCategory",
  "formativeResultId", "summativeCandidateId", "chairmanApprovalId", "calculatedMarkId", "calculatedMarkVersion",
  "formativeRule", "summativeRule", "candidateRule", "formativeMark", "formativeFullMark", "summativeMark",
  "summativeFullMark", "provenanceJson",
] as const;
export const COMPOSITION_PROVENANCE_KEYS = [
  "contractVersion", "activitiesResultId", "attendanceVersionId", "comprehensiveResultId", "attendanceRevision",
  "comprehensiveVersion", "approvalVersion", "member1ReviewId", "member2ReviewId", "approvedAt", "lockedAt",
  "certifiedAt", "certificationAssignmentId",
] as const;
const auditKeys = [
  "departmentId", "examinationId", "examinationCourseId", "courseOfferingId", "enrollmentId", "candidateListId",
  "candidateListVersion", "registrationId", "registrationVersion", "candidateCourseId", "formativeResultId",
  "summativeCandidateId", "chairmanApprovalId", "calculatedMarkId", "calculatedMarkVersion", "formativeRule",
  "summativeRule", "candidateRule", "formativeMark", "formativeFullMark", "summativeMark", "summativeFullMark",
] as const;

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function validateCompositionSources(value: unknown): asserts value is CourseCompositionSources {
  const fail = () => { throw new ConflictException("Invalid immutable composition source contract"); };
  if (!exactKeys(value, COMPOSITION_SOURCE_KEYS)) return fail();
  if (!exactKeys(value.provenanceJson, COMPOSITION_PROVENANCE_KEYS)) return fail();
  if (value.provenanceJson.contractVersion !== "COURSE_COMPOSITION_PROVENANCE_V1") return fail();
  for (const [key, item] of [...Object.entries(value), ...Object.entries(value.provenanceJson)]) {
    if (key === "provenanceJson") continue;
    if (["candidateListVersion", "registrationVersion", "calculatedMarkVersion", "attendanceRevision", "comprehensiveVersion", "approvalVersion"].includes(key)) {
      if (!Number.isSafeInteger(item) || (item as number) <= 0) return fail();
    } else if (typeof item !== "string" || item.length === 0) return fail();
  }
}

export function compositionAuditSources(sources: CourseCompositionSources) {
  return Object.fromEntries(auditKeys.map((key) => [key, sources[key]]));
}
