import { AuthCredentialsSchema } from '@vega/contracts';
import { loadConfig } from './config';
import { DatabaseService } from './database';
import { PasswordHasher } from './auth-password';

export function validateManagerProvision(environment: NodeJS.ProcessEnv) {
  const config = loadConfig(environment);
  if (!config.auth.enabled)
    throw new Error(
      'Demo staff provisioning requires enabled demo authentication',
    );
  const credentials = AuthCredentialsSchema.safeParse({
    phone: environment.ADMIN_PHONE,
    password: environment.ADMIN_PASSWORD,
  });
  if (!credentials.success)
    throw new Error(
      'Valid demo staff credentials must be provided through the environment',
    );
  return { config, credentials: credentials.data };
}

/** Offline-only creation: never promotes or overwrites an existing account. */
export async function provisionDemoManager(
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const { config, credentials } = validateManagerProvision(environment);
  const database = new DatabaseService(config);
  try {
    if (
      await database.prisma.user.findUnique({
        where: { phone: credentials.phone },
        select: { id: true },
      })
    ) {
      throw new Error(
        'Demo staff provisioning refused: account already exists',
      );
    }
    const passwordHash = await new PasswordHasher().hash(credentials.password);
    await database.prisma.user.create({
      data: {
        phone: credentials.phone,
        passwordHash,
        role: 'manager',
        phoneVerified: false,
      },
    });
  } catch {
    throw new Error('Demo staff provisioning refused or failed');
  } finally {
    await database.onModuleDestroy();
  }
}
