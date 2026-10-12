import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  PrismaClient,
  SummativeCommitteeMemberReviewOutcome,
} from "@prisma/client";
import { RequestContextService } from "../src/common/request-context/request-context.service";
import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";
import { SummativeCommitteeWorkflowService } from "../src/modules/summative-examination/application/services/summative-committee-workflow.service";
import { SummativeCalculatedMarkService } from "../src/modules/summative-examination/application/services/summative-calculated-mark.service";

import {
  SummativeCommitteeWorkflowAuthorizerService,
  type SummativeCommitteeWorkflowAuthority,
} from "../src/modules/summative-examination/application/services/summative-committee-workflow-authorizer.service";
import { PrincipalLoaderService } from "../src/modules/authorization/services/principal-loader.service";
import { PERMISSIONS } from "../src/modules/identity-access/authorization/permissions.constants";
import { PLATFORM_ROLES } from "../src/modules/identity-access/authorization/roles.constants";

const url = process.env.LEXORA_CRC_AUTHORITY_TEST_DATABASE_URL;
const configured = Boolean(
  url || process.env.LEXORA_CRC_AUTHORITY_DISPOSABLE_CONFIRM,
);

test(
  "Committee authority: isolated real PostgreSQL negative matrix",
  { skip: !configured },
  async (t) => {
    assert.equal(
      process.env.LEXORA_CRC_AUTHORITY_DISPOSABLE_CONFIRM,
      "YES_DISPOSABLE",
    );
    if (!url) throw new Error("Explicit disposable database URL required");

    const parsed = new URL(url);
    assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
    assert.match(decodeURIComponent(parsed.pathname), /_test$/);
    assert.notEqual(parsed.pathname.toLowerCase(), "/lexora_lms");

    for (const key of parsed.searchParams.keys()) {
      assert.ok(
        !["host", "hostaddr", "service", "options"].includes(key.toLowerCase()),
      );
    }

    const schema = `crc_authority_test_${randomUUID().replaceAll("-", "")}`;
    const scoped = new URL(url);
    scoped.searchParams.set("schema", schema);

    const admin = new PrismaClient({ datasourceUrl: url });
    const db = new PrismaClient({ datasourceUrl: scoped.toString() });
    let created = false;

    try {
      const version = await admin.$queryRaw<Array<{ n: number }>>`
        SELECT current_setting('server_version_num')::integer AS n
      `;
      assert.ok(version[0]!.n >= 180000 && version[0]!.n < 190000);

      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      created = true;

      const fixture = readFileSync(
        "prisma/test-fixtures/attendance-generation.sql",
        "utf8",
      );

      for (const statement of fixture.split(/;\s*(?:\r?\n|$)/)) {
        if (statement.trim()) {
          await db.$executeRawUnsafe(statement.trim());
        }
      }

      // Prisma selects all scalar fields when loading principals.
      // These extensions belong only to this disposable test schema.
      // No real credentials or password hashes are used.
      for (const sql of [
        `ALTER TABLE departments
          ADD COLUMN code TEXT NOT NULL DEFAULT 'fixture-department',
          ADD COLUMN slug TEXT NOT NULL DEFAULT 'fixture-department',
          ADD COLUMN name TEXT NOT NULL DEFAULT 'Synthetic Department',
          ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now(),
          ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()`,

        `ALTER TABLE users
          ADD COLUMN email TEXT NOT NULL DEFAULT 'fixture@invalid.test',
          ADD COLUMN normalized_email TEXT NOT NULL DEFAULT 'fixture@invalid.test',
          ADD COLUMN password_hash TEXT NOT NULL DEFAULT 'DISABLED_SYNTHETIC_NOT_A_HASH',
          ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Synthetic Test User',
          ADD COLUMN last_login_at TIMESTAMP,
          ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now(),
          ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()`,

        `ALTER TABLE user_roles
          ADD COLUMN assigned_by_user_id TEXT,
          ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now(),
          ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()`,

        `ALTER TABLE role_permissions
          ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now(),
          ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()`,

        `ALTER TABLE permissions
          ADD COLUMN description TEXT NOT NULL DEFAULT 'Synthetic Permission',
          ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now(),
          ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()`,
      ]) {
        await db.$executeRawUnsafe(sql);
      }

      await db.$executeRawUnsafe(`
        CREATE TABLE summative_calculated_marks (
          id TEXT PRIMARY KEY,
          department_id TEXT,
          examination_id TEXT,
          examination_course_id TEXT,
          candidate_id TEXT
        )
      `);

      const seed = async (sql: string) => db.$executeRawUnsafe(sql);

      await seed(`INSERT INTO departments(id) VALUES ('da'),('db')`);

      await seed(`
        INSERT INTO users(id,department_id) VALUES
          ('member-a','da'),('chair-a','da'),
          ('other-a','da'),('member-b','db')
      `);

      await seed(`
        INSERT INTO roles(id,department_id,code,name)
        VALUES ('ra','da','${PLATFORM_ROLES.TEACHER}','Synthetic Teacher A'),
               ('rb','db','${PLATFORM_ROLES.TEACHER}','Synthetic Teacher B')
      `);

      await seed(`
        INSERT INTO user_roles(id,user_id,department_id,role_id)
        VALUES ('urma','member-a','da','ra'),
               ('urca','chair-a','da','ra'),
               ('uroa','other-a','da','ra'),
               ('urmb','member-b','db','rb')
      `);

      await db.$executeRaw`
        INSERT INTO permissions(id,code,resource,action,scope)
        VALUES
          ('pm',
           ${PERMISSIONS.SUMMATIVE_EXAMINATION.MEMBER_REVIEW_DEPARTMENT},
           'summative-examination.member-review','review',
           'DEPARTMENT'::"PermissionScope"),
          ('pc',
           ${PERMISSIONS.SUMMATIVE_EXAMINATION.CHAIRMAN_APPROVAL_DEPARTMENT},
           'summative-examination.chairman-approval','approve',
           'DEPARTMENT'::"PermissionScope")
      `;

      await seed(`
        INSERT INTO role_permissions(id,role_id,permission_id)
        VALUES ('rpa1','ra','pm'),('rpa2','ra','pc'),
               ('rpb1','rb','pm'),('rpb2','rb','pc')
      `);

      await seed(`
        INSERT INTO examinations(id,department_id)
        VALUES ('exa','da'),('exa2','da'),('exb','db')
      `);

      await seed(`
        INSERT INTO examination_courses(id,department_id,examination_id)
        VALUES ('eca','da','exa'),('eca2','da','exa2'),
               ('ecb','db','exb')
      `);

      await seed(`
        INSERT INTO examination_committees(id,department_id,examination_id)
        VALUES ('coma','da','exa'),('coma2','da','exa2'),
               ('comb','db','exb')
      `);

      await seed(`
        INSERT INTO examination_committee_assignments
          (id,department_id,examination_id,committee_id,
           assigned_user_id,seat,status,assigned_at)
        VALUES
          ('asma','da','exa','coma','member-a',
           'MEMBER_1','ACTIVE','2026-10-01'),
          ('asca','da','exa','coma','chair-a',
           'CHAIRMAN','ACTIVE','2026-10-01'),
          ('asoa','da','exa2','coma2','other-a',
           'MEMBER_1','ACTIVE','2026-10-01'),
          ('asmb','db','exb','comb','member-b',
           'MEMBER_1','ACTIVE','2026-10-01')
      `);

      await seed(`
        INSERT INTO summative_calculated_marks
          (id,department_id,examination_id,examination_course_id,candidate_id)
        VALUES ('calca','da','exa','eca','canda'),
               ('calca2','da','exa2','eca2','canda2'),
               ('calcb','db','exb','ecb','candb')
      `);

      type Duty = "member" | "chairman";

      function authorizer(
        actorId: string,
        userRoleId: string,
        roleId: string,
        departmentId: string,
        duty: Duty,
      ) {
        const resource = duty === "member"
          ? "summative-examination.member-review"
          : "summative-examination.chairman-approval";
        const action = duty === "member" ? "review" : "approve";

        const principal = {
          actorId,
          actorType: "user",
          isAuthenticated: true,
          activeDepartmentId: departmentId,
          roleAssignments: [{
            userRoleId, roleId, departmentId, role: PLATFORM_ROLES.TEACHER,
          }],
          permissions: [{
            resource, action, scope: "department",
            source: { departmentId, userRoleId, roleId },
          }],
        };

        return new SummativeCommitteeWorkflowAuthorizerService(
          db as never,
          { get: () => ({ principal }) } as never,
        );
      }

      const member = authorizer("member-a", "urma", "ra", "da", "member");
      const chair = authorizer("chair-a", "urca", "ra", "da", "chairman");
      const other = authorizer("other-a", "uroa", "ra", "da", "member");
      const foreign = authorizer("member-b", "urmb", "rb", "db", "member");

      const current = (
        service: SummativeCommitteeWorkflowAuthorizerService,
        authority: SummativeCommitteeWorkflowAuthority,
      ) => db.$transaction(
        (tx) => service.assertCurrentAuthority(tx, authority, new Date()),
      );

      let memberAuthority!: SummativeCommitteeWorkflowAuthority;

      await t.test("valid Member and Chairman authority succeeds", async () => {
        memberAuthority = await member.authorizeMemberReview("calca");
        const chairman = await chair.authorizeChairmanApproval("calca");

        assert.equal(memberAuthority.committeeAssignmentId, "asma");
        assert.equal(chairman.committeeAssignmentId, "asca");

        await current(member, memberAuthority);
        await current(chair, chairman);
      });

      const loader = new PrincipalLoaderService(db as never);

      await t.test(
        "real database-loaded principals enforce department and object scope",
        async () => {
          const principal = await loader.loadPrincipal("member-a");
          assert.ok(principal);

          assert.equal(principal.actorId, "member-a");
          assert.equal(principal.activeDepartmentId, "da");
          assert.equal(principal.isAuthenticated, true);

          assert.ok(
            principal.roleAssignments.some(
              (role) =>
                role.userRoleId === "urma" &&
                role.departmentId === "da" &&
                role.role === PLATFORM_ROLES.TEACHER,
            ),
          );

          assert.ok(
            principal.permissions.some(
              (grant) =>
                grant.resource === "summative-examination.member-review" &&
                grant.action === "review" &&
                grant.source.userRoleId === "urma" &&
                grant.source.departmentId === "da",
            ),
          );

          const dbBacked = new SummativeCommitteeWorkflowAuthorizerService(
            db as never,
            { get: () => ({ principal }) } as never,
          );

          const authority = await dbBacked.authorizeMemberReview("calca");
          assert.equal(authority.committeeAssignmentId, "asma");
          await current(dbBacked, authority);

          await assert.rejects(
            dbBacked.authorizeMemberReview("calca2"),
            ForbiddenException,
          );

          await assert.rejects(
            dbBacked.authorizeMemberReview("calcb"),
            NotFoundException,
          );

          const foreignPrincipal = await loader.loadPrincipal("member-b");
          assert.ok(foreignPrincipal);
          assert.equal(foreignPrincipal.activeDepartmentId, "db");

          const foreignBacked = new SummativeCommitteeWorkflowAuthorizerService(
            db as never,
            { get: () => ({ principal: foreignPrincipal }) } as never,
          );

          await assert.rejects(
            foreignBacked.authorizeMemberReview("calca"),
            NotFoundException,
          );
        },
      );

      await t.test(
        "real principal loading drops revoked Teacher authority",
        async () => {
          await seed(
            "UPDATE user_roles SET revoked_at=now() WHERE id='urma'",
          );

          try {
            const principal = await loader.loadPrincipal("member-a");
            assert.ok(principal);
            assert.equal(principal.roleAssignments.length, 0);
            assert.equal(principal.permissions.length, 0);

            const revoked = new SummativeCommitteeWorkflowAuthorizerService(
              db as never,
              { get: () => ({ principal }) } as never,
            );

            await assert.rejects(
              revoked.authorizeMemberReview("calca"),
              ForbiddenException,
            );
          } finally {
            await seed(
              "UPDATE user_roles SET revoked_at=NULL WHERE id='urma'",
            );
          }
        },
      );

      await t.test(
        "real principal loading rejects disabled department and locked user",
        async () => {
          await seed(
            "UPDATE departments SET status='DISABLED' WHERE id='da'",
          );

          try {
            assert.equal(await loader.loadPrincipal("member-a"), null);
          } finally {
            await seed(
              "UPDATE departments SET status='ACTIVE' WHERE id='da'",
            );
          }

          await seed(
            "UPDATE users SET status='LOCKED' WHERE id='member-a'",
          );

          try {
            assert.equal(await loader.loadPrincipal("member-a"), null);
          } finally {
            await seed(
              "UPDATE users SET status='ACTIVE' WHERE id='member-a'",
            );
          }
        },
      );

      await t.test(
        "real workflow rejects unauthorized objects before protected writes",
        async (workflowTests) => {
          const requestContext = new RequestContextService();

          const workflow = new SummativeCommitteeWorkflowService(
            db as never,
            requestContext,
            new SummativeCommitteeWorkflowAuthorizerService(
              db as never,
              requestContext,
            ),
            new SummativeCalculatedMarkService(requestContext),
            new CourseResultCompositionService(),
          );

          const scenarios = [
            {
              name: "Member rejects foreign department",
              actor: "member-a",
              mark: "calcb",
              duty: "review",
              error: NotFoundException,
            },
            {
              name: "Member rejects another examination",
              actor: "member-a",
              mark: "calca2",
              duty: "review",
              error: ForbiddenException,
            },
            {
              name: "Chairman rejects foreign department",
              actor: "chair-a",
              mark: "calcb",
              duty: "approve",
              error: NotFoundException,
            },
            {
              name: "Chairman rejects another examination",
              actor: "chair-a",
              mark: "calca2",
              duty: "approve",
              error: ForbiddenException,
            },
            {
              name: "Member cannot exercise Chairman duty",
              actor: "member-a",
              mark: "calca",
              duty: "approve",
              error: ForbiddenException,
            },
            {
              name: "Forged department header cannot override principal",
              actor: "member-b",
              mark: "calca",
              duty: "review",
              headerDepartment: "da",
              error: NotFoundException,
            },
          ] as const;

          for (const scenario of scenarios) {
            await workflowTests.test(scenario.name, async () => {
              const principal = await loader.loadPrincipal(scenario.actor);
              assert.ok(principal);

              const beforeAudit = await db.auditLog.count();

              const requestedDepartment =
                "headerDepartment" in scenario
                  ? scenario.headerDepartment
                  : principal.activeDepartmentId;

              const attempt = requestContext.run(
                {
                  requestId: "crc_group2_negative_workflow",
                  method: "POST",
                  path: "/synthetic-service-campaign",
                  principal,
                  department: {
                    kind: "department",
                    departmentId: requestedDepartment,
                    source:
                      "headerDepartment" in scenario
                        ? "header"
                        : "principal",
                  },
                  audit: {
                    requestId: "crc_group2_negative_workflow",
                    departmentId: principal.activeDepartmentId,
                  },
                },
                () =>
                  scenario.duty === "review"
                    ? workflow.submitMemberReview(scenario.mark, {
                        outcome:
                          SummativeCommitteeMemberReviewOutcome.VERIFIED,
                      })
                    : workflow.approveAndFinalLock(scenario.mark),
              );

              await assert.rejects(attempt, scenario.error);

              assert.equal(
                await db.auditLog.count(),
                beforeAudit,
                "A rejected workflow attempt cannot create a success audit",
              );
            });
          }
        },
      );

      await t.test("foreign department object is not found", async () => {
        await assert.rejects(
          member.authorizeMemberReview("calcb"), NotFoundException,
        );
        await assert.rejects(
          foreign.authorizeMemberReview("calca"), NotFoundException,
        );
      });

      await t.test("another examination cannot borrow an appointment", async () => {
        await assert.rejects(
          member.authorizeMemberReview("calca2"), ForbiddenException,
        );
        await assert.rejects(
          other.authorizeMemberReview("calca"), ForbiddenException,
        );
        await assert.rejects(
          chair.authorizeChairmanApproval("calca2"), ForbiddenException,
        );
      });

      await t.test("cross-duty authority is denied", async () => {
        await assert.rejects(
          member.authorizeChairmanApproval("calca"), ForbiddenException,
        );
        await assert.rejects(
          chair.authorizeMemberReview("calca"), ForbiddenException,
        );
      });

      await t.test("foreign transaction scope is denied", async () => {
        await assert.rejects(
          current(member, { ...memberAuthority, departmentId: "db" }),
          ForbiddenException,
        );
        await assert.rejects(
          current(member, { ...memberAuthority, examinationId: "exa2" }),
          ForbiddenException,
        );
        await assert.rejects(
          current(member, { ...memberAuthority, candidateId: "canda2" }),
          ForbiddenException,
        );
      });

      await t.test("revoked role fails transaction revalidation", async () => {
        await seed("UPDATE user_roles SET revoked_at=now() WHERE id='urma'");
        try {
          await assert.rejects(
            current(member, memberAuthority), ForbiddenException,
          );
        } finally {
          await seed("UPDATE user_roles SET revoked_at=NULL WHERE id='urma'");
        }
      });

      await t.test("expired appointment fails transaction revalidation", async () => {
        await seed(`
          UPDATE examination_committee_assignments
          SET expires_at='2026-10-02' WHERE id='asma'
        `);
        try {
          await assert.rejects(
            current(member, memberAuthority), ForbiddenException,
          );
        } finally {
          await seed(`
            UPDATE examination_committee_assignments
            SET expires_at=NULL WHERE id='asma'
          `);
        }
      });

      await t.test("replacement cannot reuse stale authority", async () => {
        await seed(`
          UPDATE examination_committee_assignments
          SET status='INACTIVE' WHERE id='asma'
        `);
        await seed(`
          INSERT INTO examination_committee_assignments
            (id,department_id,examination_id,committee_id,
             assigned_user_id,seat,status,assigned_at)
          VALUES ('asma-new','da','exa','coma','member-a',
                  'MEMBER_1','ACTIVE','2026-10-05')
        `);

        await assert.rejects(
          current(member, memberAuthority), ForbiddenException,
        );

        const replacement = await member.authorizeMemberReview("calca");
        assert.equal(replacement.committeeAssignmentId, "asma-new");
        await current(member, replacement);
      });

      await t.test("authorizer campaign emits no success audit", async () => {
        assert.equal(await db.auditLog.count(), 0);
      });
    } finally {
      await db.$disconnect();
      try {
        if (created) {
          await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
          const remaining = await admin.$queryRaw<Array<{ n: bigint }>>`
            SELECT count(*) AS n FROM information_schema.schemata
            WHERE schema_name = ${schema}
          `;
          assert.equal(remaining[0]!.n, 0n);
        }
      } finally {
        await admin.$disconnect();
      }
    }
  },
);
