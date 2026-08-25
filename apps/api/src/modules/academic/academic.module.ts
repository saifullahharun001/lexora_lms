import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";

import { AcademicService } from "./application/services/academic.service";
import { BatchCoordinatorAssignmentService } from "./application/services/batch-coordinator-assignment.service";
import { BatchCoordinatorAuthorityService } from "./application/services/batch-coordinator-authority.service";
import { BatchCoordinatorManagementAuthorizerService } from "./application/services/batch-coordinator-management-authorizer.service";
import { BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY } from "./application/ports/batch-coordinator-assignment.repository.port";
import { ACADEMIC_REPOSITORY } from "./domain/academic.constants";
import { PrismaAcademicRepository } from "./infrastructure/repositories/prisma-academic.repository";
import { PrismaBatchCoordinatorAssignmentRepository } from "./infrastructure/repositories/prisma-batch-coordinator-assignment.repository";
import { AcademicSessionsController } from "./presentation/http/academic-sessions.controller";
import { AcademicTermsController } from "./presentation/http/academic-terms.controller";
import { AcademicYearsController } from "./presentation/http/academic-years.controller";
import { CourseOfferingsController } from "./presentation/http/course-offerings.controller";
import { CoursesController } from "./presentation/http/courses.controller";
import { CurriculumVersionsController } from "./presentation/http/curriculum-versions.controller";
import { EnrollmentsController } from "./presentation/http/enrollments.controller";
import { ProgramsController } from "./presentation/http/programs.controller";
import { StudentBatchesController } from "./presentation/http/student-batches.controller";
import { StudentCurriculumAssignmentsController } from "./presentation/http/student-curriculum-assignments.controller";
import { SyllabusVersionsController } from "./presentation/http/syllabus-versions.controller";
import { TeacherAssignmentsController } from "./presentation/http/teacher-assignments.controller";
import { BatchCoordinatorAssignmentsController } from "./presentation/http/batch-coordinator-assignments.controller";

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
    AcademicSessionsController,
    StudentBatchesController,
    ProgramsController,
    CoursesController,
    CourseOfferingsController,
    CurriculumVersionsController,
    EnrollmentsController,
    StudentCurriculumAssignmentsController,
    SyllabusVersionsController,
    TeacherAssignmentsController,
    BatchCoordinatorAssignmentsController,
  ],
  providers: [
    AcademicService,
    BatchCoordinatorAssignmentService,
    BatchCoordinatorAuthorityService,
    BatchCoordinatorManagementAuthorizerService,
    {
      provide: ACADEMIC_REPOSITORY,
      useClass: PrismaAcademicRepository,
    },
    {
      provide: BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY,
      useClass: PrismaBatchCoordinatorAssignmentRepository,
    },
  ],
  exports: [BatchCoordinatorAuthorityService],
})
export class AcademicModule {}
