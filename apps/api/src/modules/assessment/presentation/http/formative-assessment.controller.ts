import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { FormativeAssessmentService } from "../../application/services/formative-assessment.service";
import { FORMATIVE_POLICIES } from "../../domain/formative.policy-names";
import { AdjustFormativeMarkDto, FormativeActivityDto, FormativeMarkDto } from "../dto/formative.dto";

@Controller({ path: "course-offerings/:offeringId/formative", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class FormativeAssessmentController {
  constructor(private readonly service: FormativeAssessmentService) {}

  @Get("activities")
  @RequirePolicy(FORMATIVE_POLICIES.READ)
  list(@Param("offeringId") offeringId: string) {
    return this.service.listActivities(offeringId);
  }

  @Post("activities")
  @RequirePolicy(FORMATIVE_POLICIES.MANAGE)
  create(@Param("offeringId") offeringId: string, @Body() body: FormativeActivityDto) {
    return this.service.createActivity(offeringId, body);
  }

  @Put("activities/:activityId")
  @RequirePolicy(FORMATIVE_POLICIES.MANAGE)
  update(@Param("offeringId") offeringId: string, @Param("activityId") activityId: string, @Body() body: FormativeActivityDto) {
    return this.service.updateActivity(offeringId, activityId, body);
  }

  @Post("activities/:activityId/start-marking")
  @RequirePolicy(FORMATIVE_POLICIES.MANAGE)
  startMarking(@Param("offeringId") offeringId: string, @Param("activityId") activityId: string) {
    return this.service.startMarking(offeringId, activityId);
  }

  @Put("activities/:activityId/enrollments/:enrollmentId/mark")
  @RequirePolicy(FORMATIVE_POLICIES.MANAGE)
  mark(@Param("offeringId") offeringId: string, @Param("activityId") activityId: string,
    @Param("enrollmentId") enrollmentId: string, @Body() body: FormativeMarkDto) {
    return this.service.saveMark(offeringId, activityId, enrollmentId, body);
  }

  @Post("activities/:activityId/enrollments/:enrollmentId/adjustments")
  @RequirePolicy(FORMATIVE_POLICIES.ADJUST)
  adjust(@Param("offeringId") offeringId: string, @Param("activityId") activityId: string,
    @Param("enrollmentId") enrollmentId: string, @Body() body: AdjustFormativeMarkDto) {
    return this.service.adjustMark(offeringId, activityId, enrollmentId, body);
  }

  @Get("enrollments/:enrollmentId")
  @RequirePolicy(FORMATIVE_POLICIES.READ)
  read(@Param("offeringId") offeringId: string, @Param("enrollmentId") enrollmentId: string) {
    return this.service.read(offeringId, enrollmentId);
  }

  @Post("enrollments/:enrollmentId/submit")
  @RequirePolicy(FORMATIVE_POLICIES.SUBMIT)
  submit(@Param("offeringId") offeringId: string, @Param("enrollmentId") enrollmentId: string) {
    return this.service.submit(offeringId, enrollmentId);
  }
}
