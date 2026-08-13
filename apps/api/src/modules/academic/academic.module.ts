import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";

import { AcademicService } from "./application/services/academic.service";
import { ACADEMIC_REPOSITORY } from "./domain/academic.constants";
import { PrismaAcademicRepository } from "./infrastructure/repositories/prisma-academic.repository";
import { AcademicTermsController } from "./presentation/http/academic-terms.controller";
import { AcademicYearsController } from "./presentation/http/academic-years.controller";
import { CourseOfferingsController } from "./presentation/http/course-offerings.controller";
import { CoursesController } from "./presentation/http/courses.controller";
import { CurriculumVersionsController } from "./presentation/http/curriculum-versions.controller";
import { EnrollmentsController } from "./presentation/http/enrollments.controller";
import { ProgramsController } from "./presentation/http/programs.controller";
import { StudentCurriculumAssignmentsController } from "./presentation/http/student-curriculum-assignments.controller";
import { SyllabusVersionsController } from "./presentation/http/syllabus-versions.controller";
import { TeacherAssignmentsController } from "./presentation/http/teacher-assignments.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule,
  ],
  controllers: [
    AcademicYearsController,
    AcademicTermsController,
    ProgramsController,
    CoursesController,
    CourseOfferingsController,
    CurriculumVersionsController,
    EnrollmentsController,
    StudentCurriculumAssignmentsController,
    SyllabusVersionsController,
    TeacherAssignmentsController,
  ],
  providers: [
    AcademicService,
    {
      provide: ACADEMIC_REPOSITORY,
      useClass: PrismaAcademicRepository,
    },
  ],
})
export class AcademicModule {}
