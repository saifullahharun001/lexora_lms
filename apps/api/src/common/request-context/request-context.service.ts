import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

import type {
  DepartmentContext,
  PrincipalContext,
  RequestContext
} from "@lexora/types";

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  setPrincipal(principal: PrincipalContext | null) {
    const current = this.get();

    if (!current) {
      return;
    }

    current.principal = principal;
  }

  setDepartment(department: DepartmentContext) {
    const current = this.get();

    if (!current) {
      return;
    }

    current.department = department;
    current.audit.departmentId = department.departmentId;
  }
}

