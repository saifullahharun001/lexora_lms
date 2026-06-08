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
import { CreateAcademicYearDto } from "../dto/create-academic-year.dto";
import { ListAcademicYearsQueryDto } from "../dto/list-academic-years-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateAcademicYearDto } from "../dto/update-academic-year.dto";

@Controller({
  path: "academic-years",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class AcademicYearsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_YEAR_MANAGE)
  create(@Body() body: CreateAcademicYearDto) {
    return this.academicService.createAcademicYear(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_YEAR_READ)
  list(@Query() query: ListAcademicYearsQueryDto) {
    return this.academicService.listAcademicYears(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_YEAR_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getAcademicYear(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_YEAR_MANAGE)
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateAcademicYearDto,
  ) {
    return this.academicService.updateAcademicYear(params.id, body);
  }
}
