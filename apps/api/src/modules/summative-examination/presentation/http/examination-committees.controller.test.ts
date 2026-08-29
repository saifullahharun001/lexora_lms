import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { ExaminationCommitteesController } from "./examination-committees.controller";

test("Committee routes require authentication, PolicyGuard, and exact Committee management policy", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, ExaminationCommitteesController),
    "summative-examination-committees",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, ExaminationCommitteesController),
    [AuthGuard, PolicyGuard],
  );
  const prototype = ExaminationCommitteesController.prototype;
  const routes = [
    ["getOrCreateCommittee", "examination/:examinationId", RequestMethod.POST],
    [
      "getCommitteeByExamination",
      "examination/:examinationId",
      RequestMethod.GET,
    ],
    ["getAssignments", ":committeeId/assignments", RequestMethod.GET],
    [
      "assignInternalMember",
      ":committeeId/internal-assignments",
      RequestMethod.POST,
    ],
    [
      "appointExternalMember",
      ":committeeId/external-member-appointments",
      RequestMethod.POST,
    ],
    ["unassignMember", "assignments/:assignmentId/unassign", RequestMethod.POST],
    [
      "reactivateMember",
      "assignments/:assignmentId/reactivate",
      RequestMethod.POST,
    ],
    ["archiveMember", "assignments/:assignmentId/archive", RequestMethod.POST],
    [
      "updateMemberExpiry",
      "assignments/:assignmentId/expiry",
      RequestMethod.PATCH,
    ],
  ] as const;
  for (const [method, path, requestMethod] of routes) {
    const handler = prototype[method];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
    assert.equal(
      Reflect.getMetadata(REQUIRE_POLICY_KEY, handler),
      SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE,
    );
  }
});

test("GET-by-Examination forwards examinationId to the examination-scoped service operation", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        async (...args: unknown[]) => {
          calls.push([property, ...args]);
          return args;
        },
    },
  );
  const controller = new ExaminationCommitteesController(service as never);
  await controller.getCommitteeByExamination({ examinationId: "exam-a" });
  assert.deepEqual(calls, [["getCommitteeByExamination", "exam-a"]]);
});

test("internal and external write routes forward distinct caller-controlled fields", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        async (...args: unknown[]) => {
          calls.push([property, ...args]);
          return args;
        },
    },
  );
  const controller = new ExaminationCommitteesController(service as never);
  await controller.assignInternalMember(
    { committeeId: "committee-a" },
    { assignedUserId: "user-a", seat: "MEMBER_1" },
  );
  await controller.appointExternalMember(
    { committeeId: "committee-a" },
    {
      externalMemberName: "Professor External",
      externalMemberAffiliation: "Another Public University",
    },
  );
  assert.deepEqual(calls, [
    [
      "assignInternalMember",
      {
        committeeId: "committee-a",
        assignedUserId: "user-a",
        seat: "MEMBER_1",
      },
    ],
    [
      "appointExternalMember",
      {
        committeeId: "committee-a",
        externalMemberName: "Professor External",
        externalMemberAffiliation: "Another Public University",
      },
    ],
  ]);
});
