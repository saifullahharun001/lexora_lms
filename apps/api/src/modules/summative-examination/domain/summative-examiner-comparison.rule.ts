import {
  Prisma,
  SummativeExaminerComparisonDecision,
} from "@prisma/client";

export const SUMMATIVE_EXAMINER_COMPARISON_RULE = Object.freeze({
  versionCode: "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
  thresholdPercentage: "15.00",
  varianceScale: 6,
});

export interface SummativeExaminerComparisonCalculation {
  firstTotal: Prisma.Decimal;
  secondTotal: Prisma.Decimal;
  summativeFullMark: Prisma.Decimal;
  absoluteDifference: Prisma.Decimal;
  variancePercentage: Prisma.Decimal;
  thresholdPercentage: Prisma.Decimal;
  ruleVersionCode: string;
  decision: SummativeExaminerComparisonDecision;
}

/**
 * Calculates immutable comparison evidence with Decimal arithmetic. The decision
 * uses exact cross multiplication and never the rounded persisted percentage.
 */
export function calculateSummativeExaminerComparison(
  firstTotalInput: Prisma.Decimal.Value,
  secondTotalInput: Prisma.Decimal.Value,
  fullMarkInput: Prisma.Decimal.Value,
): SummativeExaminerComparisonCalculation {
  const firstTotal = new Prisma.Decimal(firstTotalInput);
  const secondTotal = new Prisma.Decimal(secondTotalInput);
  const summativeFullMark = new Prisma.Decimal(fullMarkInput);
  const thresholdPercentage = new Prisma.Decimal(
    SUMMATIVE_EXAMINER_COMPARISON_RULE.thresholdPercentage,
  );

  if (
    !firstTotal.isFinite() ||
    !secondTotal.isFinite() ||
    !summativeFullMark.isFinite() ||
    firstTotal.lt(0) ||
    secondTotal.lt(0) ||
    summativeFullMark.lte(0) ||
    firstTotal.gt(summativeFullMark) ||
    secondTotal.gt(summativeFullMark)
  ) {
    throw new RangeError("Invalid Summative comparison source values");
  }

  const absoluteDifference = firstTotal.sub(secondTotal).abs();
  const variancePercentage = absoluteDifference
    .mul(100)
    .div(summativeFullMark)
    .toDecimalPlaces(
      SUMMATIVE_EXAMINER_COMPARISON_RULE.varianceScale,
      Prisma.Decimal.ROUND_HALF_UP,
    );
  const decision = absoluteDifference.mul(100).gte(
    summativeFullMark.mul(thresholdPercentage),
  )
    ? SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED
    : SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED;

  return {
    firstTotal,
    secondTotal,
    summativeFullMark,
    absoluteDifference,
    variancePercentage,
    thresholdPercentage,
    ruleVersionCode: SUMMATIVE_EXAMINER_COMPARISON_RULE.versionCode,
    decision,
  };
}
