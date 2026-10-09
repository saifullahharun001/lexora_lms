import "reflect-metadata";
import { Prisma, PrismaClient } from "@prisma/client";
import { evidenceTransaction } from "../src/common/academic-evidence/transaction";
import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";

export function validateCompositionOptions(args: readonly string[], raw: string | undefined,
  configuredEnvironment: string | undefined, writeConfirmation: string | undefined) {
  const flags = ["--department", "--examination", "--examination-course", "--expected-database", "--expected-host",
    "--expected-port", "--expected-schema", "--environment", "--limit", "--expected-contexts", "--expected-create"];
  const values = new Map<string, string>(); let apply = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (key === "--apply" && !apply) { apply = true; continue; }
    const value = args[++i];
    if (!flags.includes(key) || values.has(key) || !value || value.startsWith("--")) throw Error("Invalid or duplicate reconciliation option");
    values.set(key, value);
  }
  const required = (key: string) => { const value = values.get(key); if (!value) throw Error("Exact reconciliation scope and environment are required"); return value; };
  const departmentId = required("--department"), examinationId = required("--examination"), examinationCourseId = required("--examination-course");
  const database = required("--expected-database"), host = required("--expected-host"), port = required("--expected-port"), schema = required("--expected-schema");
  const environment = required("--environment");
  if (!["disposable", "staging", "production"].includes(environment) || environment !== configuredEnvironment)
    throw Error("Reconciliation environment does not match dedicated operator configuration");
  if (!raw) throw Error("Dedicated composition reconciliation connection is required");
  let target: URL;
  try { target = new URL(raw); } catch { throw Error("Invalid reconciliation connection"); }
  try {
    if (!["postgres:", "postgresql:"].includes(target.protocol) || decodeURIComponent(target.pathname.slice(1)) !== database ||
      target.hostname !== host || (target.port || "5432") !== port || (target.searchParams.get("schema") || "public") !== schema ||
      [...target.searchParams.keys()].some((key) => key !== "schema") || target.searchParams.getAll("schema").length > 1 || target.hash)
      throw Error();
  } catch { throw Error("Reconciliation connection identity does not match"); }
  if (environment === "disposable" && (!/^[a-zA-Z0-9_]+_test$/.test(database) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(host))) throw Error("Disposable target must be dedicated loopback test infrastructure");
  const integer = (key: string, fallback?: number) => {
    const value = values.get(key); if (value === undefined && fallback !== undefined) return fallback;
    if (!value || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error("Invalid reconciliation count");
    return Number(value);
  };
  const limit = integer("--limit", 100);
  if (limit < 1 || limit > 100) throw Error("Reconciliation limit must be between 1 and 100");
  const expectedContexts = apply ? integer("--expected-contexts") : null;
  const expectedCreate = apply ? integer("--expected-create") : null;
  if (apply && (writeConfirmation !== `${environment}:${database}` || expectedContexts! > limit || expectedCreate! > expectedContexts!))
    throw Error("Explicit write confirmation and bounded expected counts are required");
  return { datasourceUrl: raw, departmentId, examinationId, examinationCourseId, database, host, port, schema,
    environment, apply, limit, expectedContexts, expectedCreate };
}
export type CompositionReconciliationOptions = ReturnType<typeof validateCompositionOptions>;

/** One bounded, deterministic, atomic operation; dry run is a database-enforced read-only snapshot. */
export async function reconcileCompositionScope(db: PrismaClient, options: CompositionReconciliationOptions) {
  const service = new CourseResultCompositionService();
  return evidenceTransaction(db as never, async (tx) => {
    if (!options.apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const identity = await tx.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema`;
    if (identity.length !== 1 || identity[0]?.database !== options.database || identity[0]?.schema !== options.schema)
      throw Error("Connected reconciliation identity does not match");
    if (options.apply) {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE examinations SET id=id WHERE id=${options.examinationId} AND department_id=${options.departmentId} RETURNING id`;
      if (locked.length !== 1) throw Error("Reconciliation context not found");
    }
    // Reviewed academic context projection only. Source evidence is read exclusively
    // through the composition owner's validated immutable source contract.
    const course = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM examination_courses WHERE id=${options.examinationCourseId}
        AND department_id=${options.departmentId} AND examination_id=${options.examinationId}`;
    if (course.length !== 1) throw Error("Reconciliation context not found");
    const contexts = await tx.$queryRaw<Array<{ enrollmentId: string }>>(Prisma.sql`
      SELECT e.id AS "enrollmentId" FROM examination_courses ec JOIN enrollments e
        ON e.course_offering_id=ec.course_offering_id AND e.department_id=ec.department_id
      WHERE ec.id=${options.examinationCourseId} AND ec.examination_id=${options.examinationId} AND ec.department_id=${options.departmentId}
      ORDER BY e.id COLLATE "C" LIMIT ${options.limit + 1}`);
    if (contexts.length > options.limit) throw Error("Reconciliation scope exceeds bounded limit");
    const states = [];
    for (const context of contexts) states.push(await service.inspectInTransaction(tx, options.departmentId,
      options.examinationId, options.examinationCourseId, context.enrollmentId));
    const ready = states.filter((state) => state.status === "READY").length;
    const existing = states.filter((state) => state.status === "EXISTING").length;
    if (options.apply && (contexts.length !== options.expectedContexts || ready !== options.expectedCreate))
      throw Error("Reconciliation expected counts changed; repeat discovery");
    if (options.apply) for (let i = 0; i < contexts.length; i++) {
      if (states[i]!.status !== "READY") continue;
      const result = await service.reconcileInTransaction(tx, options.departmentId, options.examinationId,
        options.examinationCourseId, contexts[i]!.enrollmentId);
      if (result.status !== "CREATED") throw Error("Reconciliation source state changed");
    }
    return { mode: options.apply ? "APPLY" : "DRY_RUN", contexts: contexts.length, ready,
      existing, notReady: contexts.length - ready - existing, created: options.apply ? ready : 0 };
  });
}

export async function main(args = process.argv.slice(2)) {
  const options = validateCompositionOptions(args, process.env.LEXORA_COURSE_COMPOSITION_RECONCILE_DATABASE_URL,
    process.env.LEXORA_COURSE_COMPOSITION_RECONCILE_ENVIRONMENT, process.env.LEXORA_COURSE_COMPOSITION_RECONCILE_CONFIRM);
  const db = new PrismaClient({ datasourceUrl: options.datasourceUrl });
  try { console.log(JSON.stringify(await reconcileCompositionScope(db, options))); }
  finally { await db.$disconnect(); }
}
if (require.main === module) void main().catch(() => {
  console.error("Composition reconciliation failed; inspect scope, expected counts and immutable evidence. No details or credentials are logged.");
  process.exitCode = 1;
});
