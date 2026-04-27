import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { ResultProcessingService } from "./application/services/result-processing.service";
import { RESULT_PROCESSING_REPOSITORY } from "./domain/result-processing.constants";
import { PrismaResultProcessingRepository } from "./infrastructure/repositories/prisma-result-processing.repository";
import { CgpaController } from "./presentation/http/cgpa.controller";
import { GpaController } from "./presentation/http/gpa.controller";
import { GradeScalesController } from "./presentation/http/grade-scales.controller";
import { ResultAmendmentsController } from "./presentation/http/result-amendments.controller";
import { ResultPublicationsController } from "./presentation/http/result-publications.controller";
import { ResultsController } from "./presentation/http/results.controller";

@Module({
  imports: [AuthorizationModule, PrismaModule, RequestContextModule],
  controllers: [
    GradeScalesController,
    ResultsController,
    GpaController,
    CgpaController,
    ResultPublicationsController,
    ResultAmendmentsController
  ],
  providers: [
    ResultProcessingService,
    {
      provide: RESULT_PROCESSING_REPOSITORY,
      useClass: PrismaResultProcessingRepository
    }
  ]
})
export class ResultProcessingModule {}

