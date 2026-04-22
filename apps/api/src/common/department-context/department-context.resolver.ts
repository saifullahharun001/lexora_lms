import { Injectable } from "@nestjs/common";

import type { DepartmentContext, PrincipalContext } from "@lexora/types";

type HttpRequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
};

@Injectable()
export class DepartmentContextResolver {
  resolve(
    request: HttpRequestLike,
    principal: PrincipalContext | null
  ): DepartmentContext {
    const path = request.originalUrl ?? request.url ?? "/";

    if (path.startsWith("/api/public/verification")) {
      return {
        kind: "public_verification",
        departmentId: null,
        source: "public"
      };
    }

    if (principal?.activeDepartmentId) {
      return {
        kind: "department",
        departmentId: principal.activeDepartmentId,
        source: "principal"
      };
    }

    const departmentHeader = request.headers?.["x-department-id"];

    if (typeof departmentHeader === "string" && departmentHeader.length > 0) {
      return {
        kind: "department",
        departmentId: departmentHeader,
        source: "header"
      };
    }

    return {
      kind: "unresolved",
      departmentId: null,
      source: "unknown"
    };
  }
}

