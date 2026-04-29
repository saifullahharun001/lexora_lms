import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { TranscriptVerificationService } from "../../application/services/transcript-verification.service";
import { TRANSCRIPT_VERIFICATION_POLICY_NAMES } from "../../domain/transcript-verification.policy-names";
import { CreateTranscriptSealDto } from "../dto/create-transcript-seal.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateTranscriptSealDto } from "../dto/update-transcript-seal.dto";

@Controller({ path: "transcript-seals", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class TranscriptSealsController {
  constructor(private readonly transcriptVerificationService: TranscriptVerificationService) {}

  @Post()
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.SEAL_MANAGE)
  create(@Body() body: CreateTranscriptSealDto) {
    return this.transcriptVerificationService.createSeal(body);
  }

  @Get()
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.SEAL_READ)
  list() {
    return this.transcriptVerificationService.listSeals();
  }

  @Patch(":id")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.SEAL_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateTranscriptSealDto) {
    return this.transcriptVerificationService.updateSeal(params.id, body);
  }
}
