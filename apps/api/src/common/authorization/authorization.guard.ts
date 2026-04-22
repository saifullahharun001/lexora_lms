import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PrincipalContext } from "@lexora/types";

import { DepartmentContextResolver } from "../department-context/department-context.resolver";
import { RequestContextService } from "../request-context/request-context.service";
import { REQUIRE_PERMISSIONS_KEY } from "./authorization.constants";
import { AuthorizationPolicyService } from "./authorization-policy.service";

type RequestWithPrincipal = {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
  principal?: PrincipalContext;
  requestContext?: unknown;
};

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyService: AuthorizationPolicyService,
    private readonly departmentContextResolver: DepartmentContextResolver,
    private readonly requestContextService: RequestContextService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal ?? null;
    const department = this.departmentContextResolver.resolve(request, principal);

    this.requestContextService.setPrincipal(principal);
    this.requestContextService.setDepartment(department);
    request.requestContext = this.requestContextService.get();

    if (requiredPermissions.length === 0) {
      return true;
    }

    const allowed = this.policyService.evaluate({
      principal,
      department,
      requiredPermissions
    });

    if (!allowed) {
      throw new ForbiddenException(
        "Access denied by department-scoped authorization policy"
      );
    }

    return true;
  }
}

