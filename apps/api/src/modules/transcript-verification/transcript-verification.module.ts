import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { TranscriptVerificationService } from "./application/services/transcript-verification.service";
import { TRANSCRIPT_VERIFICATION_REPOSITORY } from "./domain/transcript-verification.constants";
import { PrismaTranscriptVerificationRepository } from "./infrastructure/repositories/prisma-transcript-verification.repository";
import { PublicTranscriptVerificationController } from "./presentation/http/public-transcript-verification.controller";
import { TranscriptSealsController } from "./presentation/http/transcript-seals.controller";
import { TranscriptVersionsController } from "./presentation/http/transcript-versions.controller";
import { TranscriptsController } from "./presentation/http/transcripts.controller";

@Module({
  imports: [AuthorizationModule, PrismaModule, RequestContextModule],
  controllers: [
    TranscriptsController,
    TranscriptVersionsController,
    PublicTranscriptVerificationController,
    TranscriptSealsController
  ],
  providers: [
    TranscriptVerificationService,
    {
      provide: TRANSCRIPT_VERIFICATION_REPOSITORY,
      useClass: PrismaTranscriptVerificationRepository
    }
  ]
})
export class TranscriptVerificationModule {}
