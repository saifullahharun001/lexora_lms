import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { FinalFormativeService } from "../src/modules/final-formative/final-formative.service";
import { main, validateReconciliationOptions } from "./reconcile-final-formative.cli";

const args = ["--apply", "--department", "department", "--examination", "examination", "--expected-database", "reconcile_test"];
const url = "postgresql://operator:secret@database.invalid:5432/reconcile_test?schema=public";

test("CLI accepts explicit scope and matching URL identity with Prisma schema", () => {
  assert.deepEqual(validateReconciliationOptions(args, url), {
    datasourceUrl: url, departmentId: "department", examinationId: "examination", expectedDatabase: "reconcile_test",
  });
  assert.equal(validateReconciliationOptions(args, url.replace("reconcile_test", "reconcile%5Ftest")).expectedDatabase, "reconcile_test");
});

test("CLI rejects URL database mismatch and requires an exact name", () => {
  for (const name of ["other_test", "RECONCILE_TEST", "reconcile_test_extra"])
    assert.throws(() => validateReconciliationOptions(args, url.replace("/reconcile_test", `/${name}`)), /database identity does not match/);
});

for (const key of ["host", "hostaddr", "service", "options", "HOST", "%68ost"])
  test(`CLI rejects connection override parameter ${key}, including empty values`, () => {
    for (const value of ["", "redirect"])
      assert.throws(() => validateReconciliationOptions(args, `${url}&${key}=${value}`), /connection overrides are forbidden/);
  });

test("CLI rejects a missing dedicated URL without ordinary database fallbacks", (t) => {
  const previous = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.DATABASE_URL = url;
  process.env.DATABASE_DIRECT_URL = url;
  for (const raw of [undefined, ""])
    assert.throws(() => validateReconciliationOptions(args, raw), /Dedicated reconciliation connection is required/);
});

for (const flag of ["--apply", "--department", "--examination", "--expected-database"])
  test(`CLI rejects missing required flag ${flag}`, () => {
    const missing = [...args]; missing.splice(missing.indexOf(flag), flag === "--apply" ? 1 : 2);
    assert.throws(() => validateReconciliationOptions(missing, url), /Explicit reconciliation scope is required|Use --apply/);
    if (flag !== "--apply") {
      const noValue = [...args]; noValue.splice(noValue.indexOf(flag) + 1, 1);
      assert.throws(() => validateReconciliationOptions(noValue, url), /Explicit reconciliation scope is required/);
    }
  });

test("CLI rejects malformed or non-PostgreSQL URLs without exposing credentials", () => {
  for (const raw of ["secret", url.replace("postgresql:", "https:"), url.replace("reconcile_test", "%ZZ")])
    assert.throws(() => validateReconciliationOptions(args, raw), (error: Error) => {
      assert.doesNotMatch(error.message, /secret|operator|database\.invalid/);
      return true;
    });
});

// Exercise the actual CLI ordering with all database I/O stubbed: no real connection.
for (const scenario of ["match", "mismatch", "case-mismatch", "missing", "multiple", "connect-error", "query-error", "url-mismatch", "override"])
  test(`CLI connected identity gate: ${scenario}`, async (t) => {
    const calls: string[] = [], output: unknown[][] = [];
    t.mock.method(PrismaClient.prototype, "$connect", async () => {
      calls.push("connect");
      if (scenario === "connect-error") throw new Error("controlled connection failure");
    });
    t.mock.method(PrismaClient.prototype, "$queryRaw", async (query: TemplateStringsArray) => {
      calls.push("identity");
      assert.equal(query.join(""), 'SELECT current_database() AS "databaseName"');
      if (scenario === "query-error") throw new Error("controlled identity query failure");
      if (scenario === "missing") return [];
      if (scenario === "multiple") return [{ databaseName: "reconcile_test" }, { databaseName: "reconcile_test" }];
      return [{ databaseName: scenario === "mismatch" ? "other_test" : scenario === "case-mismatch" ? "RECONCILE_TEST" : "reconcile_test" }];
    });
    t.mock.method(PrismaClient.prototype, "$disconnect", async () => { calls.push("disconnect"); });
    t.mock.method(FinalFormativeService.prototype, "reconcile", async (department: string, examination: string) => {
      calls.push("reconcile");
      assert.deepEqual([department, examination], ["department", "examination"]);
      return [{ status: "CREATED", studentUserId: "private-student", mark: "31.500000" }, { status: "EXISTING" }, { status: "NOT_READY" }];
    });
    t.mock.method(console, "log", (...values: unknown[]) => { output.push(values); });
    const raw = scenario === "url-mismatch" ? url.replace("/reconcile_test", "/other_test") : scenario === "override" ? `${url}&host=redirect` : url;
    if (scenario === "match") {
      await main(args, raw);
      assert.deepEqual(calls, ["connect", "identity", "reconcile", "disconnect"]);
      assert.deepEqual(output, [[JSON.stringify({ created: 1, existing: 1, notReady: 1 })]]);
    } else {
      await assert.rejects(main(args, raw), /identity|connection|overrides/);
      assert.deepEqual(calls, ["url-mismatch", "override"].includes(scenario) ? [] : scenario === "connect-error"
        ? ["connect", "disconnect"] : ["connect", "identity", "disconnect"]);
      assert.deepEqual(output, []);
    }
  });
