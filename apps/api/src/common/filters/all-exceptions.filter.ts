import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  /** Stable machine-readable discriminator, e.g. `KYC_REQUIRED`. */
  code?: string;
  /** Extra context a client needs to react, e.g. the caller's KYC stage. */
  stage?: string;
}

/**
 * Keys we copy verbatim out of a thrown `HttpException` body, on top of the
 * standard envelope. This is an allowlist rather than a spread on purpose: the
 * response object of a third-party or built-in exception may carry internals we
 * do not want on the wire, so a new passthrough field has to be added here
 * deliberately.
 */
const PASSTHROUGH_KEYS = ['code', 'stage'] as const;

/** Uniform error responses; hides internal detail in production. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';
    const extras: Partial<Record<(typeof PASSTHROUGH_KEYS)[number], string>> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        error = (r.error as string) ?? exception.name;
        for (const key of PASSTHROUGH_KEYS) {
          if (typeof r[key] === 'string') extras[key] = r[key] as string;
        }
      }
      error = error || exception.name;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      if (process.env.NODE_ENV !== 'production') message = exception.message;
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      ...extras,
    };

    res.status(status).json(body);
  }
}
