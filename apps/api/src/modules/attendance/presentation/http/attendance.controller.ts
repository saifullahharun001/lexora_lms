import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AttendanceService } from "../../application/services/attendance.service";
import { ATTENDANCE_POLICY_NAMES } from "../../domain/attendance.policy-names";
import { CreateAttendanceImportBatchDto } from "../dto/create-attendance-import-batch.dto";
import { CreateAttendanceRecordDto } from "../dto/create-attendance-record.dto";
import { ListAttendanceImportBatchesQueryDto } from "../dto/list-attendance-import-batches-query.dto";
import { ListAttendanceRecordsQueryDto } from "../dto/list-attendance-records-query.dto";
import { OverrideAttendanceRecordDto } from "../dto/override-attendance-record.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({
  path: "attendance",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post("import-batches")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.IMPORT_BATCH_CREATE)
  createImportBatch(@Body() body: CreateAttendanceImportBatchDto) {
    return this.attendanceService.createImportBatch({
      courseOfferingId: body.courseOfferingId,
      classSessionId: body.classSessionId,
      sourceType: body.sourceType,
      externalSystemName: body.externalSystemName,
      externalBatchRef: body.externalBatchRef,
      importWindowStartAt: body.importWindowStartAt,
      importWindowEndAt: body.importWindowEndAt,
      validationSummaryJson: body.validationSummaryJson as Prisma.InputJsonValue | undefined
    });
  }

  @Get("import-batches")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.IMPORT_BATCH_READ)
  listImportBatches(@Query() query: ListAttendanceImportBatchesQueryDto) {
    return this.attendanceService.listImportBatches(query);
  }

  @Get("import-batches/:id")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.IMPORT_BATCH_READ)
  getImportBatch(@Param() params: ResourceIdParamDto) {
    return this.attendanceService.getImportBatch(params.id);
  }

  @Post("import-batches/:id/cancel")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.IMPORT_BATCH_CANCEL)
  cancelImportBatch(@Param() params: ResourceIdParamDto) {
    return this.attendanceService.cancelImportBatch(params.id);
  }

  @Post("records")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.RECORD_CAPTURE)
  createRecord(@Body() body: CreateAttendanceRecordDto) {
    return this.attendanceService.captureAttendance({
      classSessionId: body.classSessionId,
      enrollmentId: body.enrollmentId,
      studentUserId: body.studentUserId,
      status: body.status,
      sourceType: body.sourceType,
      externalSourceRef: body.externalSourceRef,
      sourcePayloadJson: body.sourcePayloadJson as Prisma.InputJsonValue | undefined
    });
  }

  @Get("records")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.RECORD_READ)
  listRecords(@Query() query: ListAttendanceRecordsQueryDto) {
    return this.attendanceService.listAttendanceRecords(query);
  }

  @Get("records/:id")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.RECORD_READ)
  getRecord(@Param() params: ResourceIdParamDto) {
    return this.attendanceService.getAttendanceRecord(params.id);
  }

  @Get("me")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.RECORD_READ)
  listMine(@Query() query: ListAttendanceRecordsQueryDto) {
    return this.attendanceService.listMyAttendanceRecords({
      courseOfferingId: query.courseOfferingId,
      classSessionId: query.classSessionId,
      status: query.status,
      limit: query.limit,
      offset: query.offset
    });
  }

  @Patch("records/:id/override")
  @RequirePolicy(ATTENDANCE_POLICY_NAMES.RECORD_OVERRIDE)
  overrideRecord(@Param() params: ResourceIdParamDto, @Body() body: OverrideAttendanceRecordDto) {
    return this.attendanceService.overrideAttendance(params.id, body);
  }
}
