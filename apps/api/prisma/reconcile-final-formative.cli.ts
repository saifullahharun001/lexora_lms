import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";
import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { FinalFormativeService } from "../src/modules/final-formative/final-formative.service";

export function validateReconciliationOptions(args: readonly string[], raw: string | undefined) {
  const value = (name: string) => args[args.indexOf(name) + 1];
  for (const flag of ["--department", "--examination", "--expected-database"])
    if (!args.includes(flag) || !value(flag) || value(flag)!.startsWith("--")) throw new Error("Explicit reconciliation scope is required");
  if (!args.includes("--apply")) throw new Error("Use --apply for operational source reconciliation");
  if (!raw) throw new Error("Dedicated reconciliation connection is required");
  let url: URL, database: string;
  try { url = new URL(raw); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error("Invalid reconciliation connection"); }
  for (const key of url.searchParams.keys())
    if (["host", "hostaddr", "service", "options"].includes(key.toLowerCase()))
      throw new Error("Reconciliation connection overrides are forbidden");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || database !== value("--expected-database"))
    throw new Error("Reconciliation database identity does not match");
  return { datasourceUrl: raw, departmentId: value("--department")!, examinationId: value("--examination")!,
    expectedDatabase: value("--expected-database")! };
}

/** Deliberately no DATABASE_URL fallback or automatic startup/migration backfill. */
export async function main(args = process.argv.slice(2), raw = process.env.LEXORA_FINAL_FORMATIVE_RECONCILE_DATABASE_URL) {
  const options = validateReconciliationOptions(args, raw);
  const prisma = new PrismaClient({ datasourceUrl: options.datasourceUrl });
  try {
    await prisma.$connect();
    const identity = await prisma.$queryRaw<Array<{ databaseName: string }>>`SELECT current_database() AS "databaseName"`;
    if (identity.length !== 1 || identity[0]?.databaseName !== options.expectedDatabase)
      throw new Error("Connected reconciliation database identity does not match");
    const outcomes = await new FinalFormativeService(prisma as PrismaService, new CourseResultCompositionService()).reconcileFormativeOnly(options.departmentId, options.examinationId);
    // No credentials, individual marks, or student identifiers in console output.
    console.log(JSON.stringify({ created: outcomes.filter((o) => o.status === "CREATED").length,
      existing: outcomes.filter((o) => o.status === "EXISTING").length, notReady: outcomes.filter((o) => o.status === "NOT_READY").length }));
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) void main().catch(() => {
  console.error("Final Formative reconciliation failed; no successful transaction was committed. Check scope and protected source integrity.");
  process.exitCode = 1;
});
