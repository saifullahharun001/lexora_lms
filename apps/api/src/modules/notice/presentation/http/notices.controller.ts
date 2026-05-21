import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { NoticeService } from "../../application/services/notice.service";
import { NOTICE_POLICY_NAMES } from "../../domain/notice.policy-names";
import { CreateNoticeDto } from "../dto/create-notice.dto";
import { ListNoticesQueryDto } from "../dto/list-notices-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateNoticeDto } from "../dto/update-notice.dto";

@Controller({
  path: "notices",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class NoticesController {
  constructor(private readonly noticeService: NoticeService) {}

  @Post()
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_MANAGE)
  create(@Body() body: CreateNoticeDto) {
    return this.noticeService.create(body);
  }

  @Get()
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_READ)
  list(@Query() query: ListNoticesQueryDto) {
    return this.noticeService.list(query);
  }

  @Get("me")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_SELF_READ)
  listMine(@Query() query: ListNoticesQueryDto) {
    return this.noticeService.listMyNotices(query);
  }

  @Get("me/:id")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_SELF_READ)
  getMine(@Param() params: ResourceIdParamDto) {
    return this.noticeService.getMyNotice(params.id);
  }

  @Get(":id")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.noticeService.getById(params.id);
  }

  @Patch(":id")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateNoticeDto) {
    return this.noticeService.update(params.id, body);
  }

  @Post(":id/publish")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_PUBLISH)
  publish(@Param() params: ResourceIdParamDto) {
    return this.noticeService.publish(params.id);
  }

  @Post(":id/archive")
  @RequirePolicy(NOTICE_POLICY_NAMES.NOTICE_ARCHIVE)
  archive(@Param() params: ResourceIdParamDto) {
    return this.noticeService.archive(params.id);
  }
}
