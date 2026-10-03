import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { FORMATIVE_POLICIES } from "../../domain/formative.policy-names";
import { FormativeActivitiesFinalisationService } from "../../application/services/formative-activities-finalisation.service";

@Controller({ path: "formative/examination-courses/:examinationCourseId/activities", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class FormativeActivitiesFinalisationController {
  constructor(private readonly service: FormativeActivitiesFinalisationService) {}

  @Get("finalisation-workspace")
  @RequirePolicy(FORMATIVE_POLICIES.FINALISE)
  workspace(@Param("examinationCourseId") id: string) { return this.service.workspace(id); }

  @Post("finalise")
  @RequirePolicy(FORMATIVE_POLICIES.FINALISE)
  finalise(@Param("examinationCourseId") id: string, @Body() body?: unknown) {
    if (body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length))
      throw new BadRequestException("Activities finalisation takes no client source or authority fields");
    return this.service.finalise(id);
  }
}
