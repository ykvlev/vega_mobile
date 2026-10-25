import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthCredentialsSchema, EmptyQuerySchema } from '@vega/contracts';
import { AuthError } from './auth-errors';
import { AuthService, normalizeSource } from './auth-service';

interface AuthRequest {
  socket: { remoteAddress?: string };
  headers: { authorization?: string };
  rawHeaders: string[];
}

function validateQuery(query: unknown): void {
  if (!EmptyQuerySchema.safeParse(query).success)
    throw new AuthError(400, 'VALIDATION_FAILED');
}

function bearer(request: AuthRequest): string {
  let headers = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === 'authorization')
      headers += 1;
  }
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(
    request.headers.authorization ?? '',
  );
  if (headers !== 1 || !match) throw new AuthError(401, 'AUTH_REQUIRED');
  return match[1]!;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    this.auth.requireEnabled();
    validateQuery(query);
    const parsed = AuthCredentialsSchema.safeParse(body);
    if (!parsed.success) throw new AuthError(400, 'VALIDATION_FAILED');
    return this.auth.register(
      parsed.data,
      normalizeSource(request.socket.remoteAddress),
    );
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    this.auth.requireEnabled();
    validateQuery(query);
    const parsed = AuthCredentialsSchema.safeParse(body);
    if (!parsed.success) throw new AuthError(400, 'VALIDATION_FAILED');
    return this.auth.login(
      parsed.data,
      normalizeSource(request.socket.remoteAddress),
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ): Promise<void> {
    this.auth.requireEnabled();
    validateQuery(query);
    if (!EmptyQuerySchema.safeParse(body ?? {}).success)
      throw new AuthError(400, 'VALIDATION_FAILED');
    await this.auth.logout(bearer(request));
  }
}

@Controller('api/v1/me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  async me(@Query() query: unknown, @Req() request: AuthRequest) {
    this.auth.requireEnabled();
    validateQuery(query);
    return this.auth.me(bearer(request));
  }
}
