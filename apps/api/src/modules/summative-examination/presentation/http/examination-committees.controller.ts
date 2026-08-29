import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { ExaminationCommitteeService } from "../../application/services/examination-committee.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import {
  AppointExternalCommitteeMemberDto,
  AssignInternalCommitteeMemberDto,
  ReactivateCommitteeAssignmentDto,
  UpdateCommitteeMemberExpiryDto,
} from "./dto/committee-assignments.dto";
import {
  AssignmentIdParamDto,
  CommitteeIdParamDto,
  ExaminationIdParamDto,
} from "./dto/resource-id-param.dto";

@Controller({ path: "summative-examination-committees", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationCommitteesController {
  constructor(private readonly committeeService: ExaminationCommitteeService) {}

  @Post("examination/:examinationId")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  getOrCreateCommittee(@Param() params: ExaminationIdParamDto) {
    return this.committeeService.getOrCreateCommittee(params.examinationId);
  }

  @Get("examination/:examinationId")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  getCommitteeByExamination(@Param() params: ExaminationIdParamDto) {
    return this.committeeService.getCommitteeByExamination(
      params.examinationId,
    );
  }

  @Get(":committeeId/assignments")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  getAssignments(@Param() params: CommitteeIdParamDto) {
    return this.committeeService.getCommitteeAssignments(params.committeeId);
  }

  @Post(":committeeId/internal-assignments")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  assignInternalMember(
    @Param() params: CommitteeIdParamDto,
    @Body() body: AssignInternalCommitteeMemberDto,
  ) {
    return this.committeeService.assignInternalMember({
      committeeId: params.committeeId,
      ...body,
    });
  }

  @Post(":committeeId/external-member-appointments")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  appointExternalMember(
    @Param() params: CommitteeIdParamDto,
    @Body() body: AppointExternalCommitteeMemberDto,
  ) {
    return this.committeeService.appointExternalMember({
      committeeId: params.committeeId,
      ...body,
    });
  }

  @Post("assignments/:assignmentId/unassign")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  unassignMember(@Param() params: AssignmentIdParamDto) {
    return this.committeeService.unassignMember(params.assignmentId);
  }

  @Post("assignments/:assignmentId/reactivate")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  reactivateMember(
    @Param() params: AssignmentIdParamDto,
    @Body() body: ReactivateCommitteeAssignmentDto,
  ) {
    return this.committeeService.reactivateMember(params.assignmentId, body);
  }

  @Post("assignments/:assignmentId/archive")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  archiveMember(@Param() params: AssignmentIdParamDto) {
    return this.committeeService.archiveMember(params.assignmentId);
  }

  @Patch("assignments/:assignmentId/expiry")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.COMMITTEE_MANAGE)
  updateMemberExpiry(
    @Param() params: AssignmentIdParamDto,
    @Body() body: UpdateCommitteeMemberExpiryDto,
  ) {
    return this.committeeService.updateMemberExpiry(
      params.assignmentId,
      body.expiresAt,
    );
  }
}
