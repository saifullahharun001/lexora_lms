export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
  };
}

export function successResponse<T>(
  data: T,
  requestId?: string
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId
    }
  };
}

