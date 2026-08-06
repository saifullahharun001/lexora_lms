import { PrismaClient } from "@prisma/client";

import {
  BackfillConflictError,
  CANONICAL_FINGERPRINT,
  parseBackfillArguments,
  runApply,
  runPlan,
  sanitizedSummary,
} from "./llb-2025-2026-curriculum.backfill";

async function main() {
  if (!process.env.DATABASE_URL?.trim())
    throw new BackfillConflictError(
      "DATABASE_URL must be deliberately supplied",
    );
  const { mode, values } = parseBackfillArguments(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    if (mode === "plan") {
      const expectedDatabaseName = values.get("expected-database-name");
      const result = await runPlan(prisma, expectedDatabaseName);
      console.info(
        JSON.stringify(
          sanitizedSummary(
            "PLAN",
            expectedDatabaseName
              ? result.databaseName === expectedDatabaseName
              : null,
            result.plan,
          ),
        ),
      );
      return;
    }
    const fingerprint = values.get("confirm-fingerprint") ?? "";
    const expectedDatabaseName = values.get("expected-database-name") ?? "";
    const actorUserId = values.get("actor-user-id") ?? "";
    const reason = values.get("reason") ?? "";
    const expectedTitleUpdatesText = values.get("expected-title-updates") ?? "";
    if (fingerprint !== CANONICAL_FINGERPRINT)
      throw new BackfillConflictError(
        "Canonical fingerprint confirmation mismatch",
      );
    if (!/^(0|11)$/.test(expectedTitleUpdatesText))
      throw new BackfillConflictError(
        "--expected-title-updates must be 0 or 11",
      );
    const plan = await runApply(prisma, {
      fingerprint,
      expectedDatabaseName,
      actorUserId,
      reason,
      expectedTitleUpdates: Number(expectedTitleUpdatesText),
    });
    console.info(JSON.stringify(sanitizedSummary("APPLY", true, plan)));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof BackfillConflictError
      ? error.message
      : "Backfill operation failed; inspect private operational logs.";
  console.error(
    JSON.stringify({
      targetClassification: "BLOCKED_CONFLICT",
      error: message,
    }),
  );
  process.exitCode = 1;
});
