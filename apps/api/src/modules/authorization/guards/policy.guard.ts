import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PrincipalContext } from "@lexora/types";

import { DepartmentContextResolver } from "@/common/department-context/department-context.resolver";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { AUTHORIZATION_AUDIT_EVENTS } from "../domain/authorization.audit-events";
import { REQUIRE_POLICY_KEY } from "../domain/authorization.constants";
import { AuthorizationAuditService } from "../services/authorization-audit.service";
import { AuthorizationService } from "../services/authorization.service";

type PolicyRequest = {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
  principal?: PrincipalContext;
  requestContext?: unknown;
};

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly departmentContextResolver: DepartmentContextResolver,
    private readonly requestContextService: RequestContextService,
    private readonly auditService: AuthorizationAuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPolicy =
      this.reflector.getAllAndOverride<string | undefined>(REQUIRE_POLICY_KEY, [
        context.getHandler(),
        context.getClass()
      ]);

    if (!requiredPolicy) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PolicyRequest>();
    const principal = request.principal ?? null;
    const department = this.departmentContextResolver.resolve(request, principal);

    this.requestContextService.setDepartment(department);
    request.requestContext = this.requestContextService.get();

    if (!principal?.isAuthenticated || !principal.activeDepartmentId) {
      await this.logPolicyFailure(requiredPolicy, principal, department.departmentId);
      throw new ForbiddenException("Access denied by policy");
    }

    if (
      department.kind === "department" &&
      department.departmentId &&
      department.departmentId !== principal.activeDepartmentId
    ) {
      await this.logPolicyFailure(requiredPolicy, principal, department.departmentId);
      throw new ForbiddenException("Access denied by department scope");
    }

    const allowed = this.authorizationService.isAllowed(principal, requiredPolicy);

    if (!allowed) {
      await this.logPolicyFailure(requiredPolicy, principal, department.departmentId);
      throw new ForbiddenException("Access denied by policy");
    }

    return true;
  }

  private async logPolicyFailure(
    requiredPolicy: string,
    principal: PrincipalContext | null,
    departmentId: string | null
  ) {
    await this.auditService.write({
      action: AUTHORIZATION_AUDIT_EVENTS.POLICY_DENIED,
      actorId: principal?.actorId ?? "anonymous",
      actorType: principal ? "user" : "service",
      departmentId,
      targetType: "authorization_policy",
      targetId: requiredPolicy,
      outcome: "failure",
      metadata: {
        requiredPolicy
      }
    });
  }
}
