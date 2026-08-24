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
import { CreateAcademicSessionDto } from "../dto/create-academic-session.dto";
import { ListAcademicSessionsQueryDto } from "../dto/list-academic-sessions-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateAcademicSessionDto } from "../dto/update-academic-session.dto";

@Controller({ path: "academic-sessions", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class AcademicSessionsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_MANAGE)
  create(@Body() body: CreateAcademicSessionDto) {
    return this.academicService.createAcademicSession(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_READ)
  list(@Query() query: ListAcademicSessionsQueryDto) {
    return this.academicService.listAcademicSessions(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getAcademicSession(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_MANAGE)
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateAcademicSessionDto,
  ) {
    return this.academicService.updateAcademicSession(params.id, body);
  }
}
