import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule.configure(config), {
    logger: ['error', 'warn'],
  });
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
