import assert from "node:assert/strict";
import test from "node:test";
import { composeFinalFormative, FINAL_FORMATIVE_RULE } from "./final-formative.rules";

test("authoritative composition preserves exact component precision", () => {
  assert.equal(FINAL_FORMATIVE_RULE, "FINAL_FORMATIVE_40_SUM_V1");
  assert.equal(composeFinalFormative("24.00", "3.50", "4.00").toFixed(2), "31.50");
  assert.equal(composeFinalFormative("24.01", "3.5", "4.123425").toFixed(6), "31.633425");
  assert.equal(composeFinalFormative("0", "0", "0").toString(), "0");
  assert.equal(composeFinalFormative("30", "5", "5").toString(), "40");
});
for (const [a, b, c] of [["-0.01", "0", "0"], ["30.01", "0", "0"], ["0", "-0.1", "0"],
  ["0", "5.1", "0"], ["0", "0", "-0.000001"], ["0", "0", "5.000001"], ["30", "5", "5.000001"],
  ["NaN", "0", "0"], ["0", "Infinity", "0"], ["0", "0", "0.0000001"]]) {
  test(`rejects invalid component/total ${a}/${b}/${c}`, () => assert.throws(() => composeFinalFormative(a!, b!, c!)));
}
