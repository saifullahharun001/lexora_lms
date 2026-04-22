import { randomUUID } from "node:crypto";

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";

import type { RequestContext } from "@lexora/types";

import { RequestContextService } from "./request-context.service";

type HttpRequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  requestContext?: RequestContext;
  url?: string;
};

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContextService: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const requestIdHeader = request.headers?.["x-request-id"];
    const requestId =
      typeof requestIdHeader === "string" && requestIdHeader.length > 0
        ? requestIdHeader
        : randomUUID();

    const initialContext: RequestContext = {
      requestId,
      path: request.originalUrl ?? request.url ?? "/",
      method: request.method ?? "GET",
      principal: null,
      department: {
        kind: "unresolved",
        departmentId: null,
        source: "unknown"
      },
      audit: {
        requestId,
        departmentId: null,
        ipAddress: request.ip,
        userAgent:
          typeof request.headers?.["user-agent"] === "string"
            ? request.headers["user-agent"]
            : undefined
      }
    };

    return new Observable((subscriber) => {
      this.requestContextService.run(initialContext, () => {
        request.requestContext = initialContext;
        next.handle().subscribe(subscriber);
      });
    });
  }
}
