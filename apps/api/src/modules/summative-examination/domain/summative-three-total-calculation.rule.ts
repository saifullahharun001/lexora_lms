import {
  Prisma,
  SummativeThreeTotalSelectedPair,
  SummativeThreeTotalSelectionReason,
} from "@prisma/client";

export const SUMMATIVE_THREE_TOTAL_CALCULATION_RULE = Object.freeze({
  versionCode: "SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1",
});

export interface SummativeThreeTotalCalculationResult {
  firstTotal: Prisma.Decimal;
  secondTotal: Prisma.Decimal;
  thirdTotal: Prisma.Decimal;
  summativeFullMark: Prisma.Decimal;
  firstSecondDistance: Prisma.Decimal;
  firstThirdDistance: Prisma.Decimal;
  secondThirdDistance: Prisma.Decimal;
  selectedPair: SummativeThreeTotalSelectedPair;
  selectionReason: SummativeThreeTotalSelectionReason;
  derivedSummativeValue: Prisma.Decimal;
  ruleVersionCode: string;
}

interface PairCandidate {
  identity: SummativeThreeTotalSelectedPair;
  left: Prisma.Decimal;
  right: Prisma.Decimal;
  distance: Prisma.Decimal;
}

function authoritativeDecimal(value: Prisma.Decimal.Value) {
  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite() || decimal.decimalPlaces() > 2) {
      throw new RangeError();
    }
    return decimal;
  } catch {
    throw new RangeError("Invalid Summative three-total source values");
  }
}

/**
 * Selects the nearest pair using exact Decimal values. Equal-distance pairs are
 * ordered by their higher member and then their lower member. FIRST_SECOND is
 * used only as a stable identity when all three values are equal.
 */
export function calculateSummativeThreeTotal(
  firstTotalInput: Prisma.Decimal.Value,
  secondTotalInput: Prisma.Decimal.Value,
  thirdTotalInput: Prisma.Decimal.Value,
  fullMarkInput: Prisma.Decimal.Value,
): SummativeThreeTotalCalculationResult {
  const firstTotal = authoritativeDecimal(firstTotalInput);
  const secondTotal = authoritativeDecimal(secondTotalInput);
  const thirdTotal = authoritativeDecimal(thirdTotalInput);
  const summativeFullMark = authoritativeDecimal(fullMarkInput);

  if (
    firstTotal.lt(0) ||
    secondTotal.lt(0) ||
    thirdTotal.lt(0) ||
    summativeFullMark.lte(0) ||
    firstTotal.gt(summativeFullMark) ||
    secondTotal.gt(summativeFullMark) ||
    thirdTotal.gt(summativeFullMark)
  ) {
    throw new RangeError("Invalid Summative three-total source values");
  }

  const pairs: PairCandidate[] = [
    {
      identity: SummativeThreeTotalSelectedPair.FIRST_SECOND,
      left: firstTotal,
      right: secondTotal,
      distance: firstTotal.sub(secondTotal).abs(),
    },
    {
      identity: SummativeThreeTotalSelectedPair.FIRST_THIRD,
      left: firstTotal,
      right: thirdTotal,
      distance: firstTotal.sub(thirdTotal).abs(),
    },
    {
      identity: SummativeThreeTotalSelectedPair.SECOND_THIRD,
      left: secondTotal,
      right: thirdTotal,
      distance: secondTotal.sub(thirdTotal).abs(),
    },
  ];

  const allEqual = firstTotal.eq(secondTotal) && secondTotal.eq(thirdTotal);
  let selected: PairCandidate;
  let selectionReason: SummativeThreeTotalSelectionReason;

  if (allEqual) {
    selected = pairs[0]!;
    selectionReason =
      SummativeThreeTotalSelectionReason.ALL_EQUAL_CANONICAL;
  } else {
    const minimumDistance = pairs.reduce(
      (minimum, pair) =>
        pair.distance.lt(minimum) ? pair.distance : minimum,
      pairs[0]!.distance,
    );
    const nearest = pairs.filter((pair) => pair.distance.eq(minimumDistance));
    selected = nearest.reduce((higherPair, pair) => {
      const higherPairHigh = Prisma.Decimal.max(
        higherPair.left,
        higherPair.right,
      );
      const pairHigh = Prisma.Decimal.max(pair.left, pair.right);
      if (pairHigh.gt(higherPairHigh)) return pair;
      if (pairHigh.lt(higherPairHigh)) return higherPair;

      const higherPairLow = Prisma.Decimal.min(
        higherPair.left,
        higherPair.right,
      );
      const pairLow = Prisma.Decimal.min(pair.left, pair.right);
      return pairLow.gt(higherPairLow) ? pair : higherPair;
    }, nearest[0]!);
    selectionReason =
      nearest.length === 1
        ? SummativeThreeTotalSelectionReason.UNIQUE_NEAREST
        : SummativeThreeTotalSelectionReason.EQUAL_DISTANCE_HIGHER_PAIR;
  }

  return {
    firstTotal,
    secondTotal,
    thirdTotal,
    summativeFullMark,
    firstSecondDistance: pairs[0]!.distance,
    firstThirdDistance: pairs[1]!.distance,
    secondThirdDistance: pairs[2]!.distance,
    selectedPair: selected.identity,
    selectionReason,
    derivedSummativeValue: selected.left.add(selected.right).div(2),
    ruleVersionCode: SUMMATIVE_THREE_TOTAL_CALCULATION_RULE.versionCode,
  };
}
