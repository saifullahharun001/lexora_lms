import assert from "node:assert/strict";
import test from "node:test";
import { composeCourseResult } from "./course-result-composition.rules";

for (const [f, s, total, fp, sp] of [
  ["0", "0", "0", false, false], ["40", "60", "100", true, true],
  ["16", "24", "40", true, true], ["15.999999", "60", "75.999999", false, true],
  ["40", "23.999999", "63.999999", true, false], ["15.999999", "23.999999", "39.999998", false, false],
  ["16.000001", "24.000001", "40.000002", true, true], ["31.123456", "46.125", "77.248456", true, true],
] as const) test(`exact ${f}/40 + ${s}/60`, () => {
  const result = composeCourseResult(f, s, "40", "60");
  assert.equal(result.totalMark.toString(), total); assert.equal(result.totalFullMark.toString(), "100");
  assert.equal(result.formativePassed, fp); assert.equal(result.summativePassed, sp);
  assert.equal(result.coursePassed, fp && sp);
});

for (const values of [
  ["-0.000001", "24", "40", "60"], ["40.000001", "24", "40", "60"],
  ["16", "-0.000001", "40", "60"], ["16", "60.000001", "40", "60"],
  ["16", "24", "39", "60"], ["16", "24", "40", "61"],
  ["NaN", "24", "40", "60"], ["16", "Infinity", "40", "60"],
  ["16.0000001", "24", "40", "60"], ["16", "24.0000001", "40", "60"],
] as const) test(`reject incompatible marks ${values.join("/")}`, () => {
  assert.throws(() => composeCourseResult(values[0], values[1], values[2], values[3]));
});
