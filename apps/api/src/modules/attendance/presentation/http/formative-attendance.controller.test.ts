import assert from "node:assert/strict";
import test from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import type { PrincipalContext } from "@lexora/types";
import { FormativeAttendanceController } from "./formative-attendance.controller";
import { FORMATIVE_ATTENDANCE_POLICY } from "../../domain/formative-attendance.rules";
import { AttendanceCorrectionDto } from "../dto/formative-attendance.dto";

test("all Attendance /5 routes keep authentication and a dedicated coordinator admission policy", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, FormativeAttendanceController), [AuthGuard, PolicyGuard]);
  for (const name of ["read", "calculate", "verify", "finalise", "lock", "reopen", "correct"]) {
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, (FormativeAttendanceController.prototype as any)[name]), FORMATIVE_ATTENDANCE_POLICY);
  }
  assert.equal("submit" in FormativeAttendanceController.prototype, false);
});
test("authoritative correction DTO rejects legacy statuses and client academic totals/scope", async () => {
  for (const status of ["PRESENT", "ABSENT"]) assert.equal((await validate(plainToInstance(AttendanceCorrectionDto, { status, reason: "Evidence reconciled" }))).length, 0);
  for (const extra of [{ status: "LATE" }, { status: "EXCUSED" }, { mark: "5" }, { percentage: 100 }, { presentCount: 10 },
    { conductedCount: 10 }, { departmentId: "other" }, { studentBatchId: "batch" }, { academicTermId: "term" }]) {
    assert.ok((await validate(plainToInstance(AttendanceCorrectionDto, { status: "PRESENT", reason: "Reason", ...extra }),
      { whitelist: true, forbidNonWhitelisted: true })).length);
  }
});
test("dedicated admission does not accept student, generic labels, or wildcard grants", () => {
  const service = new AuthorizationService();
  const principal: PrincipalContext = { actorId: "user", actorType: "user", isAuthenticated: true, activeDepartmentId: "law", roleAssignments: [], permissions: [] };
  for (const role of ["teacher", "department_admin", "student", "support", "auditor", "poe_chairman", "comprehensive_external"] as const) {
    principal.roleAssignments = [{ departmentId: "law", role, roleId: "role", userRoleId: "ur" }];
    principal.permissions = [{ resource: "*", action: "*", scope: "department", source: { departmentId: "law", roleId: "role", userRoleId: "ur" } }];
    assert.equal(service.isAllowed(principal, FORMATIVE_ATTENDANCE_POLICY), role === "teacher" || role === "department_admin");
  }
  principal.roleAssignments = [{ departmentId: "other", role: "teacher", roleId: "role", userRoleId: "ur" }];
  assert.equal(service.isAllowed(principal, FORMATIVE_ATTENDANCE_POLICY), false);
});
