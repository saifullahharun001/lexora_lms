import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { ComprehensiveExaminationService } from "../../application/services/comprehensive-examination.service";
import { ComprehensiveConfigurationDto, ComprehensiveDistributionDto, ComprehensiveMarkDto, ComprehensiveReasonDto } from "../dto/comprehensive.dto";

@Controller({ path: "examinations/:examinationId/comprehensive", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ComprehensiveExaminationController {
  constructor(private readonly service: ComprehensiveExaminationService) {}
  @Get() @RequirePolicy(P.READ)
  workspace(@Param("examinationId") id: string) { return this.service.workspace(id); }
  @Put("configuration") @RequirePolicy(P.CONFIGURE)
  configure(@Param("examinationId") id: string, @Body() body: ComprehensiveConfigurationDto) { return this.service.configure(id, body); }
  @Post("roster") @RequirePolicy(P.CONFIGURE)
  roster(@Param("examinationId") id: string) { return this.service.roster(id); }
  @Put("distribution") @RequirePolicy(P.CONFIGURE)
  distribute(@Param("examinationId") id: string, @Body() body: ComprehensiveDistributionDto) { return this.service.distribute(id, body.allocations); }
  @Get("own-marks") @RequirePolicy(P.READ)
  own(@Param("examinationId") id: string) { return this.service.workspace(id); }
  @Put("roster/:rosterId/draft") @RequirePolicy(P.MARK)
  draft(@Param("examinationId") id: string, @Param("rosterId") roster: string, @Body() body: ComprehensiveMarkDto) { return this.service.save(id, roster, body, false); }
  @Post("roster/:rosterId/submissions") @RequirePolicy(P.MARK)
  submit(@Param("examinationId") id: string, @Param("rosterId") roster: string, @Body() body: ComprehensiveMarkDto) { return this.service.save(id, roster, body, true); }
  @Get("review") @RequirePolicy(P.REVIEW)
  review(@Param("examinationId") id: string) { return this.service.workspace(id, true); }
  @Post("marks/:markId/returns") @RequirePolicy(P.REVIEW)
  returnMark(@Param("examinationId") id: string, @Param("markId") mark: string, @Body() body: ComprehensiveReasonDto) { return this.service.returnMark(id, mark, body.reason); }
  @Post("candidates/:registrationId/absence") @RequirePolicy(P.REVIEW)
  absent(@Param("examinationId") id: string, @Param("registrationId") registration: string, @Body() body: ComprehensiveReasonDto) { return this.service.absent(id, registration, body.reason); }
  @Post("finalise") @RequirePolicy(P.FINALISE)
  finalise(@Param("examinationId") id: string) { return this.service.finalise(id); }
  @Get("final-evidence") @RequirePolicy(P.READ)
  finalEvidence(@Param("examinationId") id: string) { return this.service.workspace(id, false, true); }
}
