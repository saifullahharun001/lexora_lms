import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import bcrypt from "bcryptjs";
import {
  DepartmentStatus,
  PrismaClient,
  SessionStatus,
  UserStatus
} from "@prisma/client";

loadRuntimeEnv();
assertRuntimeOnlyEnvironment();

const prisma = new PrismaClient();

const RUNTIME_DEPARTMENT = {
  id: "dept_law_test",
  code: "0421",
  slug: "law",
  name: "Department of Law"
} as const;

const ROLE_FIXTURES = [
  {
    code: "department_admin",
    name: "Department Admin"
  },
  {
    code: "teacher",
    name: "Teacher"
  },
  {
    code: "student",
    name: "Student"
  }
] as const;

// Local/runtime-only credentials for repeatable manual testing. Do not use this
// workflow for production onboarding or store these passwords in documentation.
const ACCOUNT_FIXTURES = [
  {
    email: "admin.law@cu.ac.bd",
    password: "13245768",
    roleCode: "department_admin",
    displayName: "Law Test Admin"
  },
  {
    email: "teacher.law@cu.ac.bd",
    password: "86754231",
    roleCode: "teacher",
    displayName: "Law Test Teacher"
  },
  {
    email: "student.law@cu.ac.bd",
    password: "13248675",
    roleCode: "student",
    displayName: "Law Test Student"
  }
] as const;

const LEGACY_RUNTIME_EMAILS = [
  "runtime-test-student@cu.ac.bd",
  "runtime-test-teacher@cu.ac.bd",
  "runtime-business-admin@cu.ac.bd",
  "runtime-student-own@cu.ac.bd",
  "runtime-student-other@cu.ac.bd"
] as const;

function loadRuntimeEnv() {
  for (const envPath of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", "..", ".env")
  ]) {
    if (!existsSync(envPath)) {
      continue;
    }

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lexora_lms?schema=public";
  }
}

function assertRuntimeOnlyEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run runtime Law account reset in production.");
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function assertNoDepartmentConflict() {
  const conflictingDepartment = await prisma.department.findFirst({
    where: {
      id: { not: RUNTIME_DEPARTMENT.id },
      OR: [
        { code: RUNTIME_DEPARTMENT.code },
        { slug: RUNTIME_DEPARTMENT.slug }
      ],
      deletedAt: null
    },
    select: {
      id: true,
      code: true,
      slug: true
    }
  });

  if (conflictingDepartment) {
    throw new Error(
      [
        "Refusing to create or update the runtime Law department because another",
        `department already owns code/slug ${RUNTIME_DEPARTMENT.code}/${RUNTIME_DEPARTMENT.slug}:`,
        `${conflictingDepartment.id} (${conflictingDepartment.code}, ${conflictingDepartment.slug}).`,
        `Resolve that conflict manually so ${RUNTIME_DEPARTMENT.id} remains the canonical runtime department.`
      ].join(" ")
    );
  }
}

async function ensureRuntimeDepartment() {
  await assertNoDepartmentConflict();

  return prisma.department.upsert({
    where: {
      id: RUNTIME_DEPARTMENT.id
    },
    update: {
      code: RUNTIME_DEPARTMENT.code,
      slug: RUNTIME_DEPARTMENT.slug,
      name: RUNTIME_DEPARTMENT.name,
      status: DepartmentStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null
    },
    create: {
      id: RUNTIME_DEPARTMENT.id,
      code: RUNTIME_DEPARTMENT.code,
      slug: RUNTIME_DEPARTMENT.slug,
      name: RUNTIME_DEPARTMENT.name,
      status: DepartmentStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      slug: true,
      name: true
    }
  });
}

async function ensureRoles(departmentId: string) {
  const roles = new Map<string, { id: string; code: string }>();

  for (const role of ROLE_FIXTURES) {
    const savedRole = await prisma.role.upsert({
      where: {
        departmentId_code: {
          departmentId,
          code: role.code
        }
      },
      update: {
        name: role.name,
        archivedAt: null
      },
      create: {
        departmentId,
        code: role.code,
        name: role.name
      },
      select: {
        id: true,
        code: true
      }
    });

    roles.set(savedRole.code, savedRole);
  }

  return roles;
}

async function ensureCanonicalAccounts(
  departmentId: string,
  roles: Map<string, { id: string; code: string }>
) {
  const userIds: string[] = [];

  for (const account of ACCOUNT_FIXTURES) {
    const role = roles.get(account.roleCode);

    if (!role) {
      throw new Error(`Missing required runtime role: ${account.roleCode}`);
    }

    const email = account.email.trim();
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(account.password, 12);

    const user = await prisma.user.upsert({
      where: {
        normalizedEmail
      },
      update: {
        departmentId,
        email,
        normalizedEmail,
        passwordHash,
        displayName: account.displayName,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null
      },
      create: {
        departmentId,
        email,
        normalizedEmail,
        passwordHash,
        displayName: account.displayName,
        status: UserStatus.ACTIVE
      },
      select: {
        id: true
      }
    });

    userIds.push(user.id);

    await prisma.userRole.updateMany({
      where: {
        userId: user.id,
        departmentId,
        roleId: {
          not: role.id
        },
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_departmentId: {
          userId: user.id,
          roleId: role.id,
          departmentId
        }
      },
      update: {
        revokedAt: null,
        expiresAt: null
      },
      create: {
        userId: user.id,
        roleId: role.id,
        departmentId
      }
    });
  }

  const sessionResult = await revokeActiveSessions(userIds, "runtime-law-account-reset");

  return {
    userCount: userIds.length,
    revokedSessionCount: sessionResult.count
  };
}

async function findLegacyRuntimeUsers() {
  const canonicalEmails = ACCOUNT_FIXTURES.map((account) =>
    normalizeEmail(account.email)
  );

  const candidates = await prisma.user.findMany({
    where: {
      normalizedEmail: {
        notIn: canonicalEmails
      },
      OR: [
        {
          normalizedEmail: {
            in: LEGACY_RUNTIME_EMAILS.map((email) => normalizeEmail(email))
          }
        },
        {
          normalizedEmail: {
            startsWith: "runtime-"
          }
        },
        {
          normalizedEmail: {
            contains: "runtime-test"
          }
        }
      ]
    },
    select: {
      id: true,
      normalizedEmail: true
    }
  });

  return candidates.filter((user) =>
    user.normalizedEmail.endsWith("@cu.ac.bd")
  );
}

async function deactivateLegacyRuntimeUsers() {
  const legacyUsers = await findLegacyRuntimeUsers();

  if (legacyUsers.length === 0) {
    return {
      deactivatedUserCount: 0,
      revokedSessionCount: 0
    };
  }

  const legacyUserIds = legacyUsers.map((user) => user.id);

  const deactivationResult = await prisma.user.updateMany({
    where: {
      id: {
        in: legacyUserIds
      }
    },
    data: {
      status: UserStatus.SUSPENDED
    }
  });

  const sessionResult = await revokeActiveSessions(
    legacyUserIds,
    "legacy-runtime-account-deactivated"
  );

  return {
    deactivatedUserCount: deactivationResult.count,
    revokedSessionCount: sessionResult.count
  };
}

async function revokeActiveSessions(userIds: string[], reason: string) {
  if (userIds.length === 0) {
    return {
      count: 0
    };
  }

  return prisma.session.updateMany({
    where: {
      userId: {
        in: userIds
      },
      status: SessionStatus.ACTIVE
    },
    data: {
      status: SessionStatus.REVOKED,
      revokedAt: new Date(),
      revokedReason: reason
    }
  });
}

async function main() {
  const department = await ensureRuntimeDepartment();
  const roles = await ensureRoles(department.id);
  const canonicalResult = await ensureCanonicalAccounts(department.id, roles);
  const legacyResult = await deactivateLegacyRuntimeUsers();

  console.info("Runtime Law account reset complete.", {
    department,
    canonicalUsers: canonicalResult.userCount,
    canonicalSessionsRevoked: canonicalResult.revokedSessionCount,
    legacyRuntimeUsersDeactivated: legacyResult.deactivatedUserCount,
    legacyRuntimeSessionsRevoked: legacyResult.revokedSessionCount
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
