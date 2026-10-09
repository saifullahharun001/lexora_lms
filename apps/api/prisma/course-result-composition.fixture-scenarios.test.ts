import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, SummativeExaminerComparisonDecision } from "@prisma/client";
import { comprehensiveDecimal, deriveComprehensive, COMPREHENSIVE_SEATS } from "../src/modules/assessment/domain/comprehensive.rules";
import { calculateSummativeExaminerComparison } from "../src/modules/summative-examination/domain/summative-examiner-comparison.rule";
import { PRODUCTION_CASES, PRODUCTION_FIXTURE_INPUTS } from "./fixtures/course-composition-production-baseline";

const dec = (value: string) => new Prisma.Decimal(value);
const withinScale = (value: string, scale: number) => new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value);

/**
 * This is a SOURCE-FEASIBILITY test, not a PostgreSQL seeded-fixture test.
 * It uses the actual Comprehensive and Summative domain rules. No records,
 * permissions, audit events or final source evidence are fabricated here.
 */
test("six /100 production scenarios have reconstructible /30+/5+/5 and First/Second inputs", () => {
  assert.equal(PRODUCTION_CASES.length, 6);
  assert.equal(PRODUCTION_FIXTURE_INPUTS.length, 6);
  assert.equal(new Set(PRODUCTION_CASES.map((s) => s.key)).size, 6);
  assert.equal(new Set(PRODUCTION_FIXTURE_INPUTS.map((s) => s.key)).size, 6);

  for (const recipe of PRODUCTION_FIXTURE_INPUTS) {
    const scenario = PRODUCTION_CASES.find((s) => s.key === recipe.key);
    assert.ok(scenario, `Unknown scenario ${recipe.key}`);
    assert.equal(recipe.comprehensiveMode, "ALL_MEMBERS_AVERAGE");
    assert.ok(withinScale(recipe.activities, 2));
    assert.ok(withinScale(recipe.attendance, 1));
    assert.equal(recipe.comprehensiveSeatMarks.length, 4);
    assert.ok(recipe.comprehensiveSeatMarks.every((m) => withinScale(m, 4)));
    assert.ok(withinScale(recipe.firstExaminer, 2));
    assert.ok(withinScale(recipe.secondExaminer, 2));
    assert.ok(dec(recipe.activities).gte(0) && dec(recipe.activities).lte(30));
    assert.ok(dec(recipe.attendance).gte(0) && dec(recipe.attendance).lte(5));

    const comprehensive = deriveComprehensive(recipe.comprehensiveMode, dec("5"),
      COMPREHENSIVE_SEATS.map((seat, index) => ({
        seat, mark: comprehensiveDecimal(recipe.comprehensiveSeatMarks[index]!, dec("5")),
      })));
    const formative = dec(recipe.activities).plus(recipe.attendance).plus(comprehensive);
    assert.equal(formative.toString(), scenario.formative, `Impossible genuine Formative recipe: ${recipe.key}`);
    assert.ok(formative.mul(40000).isInteger(), `Unattainable Formative precision: ${recipe.key}`);

    const comparison = calculateSummativeExaminerComparison(recipe.firstExaminer, recipe.secondExaminer, "60");
    assert.equal(comparison.decision, SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED,
      `First/Second marks unexpectedly require Third: ${recipe.key}`);
    const summative = dec(recipe.firstExaminer).plus(recipe.secondExaminer).div(2);
    assert.equal(summative.toString(), scenario.summative, `Impossible Summative recipe: ${recipe.key}`);
    assert.deepEqual([formative.gte(16), summative.gte(24), formative.gte(16) && summative.gte(24)],
      [scenario.formativePassed, scenario.summativePassed, scenario.formativePassed && scenario.summativePassed]);
  }
});

test("unreachable old /40 fixtures remain valid arithmetic-only unit inputs, never real fixture inputs", () => {
  for (const impossible of ["15.999999", "31.123456"]) {
    assert.equal(dec(impossible).mul(40000).isInteger(), false);
    assert.equal(PRODUCTION_CASES.some((s) => s.formative === impossible), false);
  }
  assert.equal(PRODUCTION_CASES.find((s) => s.key === "formative_fail")?.formative, "15.999975");
  assert.equal(PRODUCTION_CASES.find((s) => s.key === "precision")?.formative, "31.123475");
});
