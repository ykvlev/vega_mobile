import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { loadConfig } from './config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isAuthPath, isAdminPath, SafeApiExceptionFilter } from './auth-errors';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.configure(config),
    {
      logger: ['error', 'warn'],
      bodyParser: false,
    },
  );
  app.use(
    (
      request: { originalUrl?: string; url: string },
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      if (isAuthPath(request.originalUrl ?? request.url))
        response.setHeader('Cache-Control', 'no-store');
      if (
        (request.originalUrl ?? request.url)
          .split('?')[0]
          ?.toLowerCase()
          .startsWith('/api/v1/media/')
      ) {
        response.setHeader('X-Content-Type-Options', 'nosniff');
      }
      next();
    },
  );
  // Rich but bounded catalog text needs more space; authentication remains 8 KiB.
  app.useBodyParser('json', {
    limit: '64kb',
    strict: true,
    type: (request: { url?: string; headers: { 'content-type'?: string } }) =>
      isAdminPath(request.url ?? '') &&
      /^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      ),
  });
  app.useBodyParser('json', { limit: '8kb', strict: true });
  app.useGlobalFilters(new SafeApiExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  console.log(
    `VEGA demo API listening on port ${config.port}; commerce disabled`,
  );
}

void main().catch(() => {
  console.error(
    'API startup failed: invalid configuration or unavailable runtime',
  );
  process.exitCode = 1;
});
