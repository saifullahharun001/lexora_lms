import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { FormativeAttendanceService } from "../../application/services/formative-attendance.service";
import { FORMATIVE_ATTENDANCE_POLICY } from "../../domain/formative-attendance.rules";
import { AttendanceCorrectionDto, AttendanceReasonDto } from "../dto/formative-attendance.dto";

@Controller({ path: "course-offerings/:offeringId/formative-attendance/enrollments/:enrollmentId", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class FormativeAttendanceController {
  constructor(private readonly service: FormativeAttendanceService) {}

  @Get() @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  read(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string) {
    return this.service.read(offering, enrollment);
  }
  @Post("calculate") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  calculate(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string) {
    return this.service.calculateVersion(offering, enrollment);
  }
  @Post("versions/:versionId/verify") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  verify(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string, @Param("versionId") version: string) {
    return this.service.transition(offering, enrollment, version, "VERIFIED");
  }
  @Post("versions/:versionId/finalise") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  finalise(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string, @Param("versionId") version: string) {
    return this.service.transition(offering, enrollment, version, "FINALISED");
  }
  @Post("versions/:versionId/lock") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  lock(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string, @Param("versionId") version: string) {
    return this.service.transition(offering, enrollment, version, "LOCKED");
  }
  @Post("versions/:versionId/reopen") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  reopen(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string, @Param("versionId") version: string, @Body() body: AttendanceReasonDto) {
    return this.service.reopen(offering, enrollment, version, body.reason);
  }
  @Post("versions/:versionId/sessions/:sessionId/corrections") @RequirePolicy(FORMATIVE_ATTENDANCE_POLICY)
  correct(@Param("offeringId") offering: string, @Param("enrollmentId") enrollment: string, @Param("versionId") version: string,
    @Param("sessionId") session: string, @Body() body: AttendanceCorrectionDto) {
    return this.service.correct(offering, enrollment, version, session, body);
  }
}
