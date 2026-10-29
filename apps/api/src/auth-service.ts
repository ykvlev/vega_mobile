import { createHash, createHmac, randomBytes } from 'node:crypto';
import { AuthUserSchema, type AuthCredentials } from '@vega/contracts';
import type { AppConfig } from './config';
import type { Prisma } from './generated/prisma/client';
import { DatabaseService } from './database';
import { AuthError } from './auth-errors';
import {
  DUMMY_PASSWORD_HASH,
  KdfBusyError,
  PasswordHasher,
} from './auth-password';

export const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const AUTH_LIMITS = Object.freeze({
  login: { seconds: 900, source: 20, phone: 5 },
  register: { seconds: 3600, source: 3, phone: 3 },
});
export function normalizeSource(address: string | undefined): string {
  return address?.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '') ?? 'unknown';
}
export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
type SessionUser = {
  id: string;
  phone: string;
  role: string;
  phoneVerified: boolean;
};

export class AuthService {
  private readonly hasher = new PasswordHasher();
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  requireEnabled(): void {
    if (!this.config.auth.enabled) throw new AuthError(404, 'NOT_FOUND');
  }

  private async limited(
    action: 'login' | 'register',
    phone: string,
    source: string,
  ): Promise<void> {
    this.requireEnabled();
    if (!this.config.auth.enabled) return;
    const secret = this.config.auth.rateLimitSecret;
    const limits = AUTH_LIMITS[action];
    const table = `"${this.config.databaseSchema}"."AuthRateLimit"`;
    const outcome = await this.database.prisma.$transaction(async (tx) => {
      const clock = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      const now = clock[0]!.now;
      const start = new Date(
        Math.floor(now.getTime() / (limits.seconds * 1000)) *
          limits.seconds *
          1000,
      );
      const end = new Date(start.getTime() + limits.seconds * 1000);
      // Indexed, bounded cleanup; no caller-controlled SQL identifiers or values.
      await tx.$executeRawUnsafe(
        `DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE "windowEnds" < $1 ORDER BY "windowEnds" LIMIT 100 FOR UPDATE SKIP LOCKED)`,
        new Date(now.getTime() - 86400000),
      );
      for (const [kind, identity, maximum] of [
        ['source', source, limits.source],
        ['phone', phone, limits.phone],
      ] as const) {
        const scope = `${action}:${kind}`;
        const keyHash = createHmac('sha256', secret)
          .update(`${scope}\0${identity}`)
          .digest('hex');
        const rows = await tx.$queryRawUnsafe<Array<{ attempts: number }>>(
          `INSERT INTO ${table} AS bucket ("scope","keyHash","windowStart","windowEnds","attempts") VALUES ($1,$2,$3,$4,1) ON CONFLICT ("scope","keyHash","windowStart") DO UPDATE SET "attempts"=LEAST(bucket."attempts" + 1,$5) RETURNING "attempts"`,
          scope,
          keyHash,
          start,
          end,
          maximum + 1,
        );
        if (rows[0]!.attempts > maximum)
          return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
      }
      return undefined;
    });
    if (outcome !== undefined)
      throw new AuthError(429, 'RATE_LIMITED', outcome);
  }

  private async session(
    user: SessionUser,
    client: Prisma.TransactionClient = this.database.prisma,
  ) {
    const token = randomBytes(32).toString('base64url');
    const rows = await client.$queryRaw<
      Array<{ now: Date }>
    >`SELECT clock_timestamp() AS now`;
    const createdAt = rows[0]!.now;
    const expiresAt = new Date(
      createdAt.getTime() + AUTH_SESSION_TTL_SECONDS * 1000,
    );
    await client.authSession.create({
      data: {
        userId: user.id,
        tokenHash: tokenDigest(token),
        createdAt,
        expiresAt,
      },
    });
    return {
      user: AuthUserSchema.parse(user),
      session: { token, expiresAt: expiresAt.toISOString() },
    };
  }

  private safeFailure(error: unknown): never {
    if (error instanceof AuthError) throw error;
    if (error instanceof KdfBusyError) throw new AuthError(503, 'KDF_BUSY', 1);
    throw new AuthError(503, 'AUTH_UNAVAILABLE');
  }

  async register(credentials: AuthCredentials, source: string) {
    try {
      await this.limited('register', credentials.phone, source);
      const passwordHash = await this.hasher.hash(credentials.password);
      try {
        return await this.database.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              phone: credentials.phone,
              passwordHash,
              role: 'customer',
              phoneVerified: false,
            },
            select: { id: true, phone: true, role: true, phoneVerified: true },
          });
          return this.session(user, tx);
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          throw new AuthError(409, 'REGISTRATION_FAILED');
        }
        throw error;
      }
    } catch (error) {
      this.safeFailure(error);
    }
  }

  async login(credentials: AuthCredentials, source: string) {
    try {
      await this.limited('login', credentials.phone, source);
      const user = await this.database.prisma.user.findUnique({
        where: { phone: credentials.phone },
      });
      const valid = await this.hasher.verify(
        credentials.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );
      if (!user || !valid) throw new AuthError(401, 'INVALID_CREDENTIALS');
      return await this.session({
        id: user.id,
        phone: user.phone,
        role: user.role,
        phoneVerified: user.phoneVerified,
      });
    } catch (error) {
      this.safeFailure(error);
    }
  }

  private async findSession(token: string, includeRevoked: boolean) {
    this.requireEnabled();
    try {
      const rows = await this.database.prisma.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      const session = await this.database.prisma.authSession.findUnique({
        where: { tokenHash: tokenDigest(token) },
        include: {
          user: {
            select: { id: true, phone: true, role: true, phoneVerified: true },
          },
        },
      });
      if (
        !session ||
        (!includeRevoked && session.revokedAt !== null) ||
        session.expiresAt <= rows[0]!.now
      )
        throw new AuthError(401, 'AUTH_REQUIRED');
      return session;
    } catch (error) {
      this.safeFailure(error);
    }
  }

  async requireManager(token: string) {
    const session = await this.findSession(token, false);
    if (session.user.role !== 'manager') throw new AuthError(403, 'FORBIDDEN');
    return AuthUserSchema.parse(session.user);
  }

  async me(token: string) {
    const session = await this.findSession(token, false);
    return { user: AuthUserSchema.parse(session.user) };
  }

  async logout(token: string): Promise<void> {
    const session = await this.findSession(token, true);
    try {
      await this.database.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (error) {
      this.safeFailure(error);
    }
  }
}
