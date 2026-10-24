import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from './generated/prisma/client';
import type { AppConfig } from './config';

export class DatabaseService implements OnModuleDestroy {
  readonly prisma: PrismaClient;
  private readonly healthPool: Pool;

  constructor(config: AppConfig) {
    const connection = {
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.databaseTimeoutMs,
      query_timeout: config.databaseTimeoutMs,
      statement_timeout: config.databaseTimeoutMs,
      max: 5,
    };
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(connection, { schema: config.databaseSchema }),
    });
    this.healthPool = new Pool({ ...connection, max: 1 });
    // Idle socket errors are reflected by the next readiness request, not a crash.
    this.healthPool.on('error', () => undefined);
  }

  async checkReadiness(): Promise<void> {
    await this.healthPool.query('SELECT 1 AS ready');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.prisma.$disconnect(),
      this.healthPool.end(),
    ]);
  }
}
