import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { productMediaPaths } from '../media-url';
import { darkColors } from '@vega/design-tokens';
import {
  CatalogReadError,
  catalogHref,
  getCategories,
  getProduct,
  getProducts,
  parseCatalogQuery,
} from './data';
import s from './catalog.module.css';

export const dynamic = 'force-dynamic';

function ArrowOut() {
  return (
    <svg
      className={s.arrowIcon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      className={s.lab}
      style={
        {
          '--lab-bg': darkColors.canvas,
          '--lab-surface': darkColors.surface,
          '--lab-text': darkColors.textPrimary,
          '--lab-muted': darkColors.textSecondary,
        } as CSSProperties
      }
    >
      <div className={s.inner}>
        <header className={s.header}>
          <span className={s.brand}>
            VEGA<span> / LAB</span>
          </span>
          <Link className={s.exit} href="/">
            К приложению <ArrowOut />
          </Link>
        </header>
        <main id="main">
          <p className={s.badge}>Тестовый каталог · демонстрационная БД</p>
          {children}
        </main>
        <footer className={s.footer}>
          Только чтение публичного каталога. Продажи и оплата не подключены.
        </footer>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.notice} aria-labelledby="notice-title">
      <span className={s.noticeIcon} aria-hidden="true">
        <ArrowOut />
      </span>
      <h2 id="notice-title">{title}</h2>
      <p>{children}</p>
      <Link className={s.button} href="/catalog-lab">
        Открыть каталог заново
      </Link>
    </section>
  );
}

function dimension(value: string, type: 'length' | 'width'): string {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return `${value} мм`;
  return type === 'length'
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(number / 1000)} м`
    : `${new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(number)} мм`;
}

export default async function CatalogLab({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseCatalogQuery(await searchParams);
  if (!query)
    return (
      <Frame>
        <h1 className={s.title}>Каталог.</h1>
        <Notice title="Проверьте параметры поиска">
          Используйте название до 128 символов, одну категорию и корректную
          ссылку страницы.
        </Notice>
      </Frame>
    );

  const [categoryResult, productResult, detailResult] =
    await Promise.allSettled([
      getCategories(),
      getProducts(query),
      query.selected ? getProduct(query.selected) : Promise.resolve(null),
    ]);
  if (
    categoryResult.status === 'rejected' ||
    productResult.status === 'rejected'
  ) {
    const error =
      categoryResult.status === 'rejected'
        ? categoryResult.reason
        : productResult.status === 'rejected'
          ? productResult.reason
          : null;
    const configurationMissing =
      error instanceof CatalogReadError && error.reason === 'configuration';
    return (
      <Frame>
        <h1 className={s.title}>Каталог.</h1>
        <Notice
          title={
            configurationMissing
              ? 'Источник каталога не подключён'
              : 'Каталог временно недоступен'
          }
        >
          {configurationMissing
            ? 'Для этого тестового экрана ещё не настроено серверное подключение. Демонстрационные данные не подставляются вместо ответа.'
            : 'Не удалось получить проверенные данные. Попробуйте ещё раз позже.'}
        </Notice>
      </Frame>
    );
  }
  const categories = categoryResult.value;
  const products = productResult.value;
  const selected =
    detailResult.status === 'fulfilled' ? detailResult.value : null;
  const detailMissing =
    detailResult.status === 'rejected' &&
    detailResult.reason instanceof CatalogReadError &&
    detailResult.reason.reason === 'not_found';
  const categoryName = (id: string) =>
    categories.items.find((category) => category.id === id)?.name ??
    'Категория не указана в этом списке';

  return (
    <Frame>
      <div className={s.heading}>
        <p className={s.eyebrow}>Публичные данные / только чтение</p>
        <h1 className={s.title}>Каталог.</h1>
        <p>
          Товары из тестового API. Без коммерческих данных и действий покупки.
        </p>
      </div>
      <form
        key={JSON.stringify([
          query.q ?? '',
          query.categoryId ?? '',
          query.cursor ?? '',
          query.limit,
        ])}
        action="/catalog-lab"
        method="get"
        className={s.searchForm}
        aria-label="Поиск в каталоге"
      >
        <label className={s.searchLabel}>
          Название или артикул
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={128}
            placeholder="Например, Graphite"
          />
        </label>
        <label className={s.categoryLabel}>
          Категория
          <select name="categoryId" defaultValue={query.categoryId ?? ''}>
            <option value="">Все категории</option>
            {categories.items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="limit" value={query.limit} />
        <button className={s.button} type="submit">
          Найти
        </button>
        <a className={s.reset} href={`/catalog-lab?limit=${query.limit}`}>
          Сбросить
        </a>
      </form>
      {categories.nextCursor && (
        <p className={s.caption}>
          В фильтре показаны первые 100 категорий. Полный список требует
          отдельного просмотра.
        </p>
      )}

      {query.selected && (
        <section className={s.detail} aria-labelledby="selected-product-title">
          <Link
            className={s.back}
            href={catalogHref(query, { selected: undefined })}
          >
            ← Вернуться к списку
          </Link>
          {selected ? (
            <>
              <p className={s.eyebrow}>
                {categoryName(selected.categoryId)} / {selected.article}
              </p>
              <h2 id="selected-product-title">{selected.name}</h2>
              {productMediaPaths(selected.media).length > 0 && (
                <div className={s.photoGallery} aria-label="Фотографии товара">
                  {productMediaPaths(selected.media).map((path, index) => (
                    <Image
                      key={path}
                      src={path}
                      width={640}
                      height={480}
                      unoptimized
                      alt={`${selected.name} — фото ${index + 1}`}
                    />
                  ))}
                </div>
              )}
              <p className={s.description}>
                {selected.description || 'Описание пока не добавлено.'}
              </p>
              <dl className={s.specs}>
                <div>
                  <dt>Артикул</dt>
                  <dd>{selected.article}</dd>
                </div>
                <div>
                  <dt>Категория</dt>
                  <dd>{categoryName(selected.categoryId)}</dd>
                </div>
                <div>
                  <dt>Длина рулона</dt>
                  <dd>{dimension(selected.rollLengthMm, 'length')}</dd>
                </div>
                <div>
                  <dt>Ширина</dt>
                  <dd>{dimension(selected.widthMm, 'width')}</dd>
                </div>
                {Object.entries(selected.characteristics).map(
                  ([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
                )}
              </dl>
              <p className={s.caption}>
                Публичная карточка демонстрационного товара. Здесь нельзя
                оформить заказ.
              </p>
            </>
          ) : (
            <>
              <h2 id="selected-product-title">
                {detailMissing
                  ? 'Товар не найден'
                  : 'Карточка временно недоступна'}
              </h2>
              <p className={s.description}>
                {detailMissing
                  ? 'Товар мог быть удалён из тестовой базы. Выберите другой в списке.'
                  : 'Не удалось получить проверенную карточку. Остальные результаты поиска доступны ниже.'}
              </p>
            </>
          )}
        </section>
      )}

      <div className={s.listHeading}>
        <h2>Результаты поиска</h2>
        <span>{products.items.length} на этой странице</span>
      </div>
      {products.items.length ? (
        <ul className={s.grid} aria-label="Товары каталога">
          {products.items.map((product) => (
            <li key={product.id}>
              <Link
                className={s.card}
                href={catalogHref(query, { selected: product.id })}
                aria-label={`Открыть ${product.name}`}
              >
                {productMediaPaths(product.media)[0] ? (
                  <Image
                    className={s.cardPhoto}
                    src={productMediaPaths(product.media)[0]!}
                    width={640}
                    height={480}
                    unoptimized
                    alt={`${product.name} — фото`}
                  />
                ) : (
                  <div className={s.materialArt} aria-hidden="true">
                    <span />
                    <i />
                  </div>
                )}
                <span className={s.article}>{product.article}</span>
                <h3>{product.name}</h3>
                <span className={s.categoryName}>
                  {categoryName(product.categoryId)}
                </span>
                <dl className={s.dimensions}>
                  <div>
                    <dt>Рулон</dt>
                    <dd>{dimension(product.rollLengthMm, 'length')}</dd>
                  </div>
                  <div>
                    <dt>Ширина</dt>
                    <dd>{dimension(product.widthMm, 'width')}</dd>
                  </div>
                </dl>
                <span className={s.cardAction}>
                  Подробнее <ArrowOut />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className={s.empty} aria-labelledby="empty-title">
          <h2 id="empty-title">Ничего не найдено</h2>
          <p>Измените название, артикул или категорию.</p>
          <a className={s.button} href={`/catalog-lab?limit=${query.limit}`}>
            Сбросить поиск
          </a>
        </section>
      )}
      <nav className={s.pagination} aria-label="Страницы каталога">
        {query.cursor && (
          <Link
            className={s.reset}
            href={catalogHref(query, {
              cursor: undefined,
              selected: undefined,
            })}
          >
            К первой странице
          </Link>
        )}
        {products.nextCursor && (
          <Link
            className={s.button}
            href={catalogHref(query, {
              cursor: products.nextCursor,
              selected: undefined,
            })}
          >
            Следующая страница →
          </Link>
        )}
      </nav>
    </Frame>
  );
}
