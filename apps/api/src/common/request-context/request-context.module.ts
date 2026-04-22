import { Global, Module } from "@nestjs/common";

import { RequestContextInterceptor } from "./request-context.interceptor";
import { RequestContextService } from "./request-context.service";

@Global()
@Module({
  providers: [RequestContextService, RequestContextInterceptor],
  exports: [RequestContextService, RequestContextInterceptor]
})
export class RequestContextModule {}

