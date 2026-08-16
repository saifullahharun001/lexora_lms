import { PrismaClient } from "@prisma/client";

import {
  applyAuthorizationProvisioning,
  AuthorizationProvisioningError,
  parseAuthorizationProvisioningArguments,
  planAuthorizationProvisioning,
  sanitizedProvisioningSummary,
} from "./provision-authorization";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new AuthorizationProvisioningError(
      "DATABASE_URL must be deliberately supplied",
    );
  }

  const { selector, apply } = parseAuthorizationProvisioningArguments(
    process.argv.slice(2),
  );
  const prisma = new PrismaClient();

  try {
    const result = apply
      ? await applyAuthorizationProvisioning(prisma, selector)
      : await planAuthorizationProvisioning(prisma, selector);
    console.info(JSON.stringify(sanitizedProvisioningSummary(result)));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      mode: "BLOCKED",
      error:
        error instanceof AuthorizationProvisioningError
          ? error.message
          : "Authorization provisioning failed; inspect private operational logs.",
    }),
  );
  process.exitCode = 1;
});
