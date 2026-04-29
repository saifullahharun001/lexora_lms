import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { TranscriptVerificationService } from "../../application/services/transcript-verification.service";
import { TRANSCRIPT_VERIFICATION_POLICY_NAMES } from "../../domain/transcript-verification.policy-names";
import { CreateTranscriptDto } from "../dto/create-transcript.dto";
import { CreateVerificationTokenDto } from "../dto/create-verification-token.dto";
import { ListTranscriptVersionsQueryDto } from "../dto/list-transcript-versions-query.dto";
import { ListTranscriptsQueryDto } from "../dto/list-transcripts-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { RevokeTranscriptDto } from "../dto/revoke-transcript.dto";

@Controller({ path: "transcripts", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class TranscriptsController {
  constructor(private readonly transcriptVerificationService: TranscriptVerificationService) {}

  @Post()
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TRANSCRIPT_CREATE)
  create(@Body() body: CreateTranscriptDto) {
    return this.transcriptVerificationService.createTranscript(body);
  }

  @Get()
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TRANSCRIPT_READ)
  list(@Query() query: ListTranscriptsQueryDto) {
    return this.transcriptVerificationService.listTranscripts(query);
  }

  @Get(":id")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TRANSCRIPT_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.transcriptVerificationService.getTranscript(params.id);
  }

  @Post(":id/issue")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TRANSCRIPT_ISSUE)
  issue(@Param() params: ResourceIdParamDto) {
    return this.transcriptVerificationService.issueTranscript(params.id);
  }

  @Post(":id/revoke")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TRANSCRIPT_REVOKE)
  revoke(@Param() params: ResourceIdParamDto, @Body() body: RevokeTranscriptDto) {
    return this.transcriptVerificationService.revokeTranscript(params.id, body);
  }

  @Get(":id/versions")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.VERSION_READ)
  listVersions(
    @Param() params: ResourceIdParamDto,
    @Query() query: ListTranscriptVersionsQueryDto
  ) {
    return this.transcriptVerificationService.listVersions(params.id, query);
  }

  @Post(":id/verification-token")
  @RequirePolicy(TRANSCRIPT_VERIFICATION_POLICY_NAMES.TOKEN_CREATE)
  createVerificationToken(
    @Param() params: ResourceIdParamDto,
    @Body() body: CreateVerificationTokenDto
  ) {
    return this.transcriptVerificationService.createVerificationToken(params.id, body);
  }
}
