import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ApiErrorCode, ApiErrorEnvelope } from '@vits/shared-types';
import type { Request, Response } from 'express';

export class VitsHttpException extends HttpException {
  readonly vitsCode: ApiErrorCode;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string[] | string | number | boolean>,
  ) {
    super({ code, message, details }, status);
    this.vitsCode = code;
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? 'corr-server-fallback';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Unexpected internal server error.';
    let details: Record<string, string[] | string | number | boolean> | undefined;

    if (exception instanceof VitsHttpException) {
      status = exception.getStatus();
      code = exception.vitsCode;
      const body = exception.getResponse() as {
        message?: string;
        details?: Record<string, string[] | string | number | boolean>;
      };
      message = body.message ?? exception.message;
      details = body.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (status === 400) {
        code = 'VALIDATION_ERROR';
      } else if (status === 401) {
        code = 'AUTH_TOKEN_EXPIRED';
      } else if (status === 403) {
        code = 'AUTH_INSUFFICIENT_ROLE';
      } else if (status === 404) {
        code = 'RESOURCE_NOT_FOUND';
      } else if (status === 429) {
        code = 'RATE_LIMITED';
      }
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as { message?: string | string[] };
        if (Array.isArray(obj.message)) {
          message = obj.message.join('; ');
          details = { validation: obj.message };
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        }
      }
    }

    const envelope: ApiErrorEnvelope = {
      error: {
        code,
        message,
        correlationId,
        timestamp: new Date().toISOString(),
        ...(details ? { details } : {}),
      },
    };

    res.setHeader('X-Correlation-Id', correlationId);
    res.status(status).json(envelope);
  }
}
