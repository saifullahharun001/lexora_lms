import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { ExaminationRegistrationService } from "./examination-registration.service";
import { ExaminationAuthorityService } from "./examination-authority.service";
import { CandidateListDto, CandidateRegistrationDto, PoeAppointmentDto, ExternalComprehensiveAccessDto } from "./examination-registration.dto";

@Controller({ path: "examinations/:examinationId/candidate-list", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationRegistrationController {
  constructor(private readonly service: ExaminationRegistrationService) {}
  @Get() @RequirePolicy(P.CLASSIFY)
  read(@Param("examinationId") id: string) { return this.service.workspace(id); }
  @Post() @RequirePolicy(P.CLASSIFY)
  create(@Param("examinationId") id: string, @Body() body: CandidateListDto) { return this.service.createList(id, body.sourceReference); }
  @Put("candidates") @RequirePolicy(P.CLASSIFY)
  candidate(@Param("examinationId") id: string, @Body() body: CandidateRegistrationDto) { return this.service.putCandidate(id, body); }
  @Delete("candidates/:registrationId") @RequirePolicy(P.CLASSIFY)
  remove(@Param("examinationId") id: string, @Param("registrationId") candidate: string) { return this.service.removeDraftCandidate(id, candidate); }
  @Post("certify") @RequirePolicy(P.CLASSIFY)
  certify(@Param("examinationId") id: string) { return this.service.certify(id); }
}

@Controller({ path: "examination-authority", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationAuthorityController {
  constructor(private readonly service: ExaminationAuthorityService) {}
  @Post("poe-chairman-appointments") @RequirePolicy(P.APPOINT)
  appoint(@Body() body: PoeAppointmentDto) { return this.service.appointPoe(body); }
  @Post("poe-chairman-appointments/:id/revoke") @RequirePolicy(P.APPOINT)
  revoke(@Param("id") id: string) { return this.service.revokePoe(id); }
  @Post("examinations/:examinationId/external-appointments/:assignmentId/access") @RequirePolicy(P.APPOINT)
  external(@Param("examinationId") id: string, @Param("assignmentId") assignment: string, @Body() body: ExternalComprehensiveAccessDto) {
    return this.service.provisionExternal(id, assignment, body);
  }
  @Post("external-access/:id/revoke") @RequirePolicy(P.APPOINT)
  revokeExternal(@Param("id") id: string) { return this.service.revokeExternal(id); }
}
