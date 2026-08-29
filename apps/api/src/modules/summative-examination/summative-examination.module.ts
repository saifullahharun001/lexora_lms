import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";

import { ExaminationCommitteeService } from "./application/services/examination-committee.service";
import { ExaminationSetupService } from "./application/services/examination-setup.service";
import { SummativeManagementAuthorizerService } from "./application/services/summative-management-authorizer.service";
import { ExaminationCoursesController } from "./presentation/http/examination-courses.controller";
import { ExaminationCommitteesController } from "./presentation/http/examination-committees.controller";
import { ExaminationsController } from "./presentation/http/examinations.controller";

@Module({
  imports: [RequestContextModule, PrismaModule, AuthorizationModule],
  controllers: [
    ExaminationsController,
    ExaminationCoursesController,
    ExaminationCommitteesController,
  ],
  providers: [
    SummativeManagementAuthorizerService,
    ExaminationSetupService,
    ExaminationCommitteeService,
  ],
  exports: [ExaminationSetupService, ExaminationCommitteeService],
})
export class SummativeExaminationModule {}
