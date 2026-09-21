import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { AssessmentService } from "./application/services/assessment.service";
import { FormativeAssessmentService } from "./application/services/formative-assessment.service";
import { FormativeAssessmentController } from "./presentation/http/formative-assessment.controller";
import { ASSESSMENT_REPOSITORY } from "./domain/assessment.constants";
import { PrismaAssessmentRepository } from "./infrastructure/repositories/prisma-assessment.repository";
import { AssignmentSubmissionsController } from "./presentation/http/assignment-submissions.controller";
import { AssignmentsController } from "./presentation/http/assignments.controller";
import { QuizAttemptsController } from "./presentation/http/quiz-attempts.controller";
import { QuizzesController } from "./presentation/http/quizzes.controller";

@Module({
  imports: [AuthorizationModule, PrismaModule, RequestContextModule],
  controllers: [
    FormativeAssessmentController,
    AssignmentsController,
    AssignmentSubmissionsController,
    QuizzesController,
    QuizAttemptsController
  ],
  providers: [
    FormativeAssessmentService,
    AssessmentService,
    {
      provide: ASSESSMENT_REPOSITORY,
      useClass: PrismaAssessmentRepository
    }
  ]
})
export class AssessmentModule {}

