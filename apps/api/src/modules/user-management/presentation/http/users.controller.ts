import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { UserManagementService } from "../../application/services/user-management.service";
import { USER_MANAGEMENT_POLICY_NAMES } from "../../domain/user-management.policy-names";
import { CreateManagedUserDto } from "../dto/create-managed-user.dto";
import { UpdateManagedUserStatusDto } from "../dto/update-managed-user-status.dto";
import { UserIdParamDto } from "../dto/user-id-param.dto";

@Controller({
  path: "users",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class UsersController {
  constructor(private readonly userManagementService: UserManagementService) {}

  @Get()
  @RequirePolicy(USER_MANAGEMENT_POLICY_NAMES.USER_READ)
  list() {
    return this.userManagementService.listUsers();
  }

  @Post()
  @RequirePolicy(USER_MANAGEMENT_POLICY_NAMES.USER_MANAGE)
  create(@Body() body: CreateManagedUserDto) {
    return this.userManagementService.createUser({
      email: body.email,
      displayName: body.displayName,
      roleCode: body.roleCode,
      temporaryPassword: body.temporaryPassword,
      status: body.status
    });
  }

  @Get(":id")
  @RequirePolicy(USER_MANAGEMENT_POLICY_NAMES.USER_READ)
  getById(@Param() params: UserIdParamDto) {
    return this.userManagementService.getUser(params.id);
  }

  @Patch(":id/status")
  @RequirePolicy(USER_MANAGEMENT_POLICY_NAMES.USER_MANAGE)
  updateStatus(
    @Param() params: UserIdParamDto,
    @Body() body: UpdateManagedUserStatusDto
  ) {
    return this.userManagementService.updateUserStatus(params.id, {
      status: body.status
    });
  }
}
