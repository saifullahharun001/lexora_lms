import assert from "node:assert/strict";
import test from "node:test";

import {
  SummativeThreeTotalSelectedPair as Pair,
  SummativeThreeTotalSelectionReason as Reason,
} from "@prisma/client";

import {
  calculateSummativeThreeTotal,
  SUMMATIVE_THREE_TOTAL_CALCULATION_RULE,
} from "./summative-three-total-calculation.rule";

function calculate(first: string, second: string, third: string, full = "100") {
  return calculateSummativeThreeTotal(first, second, third, full);
}

test("each pair can be the unique nearest pair", () => {
  assert.equal(calculate("40", "41", "60").selectedPair, Pair.FIRST_SECOND);
  assert.equal(calculate("40", "60", "41").selectedPair, Pair.FIRST_THIRD);
  assert.equal(calculate("60", "40", "41").selectedPair, Pair.SECOND_THIRD);
});

test("an exact equal pair wins with zero distance", () => {
  const result = calculate("49.50", "49.50", "60");
  assert.equal(result.selectedPair, Pair.FIRST_SECOND);
  assert.equal(result.selectionReason, Reason.UNIQUE_NEAREST);
  assert.equal(result.derivedSummativeValue.toString(), "49.5");
});

test("all-equal values use canonical FIRST_SECOND identity without academic preference", () => {
  const result = calculate("50", "50", "50");
  assert.equal(result.firstSecondDistance.toString(), "0");
  assert.equal(result.firstThirdDistance.toString(), "0");
  assert.equal(result.secondThirdDistance.toString(), "0");
  assert.equal(result.selectedPair, Pair.FIRST_SECOND);
  assert.equal(result.selectionReason, Reason.ALL_EQUAL_CANONICAL);
});

test("ascending equal-distance ambiguity selects the higher SECOND_THIRD pair", () => {
  const result = calculate("40", "50", "60");
  assert.equal(result.firstSecondDistance.toString(), "10");
  assert.equal(result.firstThirdDistance.toString(), "20");
  assert.equal(result.secondThirdDistance.toString(), "10");
  assert.equal(result.selectedPair, Pair.SECOND_THIRD);
  assert.equal(result.selectionReason, Reason.EQUAL_DISTANCE_HIGHER_PAIR);
  assert.equal(result.derivedSummativeValue.toString(), "55");
});

test("descending equal-distance ambiguity selects the higher FIRST_SECOND pair", () => {
  const result = calculate("60", "50", "40");
  assert.equal(result.selectedPair, Pair.FIRST_SECOND);
  assert.equal(result.selectionReason, Reason.EQUAL_DISTANCE_HIGHER_PAIR);
  assert.equal(result.derivedSummativeValue.toString(), "55");
});

test("decimal distances and non-integer totals remain exact", () => {
  const result = calculate("40.25", "50.10", "60.00");
  assert.equal(result.firstSecondDistance.toString(), "9.85");
  assert.equal(result.firstThirdDistance.toString(), "19.75");
  assert.equal(result.secondThirdDistance.toString(), "9.9");
  assert.equal(result.selectedPair, Pair.FIRST_SECOND);
  assert.equal(result.derivedSummativeValue.toString(), "45.175");
});

test("the authoritative average preserves an exact three-decimal half-cent", () => {
  const result = calculate("49.99", "50.00", "80.00");
  assert.equal(result.selectedPair, Pair.FIRST_SECOND);
  assert.equal(result.derivedSummativeValue.toFixed(3), "49.995");
});

test("permutations preserve the selected value pair and derived result", () => {
  const permutations = [
    ["40", "50", "60"],
    ["40", "60", "50"],
    ["50", "40", "60"],
    ["50", "60", "40"],
    ["60", "40", "50"],
    ["60", "50", "40"],
  ] as const;
  for (const [first, second, third] of permutations) {
    assert.equal(calculate(first, second, third).derivedSummativeValue.toString(), "55");
  }
});

test("rule evidence has an explicit stable identity", () => {
  assert.deepEqual(SUMMATIVE_THREE_TOTAL_CALCULATION_RULE, {
    versionCode: "SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1",
  });
  assert.equal(
    calculate("40", "50", "60").ruleVersionCode,
    "SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1",
  );
});

test("negative, non-finite, over-scale, above-full-mark and invalid full marks fail closed", () => {
  for (const values of [
    ["-0.01", "1", "2", "100"],
    ["NaN", "1", "2", "100"],
    ["Infinity", "1", "2", "100"],
    ["1.001", "1", "2", "100"],
    ["101", "1", "2", "100"],
    ["1", "1", "2", "0"],
    ["1", "1", "2", "-1"],
  ] as const) {
    assert.throws(
      () =>
        calculateSummativeThreeTotal(
          values[0]!,
          values[1]!,
          values[2]!,
          values[3]!,
        ),
      RangeError,
    );
  }
});
