import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ClassSessionService } from "../../application/services/class-session.service";
import { CLASS_SESSION_POLICY_NAMES } from "../../domain/class-session.policy-names";
import { CreateClassSessionDto } from "../dto/create-class-session.dto";
import { ListClassSessionsQueryDto } from "../dto/list-class-sessions-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateClassSessionDto } from "../dto/update-class-session.dto";

@Controller({
  path: "class-sessions",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class ClassSessionsController {
  constructor(private readonly classSessionService: ClassSessionService) {}

  @Post()
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_CREATE)
  create(@Body() body: CreateClassSessionDto) {
    return this.classSessionService.create(body);
  }

  @Get()
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_READ)
  list(@Query() query: ListClassSessionsQueryDto) {
    return this.classSessionService.list(query);
  }

  @Get(":id")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.getById(params.id);
  }

  @Patch(":id")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_UPDATE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateClassSessionDto) {
    return this.classSessionService.update(params.id, body);
  }

  @Post(":id/activate")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_UPDATE)
  activate(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.activate(params.id);
  }

  @Post(":id/complete")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_UPDATE)
  complete(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.complete(params.id);
  }

  @Post(":id/cancel")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_CANCEL)
  cancel(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.cancel(params.id);
  }

  @Post(":id/lock")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_LOCK)
  lock(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.lock(params.id);
  }

  @Post(":id/archive")
  @RequirePolicy(CLASS_SESSION_POLICY_NAMES.RECORD_UPDATE)
  archive(@Param() params: ResourceIdParamDto) {
    return this.classSessionService.archive(params.id);
  }
}
