import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable
} from "@nestjs/common";

import type { ApiErrorResponse } from "./api-response";
import { RequestContextService } from "../request-context/request-context.service";

type ResponseLike = {
  status(code: number): ResponseLike;
  json(payload: ApiErrorResponse): void;
};

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly requestContextService: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<ResponseLike>();
    const context = this.requestContextService.get();
    const requestId = context?.requestId;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : "Unexpected server error";

    response.status(status).json({
      success: false,
      error: {
        code:
          exception instanceof HttpException
            ? exception.name
            : "InternalServerError",
        message
      },
      meta: {
        requestId
      }
    });
  }
}

