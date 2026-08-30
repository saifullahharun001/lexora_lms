import { SummativeQuestionConfigurationService } from "./application/services/summative-question-configuration.service";
import { SummativeQuestionConfigurationsController } from "./presentation/http/summative-question-configurations.controller";
import { SummativeCandidateRosterService } from "./application/services/summative-candidate-roster.service";
import { SummativeExaminerMarksService } from "./application/services/summative-examiner-marks.service";
import { SummativeExaminerMarksController } from "./presentation/http/summative-examiner-marks.controller";
import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";

import { ExaminationCommitteeService } from "./application/services/examination-committee.service";
import { ExaminationCourseExaminerAssignmentService } from "./application/services/examination-course-examiner-assignment.service";
import { ExaminationSetupService } from "./application/services/examination-setup.service";
import { ExaminerAuthorityService } from "./application/services/examiner-authority.service";
import { SummativeManagementAuthorizerService } from "./application/services/summative-management-authorizer.service";
import { ExaminationCoursesController } from "./presentation/http/examination-courses.controller";
import { ExaminationCommitteesController } from "./presentation/http/examination-committees.controller";
import { ExaminationCourseExaminerAssignmentsController } from "./presentation/http/examination-course-examiner-assignments.controller";
import { ExaminationsController } from "./presentation/http/examinations.controller";

@Module({
  imports: [RequestContextModule, PrismaModule, AuthorizationModule],
  controllers: [
    ExaminationsController,
    ExaminationCoursesController,
    ExaminationCommitteesController,
    ExaminationCourseExaminerAssignmentsController,
    SummativeQuestionConfigurationsController,
    SummativeExaminerMarksController,
  ],
  providers: [
    SummativeManagementAuthorizerService,
    ExaminationSetupService,
    ExaminationCommitteeService,
    ExaminationCourseExaminerAssignmentService,
    ExaminerAuthorityService,
    SummativeQuestionConfigurationService,
    SummativeCandidateRosterService,
    SummativeExaminerMarksService,
  ],
  exports: [
    ExaminationSetupService,
    ExaminationCommitteeService,
    ExaminationCourseExaminerAssignmentService,
    ExaminerAuthorityService,
    SummativeQuestionConfigurationService,
    SummativeCandidateRosterService,
    SummativeExaminerMarksService,
  ],
})
export class SummativeExaminationModule {}
