import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { TranscriptVerificationService } from "../../application/services/transcript-verification.service";
import { TRANSCRIPT_VERIFICATION_POLICY_NAMES } from "../../domain/transcript-verification.policy-names";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({ path: "transcript-versions", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class TranscriptVersionsController {
  constructor(private readonly transcriptVerificationService: TranscriptVerificationService) {}

  @Get(":id")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.VERSION_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.transcriptVerificationService.getVersion(params.id);
  }
}
