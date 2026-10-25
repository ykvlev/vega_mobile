import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const PASSWORD_PARAMETERS = Object.freeze({
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 160 * 1024 * 1024,
});
export class KdfBusyError extends Error {}

/** One memory-heavy KDF at a time; no unbounded pending libuv work. */
export class BoundedKdf {
  private active = false;
  private readonly waiting: Array<() => void> = [];

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active) {
      if (this.waiting.length >= 2)
        throw new KdfBusyError('Password verification busy');
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active = true;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active = false;
    }
  }
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, PASSWORD_PARAMETERS, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

const dummySalt = Buffer.alloc(16);
const dummyKey = Buffer.alloc(64);
export const DUMMY_PASSWORD_HASH = `scrypt$131072$8$1$${dummySalt.toString('base64url')}$${dummyKey.toString('base64url')}`;

export class PasswordHasher {
  private readonly limiter = new BoundedKdf();

  hash(password: string): Promise<string> {
    return this.limiter.run(async () => {
      const salt = randomBytes(16);
      const key = await derive(password, salt);
      return `scrypt$131072$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
    });
  }

  verify(password: string, encoded: string): Promise<boolean> {
    return this.limiter.run(async () => {
      const valid =
        /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/.test(
          encoded,
        );
      const parts = valid ? encoded.split('$') : DUMMY_PASSWORD_HASH.split('$');
      const salt = Buffer.from(parts[4]!, 'base64url');
      const expected = Buffer.from(parts[5]!, 'base64url');
      const actual = await derive(password, salt);
      return timingSafeEqual(actual, expected) && valid;
    });
  }
}
