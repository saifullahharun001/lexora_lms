import { Prisma } from "@prisma/client";

export const FORMATIVE_RULE = Object.freeze({
  versionCode: "FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1",
  maximum: "30.00",
});

export const FORMATIVE_METHODS = [
  "CLASS_TEST", "TUTORIAL", "QUIZ", "ASSIGNMENT", "PRESENTATION", "CASE_STUDY",
  "PROBLEM_QUESTION", "LEGAL_WRITING", "ORAL_EXERCISE", "REPORT", "SPOT_TEST",
  "SIMULATED_EXERCISE", "GROUP_WORK", "MOOT_COURT", "OTHER",
] as const;

export function formativeDecimal(value: string | Prisma.Decimal) {
  try {
    const result = new Prisma.Decimal(value);
    if (!result.isFinite() || result.lt(0) || result.decimalPlaces() > 2 || result.gt("9999.99")) {
      throw new RangeError("Invalid formative decimal");
    }
    return result;
  } catch {
    throw new RangeError("Invalid formative decimal");
  }
}

export function weightedMark(raw: string | Prisma.Decimal, maximum: string | Prisma.Decimal, weight: string | Prisma.Decimal) {
  const mark = formativeDecimal(raw);
  const max = formativeDecimal(maximum);
  const assigned = formativeDecimal(weight);
  if (max.lte(0) || assigned.lte(0) || assigned.gt(FORMATIVE_RULE.maximum) || mark.gt(max)) {
    throw new RangeError("Invalid formative mark bounds");
  }
  return mark.div(max).mul(assigned).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface SubmissionSource {
  activityId: string;
  status: string;
  rawMaximum: Prisma.Decimal;
  assignedWeight: Prisma.Decimal;
  mark: null | {
    rawMark: Prisma.Decimal | null;
    weightedMark: Prisma.Decimal | null;
    feedback: string | null;
    feedbackCompleted: boolean;
    integrityStatus: string;
  };
}

export function deriveTeacherSubmission(sources: SubmissionSource[]) {
  let total = new Prisma.Decimal(0);
  let weights = new Prisma.Decimal(0);
  if (new Set(sources.map((source) => source.activityId)).size !== sources.length) {
    throw new RangeError("Duplicate activity source");
  }
  for (const source of sources) {
    const mark = source.mark;
    if (source.status !== "MARKING" || !mark || mark.rawMark === null) {
      throw new RangeError("All activities must be in marking with complete marks");
    }
    if (!mark.feedbackCompleted || !mark.feedback?.trim()) {
      throw new RangeError("Completed written feedback is required");
    }
    if (mark.integrityStatus !== "CLEAR") throw new RangeError("Unresolved integrity case");
    const derived = weightedMark(mark.rawMark, source.rawMaximum, source.assignedWeight);
    if (!mark.weightedMark?.eq(derived)) throw new RangeError("Inconsistent mark evidence");
    weights = weights.add(source.assignedWeight);
    total = total.add(derived);
  }
  if (!weights.eq(FORMATIVE_RULE.maximum)) throw new RangeError("Activity weights must total exactly 30");
  if (total.gt(FORMATIVE_RULE.maximum)) throw new RangeError("Invalid activity total");
  return { total, weights, ruleVersionCode: FORMATIVE_RULE.versionCode };
}
