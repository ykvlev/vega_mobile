import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';

const messages: Record<string, string> = {
  VALIDATION_FAILED: 'Invalid authentication request',
  INVALID_CREDENTIALS: 'Invalid credentials',
  AUTH_REQUIRED: 'Authentication required',
  REGISTRATION_FAILED: 'Registration unavailable',
  RATE_LIMITED: 'Too many attempts',
  AUTH_UNAVAILABLE: 'Authentication unavailable',
  KDF_BUSY: 'Authentication busy',
  NOT_FOUND: 'Not found',
  PAYLOAD_TOO_LARGE: 'Request too large',
  FORBIDDEN: 'Access denied',
  VERSION_CONFLICT: 'Product changed; reload before saving',
  CONFLICT: 'Catalog identity conflict',
  ADMIN_UNAVAILABLE: 'Catalog management unavailable',
  MEDIA_UNAVAILABLE: 'Image unavailable',
  INVALID_IMAGE: 'Invalid or unsupported image',
  IMAGE_LIMIT_REACHED: 'Image limit reached',
  IMAGE_PROCESSING_BUSY: 'Image processing busy',
};

export class AuthError extends HttpException {
  constructor(
    status: number,
    code: keyof typeof messages,
    readonly retryAfter?: number,
  ) {
    super(
      { error: { code, message: messages[code] ?? messages.AUTH_UNAVAILABLE } },
      status,
    );
  }
}

export function isAuthPath(url: string): boolean {
  const path = url.split('?')[0]?.toLowerCase().replace(/\/+$/, '');
  return (
    path === '/api/v1/me' ||
    path === '/api/v1/auth' ||
    path?.startsWith('/api/v1/auth/') === true ||
    path === '/api/v1/admin' ||
    path?.startsWith('/api/v1/admin/') === true ||
    path === '/api/v1/media' ||
    path?.startsWith('/api/v1/media/') === true
  );
}

export function isAdminPath(url: string): boolean {
  const path = url.split('?')[0]?.toLowerCase().replace(/\/+$/, '');
  return (
    path === '/api/v1/admin' || path?.startsWith('/api/v1/admin/') === true
  );
}

type ErrorResponse = {
  status(status: number): ErrorResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

/** Also handles JSON parser errors: never echo body snippets or default SyntaxErrors. */
@Catch()
export class SafeApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host
      .switchToHttp()
      .getRequest<{ originalUrl?: string; url: string }>();
    const response = host.switchToHttp().getResponse<ErrorResponse>();
    if (isAuthPath(request.originalUrl ?? request.url)) {
      response.setHeader('Cache-Control', 'no-store');
      if (exception instanceof AuthError) {
        if (exception.retryAfter !== undefined)
          response.setHeader('Retry-After', String(exception.retryAfter));
        response.status(exception.getStatus()).json(exception.getResponse());
        return;
      }
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : typeof exception === 'object' &&
              exception !== null &&
              'status' in exception
            ? exception.status
            : 503;
      const safeStatus =
        status === 413
          ? 413
          : status === 400
            ? 400
            : status === 404
              ? 404
              : 503;
      const code =
        safeStatus === 413
          ? 'PAYLOAD_TOO_LARGE'
          : safeStatus === 400
            ? 'VALIDATION_FAILED'
            : safeStatus === 404
              ? 'NOT_FOUND'
              : 'AUTH_UNAVAILABLE';
      response
        .status(safeStatus)
        .json({ error: { code, message: messages[code] } });
      return;
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
    } else {
      response.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Request unavailable' },
      });
    }
  }
}
