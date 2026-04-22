import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { RequestContext } from "@lexora/types";

type RequestWithContext = {
  requestContext?: RequestContext;
};

export const CurrentRequestContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<RequestWithContext>().requestContext
);

