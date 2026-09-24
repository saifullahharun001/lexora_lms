import { AcademicModule } from "@/modules/academic/academic.module";
import { ClassSessionModule } from "@/modules/class-session/class-session.module";
import { FormativeAttendanceService } from "./application/services/formative-attendance.service";
import { FormativeAttendanceController } from "./presentation/http/formative-attendance.controller";
import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";
import { AttendanceService } from "./application/services/attendance.service";
import { ATTENDANCE_REPOSITORY } from "./domain/attendance.constants";
import { PrismaAttendanceRepository } from "./infrastructure/repositories/prisma-attendance.repository";
import { AttendanceController } from "./presentation/http/attendance.controller";

@Module({
  imports: [
    AcademicModule, ClassSessionModule,
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    FormativeAttendanceController,
    AttendanceController
  ],
  providers: [
    FormativeAttendanceService,
    AttendanceService,
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: PrismaAttendanceRepository
    }
  ]
})
export class AttendanceModule {}
