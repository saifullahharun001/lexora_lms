import { Controller, Get } from "@nestjs/common";

import { successResponse } from "../http/api-response";
import { RequestContextService } from "../request-context/request-context.service";

@Controller("health")
export class HealthController {
  constructor(private readonly requestContextService: RequestContextService) {}

  @Get()
  getHealth() {
    const requestId = this.requestContextService.get()?.requestId;

    return successResponse(
      {
        status: "ok",
        service: "lexora-api",
        timestamp: new Date().toISOString()
      },
      requestId
    );
  }
}
