export const COURSE_OUTLINE_DRAFT_FIELD_NAMES = [
  "courseSummary",
  "deliveryPlan",
  "teachingStrategies",
  "assessmentStrategy",
  "evaluationPolicy",
  "makeUpProcedure",
] as const;

export type CourseOutlineDraftFieldName =
  (typeof COURSE_OUTLINE_DRAFT_FIELD_NAMES)[number];

export interface CourseOutlineDraftFields {
  courseSummary?: string | null;
  deliveryPlan?: string | null;
  teachingStrategies?: string | null;
  assessmentStrategy?: string | null;
  evaluationPolicy?: string | null;
  makeUpProcedure?: string | null;
}

export function selectCourseOutlineDraftFields(
  input: unknown,
): CourseOutlineDraftFields {
  if (typeof input !== "object" || input === null) return {};

  const source = input as Record<string, unknown>;
  const selected: CourseOutlineDraftFields = {};
  for (const field of COURSE_OUTLINE_DRAFT_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    if (value === null) {
      selected[field] = null;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      selected[field] = trimmed === "" ? null : trimmed;
    }
  }
  return selected;
}

export function hasCourseOutlineDraftFields(
  input: CourseOutlineDraftFields,
): boolean {
  return COURSE_OUTLINE_DRAFT_FIELD_NAMES.some((field) =>
    Object.prototype.hasOwnProperty.call(input, field),
  );
}
