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
import { CreateAcademicTermDto } from "../dto/create-academic-term.dto";
import { ListAcademicTermsQueryDto } from "../dto/list-academic-terms-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateAcademicTermDto } from "../dto/update-academic-term.dto";

@Controller({
  path: "academic-terms",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class AcademicTermsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_TERM_MANAGE)
  create(@Body() body: CreateAcademicTermDto) {
    return this.academicService.createAcademicTerm(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_TERM_READ)
  list(@Query() query: ListAcademicTermsQueryDto) {
    return this.academicService.listAcademicTerms(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_TERM_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getAcademicTerm(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_TERM_MANAGE)
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateAcademicTermDto,
  ) {
    return this.academicService.updateAcademicTerm(params.id, body);
  }
}
