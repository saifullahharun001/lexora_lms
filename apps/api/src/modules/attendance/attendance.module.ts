import { AttendanceMarkGenerationService } from "./application/services/attendance-mark-generation.service";
import { AttendanceMarkGenerationAuthorizerService } from "./application/services/attendance-mark-generation-authorizer.service";
import { ClassSessionModule } from "@/modules/class-session/class-session.module";
import { Module } from "@nestjs/common";
import { FinalFormativeModule } from "../final-formative/final-formative.module";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";
import { AttendanceService } from "./application/services/attendance.service";
import { AttendanceCorrectionService } from "./application/services/attendance-correction.service";
import { ATTENDANCE_REPOSITORY } from "./domain/attendance.constants";
import { PrismaAttendanceRepository } from "./infrastructure/repositories/prisma-attendance.repository";
import { AttendanceController } from "./presentation/http/attendance.controller";

@Module({
  imports: [
    FinalFormativeModule,
    ClassSessionModule,
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    AttendanceController
  ],
  providers: [
    AttendanceMarkGenerationService,
    AttendanceMarkGenerationAuthorizerService,
    AttendanceCorrectionService,
    AttendanceService,
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: PrismaAttendanceRepository
    }
  ]
})
export class AttendanceModule {}
