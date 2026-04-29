import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import { TranscriptVerificationService } from "../../application/services/transcript-verification.service";
import { VerificationTokenParamDto } from "../dto/verification-token-param.dto";

@Controller({ path: "public/transcript-verification", version: "1" })
@UseGuards(ThrottlerGuard)
export class PublicTranscriptVerificationController {
  constructor(private readonly transcriptVerificationService: TranscriptVerificationService) {}

  @Get(":token")
  verify(@Param() params: VerificationTokenParamDto) {
    return this.transcriptVerificationService.verifyPublicTranscript(params.token);
  }
}
