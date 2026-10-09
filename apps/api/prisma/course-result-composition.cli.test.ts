import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { validateCompositionOptions, reconcileCompositionScope } from "./reconcile-course-composition.cli";
import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";

const url = "postgresql://fixture@127.0.0.1:55432/composition_test?schema=public";
const args = ["--department", "d", "--examination", "x", "--examination-course", "ec", "--expected-database", "composition_test",
  "--expected-host", "127.0.0.1", "--expected-port", "55432", "--expected-schema", "public", "--environment", "disposable"];
const write = [...args, "--apply", "--expected-contexts", "2", "--expected-create", "1"];
const validate = (input = args, raw: string | undefined = url, env = "disposable", confirm?: string) =>
  validateCompositionOptions(input, raw, env, confirm);

test("composition reconciliation defaults to dry run and requires explicit exact write counts", () => {
  assert.equal(validate().apply, false);
  assert.equal(validate(write, url, "disposable", "disposable:composition_test").apply, true);
  assert.throws(() => validate(write));
  assert.throws(() => validate([...args, "--apply"], url, "disposable", "disposable:composition_test"));
});
for (const flag of ["--department", "--examination", "--examination-course", "--expected-database", "--expected-host",
  "--expected-port", "--expected-schema", "--environment"]) test(`composition CLI requires ${flag}`, () => {
  const copy = [...args]; copy.splice(copy.indexOf(flag), 2); assert.throws(() => validate(copy));
});
for (const suffix of [["--apply", "--apply"], ["--unknown", "value"], ["--limit", "0"], ["--limit", "101"],
  ["--limit", "1.1"], ["--department", "replacement"], ["--limit", "--apply"]])
  test(`reject invalid operator options ${suffix.join(" ")}`, () => assert.throws(() => validate([...args, ...suffix])));
test("dedicated environment and URL identities fail closed without leaking connection details", () => {
  for (const raw of ["", "invalid", url.replace("composition_test", "lexora_lms"), url.replace("55432", "5432"),
    url.replace("127.0.0.1", "remote.invalid"), url.replace("public", "other"), `${url}&host=remote.invalid`, `${url}&schema=public`])
    assert.throws(() => validate(args, raw), (e: Error) => { assert.doesNotMatch(e.message, /postgresql:|fixture@/); return true; });
  assert.throws(() => validate(args, url, "production"));
});

for (const mode of ["dry", "apply", "count-mismatch", "bound", "identity-mismatch", "conflict"] as const)
  test(`bounded atomic reconciliation: ${mode}`, async (t) => {
    const calls: string[] = []; const options = mode === "dry" ? validate() : validate(write, url, "disposable", "disposable:composition_test");
    if (mode === "count-mismatch") options.expectedCreate = 2;
    if (mode === "bound") options.limit = 1;
    const tx = {
      $executeRaw: async (q: TemplateStringsArray) => { assert.match(q.join(""), /SET TRANSACTION READ ONLY/); calls.push("read-only"); },
      $queryRaw: async (q: Prisma.Sql | TemplateStringsArray) => {
        const sql = Array.isArray(q) ? q.join("") : (q as Prisma.Sql).sql;
        if (sql.includes("current_database")) return [{ database: mode === "identity-mismatch" ? "other" : options.database, schema: "public" }];
        if (sql.includes("UPDATE examinations")) { calls.push("lock"); return [{ id: "x" }]; }
        if (sql.includes("LIMIT")) { assert.match(sql, /ORDER BY e.id COLLATE "C"/); return [{ enrollmentId: "a" }, { enrollmentId: "b" }]; }
        return [{ id: "ec" }];
      },
    };
    const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>, config: { isolationLevel: string }) => {
      assert.equal(config.isolationLevel, "Serializable"); return work(tx);
    } };
    t.mock.method(CourseResultCompositionService.prototype, "inspectInTransaction", async (client: Prisma.TransactionClient, d: string, x: string, ec: string, e: string) => {
      assert.equal(client, tx); assert.deepEqual([d, x, ec], ["d", "x", "ec"]); calls.push(`inspect-${e}`);
      if (mode === "conflict") throw Error("source conflict");
      return e === "a" ? { status: "READY", sources: {} as never } : { status: "EXISTING", result: {} as never };
    });
    t.mock.method(CourseResultCompositionService.prototype, "reconcileInTransaction", async () => {
      assert.deepEqual(calls.slice(-2), ["inspect-a", "inspect-b"]); calls.push("write");
      return { status: "CREATED", result: {} as never };
    });
    if (["count-mismatch", "bound", "identity-mismatch", "conflict"].includes(mode)) {
      await assert.rejects(reconcileCompositionScope(db as never, options)); assert.equal(calls.includes("write"), false);
    } else {
      const result = await reconcileCompositionScope(db as never, options);
      assert.deepEqual(result, { mode: mode === "dry" ? "DRY_RUN" : "APPLY", contexts: 2, ready: 1, existing: 1, notReady: 0, created: mode === "dry" ? 0 : 1 });
      assert.equal(calls[0], mode === "dry" ? "read-only" : "lock");
      assert.equal(calls.includes("write"), mode === "apply");
    }
  });
