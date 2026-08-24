import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateStudentBatchDto } from "../dto/create-student-batch.dto";
import { ListStudentBatchesQueryDto } from "../dto/list-student-batches-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateStudentBatchDto } from "../dto/update-student-batch.dto";

@Controller({ path: "student-batches", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class StudentBatchesController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.STUDENT_BATCH_MANAGE)
  create(@Body() body: CreateStudentBatchDto) {
    return this.academicService.createStudentBatch(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.STUDENT_BATCH_READ)
  list(@Query() query: ListStudentBatchesQueryDto) {
    return this.academicService.listStudentBatches(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.STUDENT_BATCH_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getStudentBatch(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.STUDENT_BATCH_MANAGE)
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateStudentBatchDto,
  ) {
    return this.academicService.updateStudentBatch(params.id, body);
  }
}
