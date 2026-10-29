import { loadConfig } from './config';
import { DatabaseService } from './database';

export const DEMO_SEED_OWNER = 'vega-public-catalog-v1';
export const DEMO_CATEGORIES = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'vega-demo-clear',
    name: 'Демо: прозрачные плёнки',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'vega-demo-color',
    name: 'Демо: цветные плёнки',
  },
] as const;
export const DEMO_PRODUCTS = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    skuId: 'a3333333-3333-4333-8333-333333333333',
    article: 'DEMO-CLEAR-15',
    name: 'Демо прозрачная плёнка',
    categoryId: DEMO_CATEGORIES[0].id,
    rollLengthMm: 15000,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    skuId: 'a4444444-4444-4444-8444-444444444444',
    article: 'DEMO-COLOR-17',
    name: 'Демо цветная плёнка',
    categoryId: DEMO_CATEGORIES[1].id,
    rollLengthMm: 17000,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    skuId: 'a5555555-5555-4555-8555-555555555555',
    article: 'DEMO-COLOR-15',
    name: 'Демо сатиновая плёнка',
    categoryId: DEMO_CATEGORIES[1].id,
    rollLengthMm: 15000,
  },
] as const;

export function validateDemoSeedConfig(environment: NodeJS.ProcessEnv) {
  const config = loadConfig(environment);
  const databaseName = decodeURIComponent(
    new URL(config.databaseUrl).pathname.slice(1),
  );
  if (!/_(?:test|demo)$/.test(databaseName)) {
    throw new Error(
      'Demo seed requires a database name ending in _test or _demo',
    );
  }
  return config;
}

/** Creates only owned demo rows. Existing owned rows are left unchanged. */
export async function seedDemoCatalog(
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const config = validateDemoSeedConfig(environment);
  const database = new DatabaseService(config);
  try {
    await database.prisma.$transaction(async (tx) => {
      for (const category of DEMO_CATEGORIES) {
        const collisions = await tx.category.findMany({
          where: { OR: [{ id: category.id }, { slug: category.slug }] },
        });
        if (
          collisions.some(
            (row) => row.id !== category.id || row.slug !== category.slug,
          )
        ) {
          throw new Error(
            'Demo category identity collision; no existing rows were overwritten',
          );
        }
        if (collisions.length === 0)
          await tx.category.create({ data: category });
      }
      for (const product of DEMO_PRODUCTS) {
        const collisions = await tx.product.findMany({
          where: {
            OR: [
              { id: product.id },
              { skuId: product.skuId },
              { article: product.article },
            ],
          },
        });
        for (const row of collisions) {
          const metadata = row.metadata;
          if (
            row.id !== product.id ||
            typeof metadata !== 'object' ||
            metadata === null ||
            Array.isArray(metadata) ||
            metadata.seedOwner !== DEMO_SEED_OWNER
          ) {
            throw new Error(
              'Demo product identity collision; no existing rows were overwritten',
            );
          }
        }
        if (collisions.length === 0)
          await tx.product.create({
            data: {
              ...product,
              widthMm: 1520,
              description:
                'Демонстрационный материал для проверки каталога. Не предложение продажи и не сведения о наличии.',
              metadata: { seedOwner: DEMO_SEED_OWNER },
            },
          });
      }
    });
  } finally {
    await database.onModuleDestroy();
  }
}
