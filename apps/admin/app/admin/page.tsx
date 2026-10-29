import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { darkColors } from '@vega/design-tokens';
import {
  AdminApiError,
  loadWorkspace,
  parseWorkspaceQuery,
  workspaceHref,
} from './data';
import { millimetersToMeters } from './model';
import { Arrow, CategoryEditor, ProductEditor, PublicationForm } from './forms';
import { EditorGuard } from './editor-guard';
import { ProductPhotos } from './photos';
import Image from 'next/image';
import s from './admin.module.css';

export const dynamic = 'force-dynamic';

function NavIcon({
  name,
}: {
  name: 'catalog' | 'category' | 'orders' | 'integration';
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <>
        {name === 'catalog' ? (
          <>
            <rect x="3" y="3" width="7" height="7" rx="2" />
            <rect x="14" y="3" width="7" height="7" rx="2" />
            <rect x="3" y="14" width="7" height="7" rx="2" />
            <rect x="14" y="14" width="7" height="7" rx="2" />
          </>
        ) : name === 'category' ? (
          <>
            <path d="M3 7h7l2 3h9v10H3Z" />
            <path d="M3 7V4h7l2 3h9v3" />
          </>
        ) : name === 'orders' ? (
          <>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
            <path d="M9 8h6M9 12h6" />
          </>
        ) : (
          <>
            <path d="M8 8h8v8H8Z" />
            <path d="M12 2v6m0 8v6M2 12h6m8 0h6" />
          </>
        )}
      </>
    </svg>
  );
}

function Gate({
  kind,
}: {
  kind: 'guest' | 'forbidden' | 'unavailable' | 'not_found' | 'category_limit';
}) {
  return (
    <div className={s.gate}>
      <Link className={s.logo} href="/">
        VEGA<span>/ WORKSPACE</span>
      </Link>
      <main id="main" className={s.gateCard}>
        <span className={s.eyebrow}>Рабочее пространство</span>
        <h1>
          {kind === 'guest'
            ? 'Вход для сотрудников'
            : kind === 'forbidden'
              ? 'Доступ только для сотрудников'
              : kind === 'not_found'
                ? 'Товар не найден'
                : kind === 'category_limit'
                  ? 'Список категорий слишком большой'
                  : 'Не удалось открыть рабочее пространство'}
        </h1>
        <p>
          {kind === 'guest'
            ? 'Войдите в аккаунт менеджера, чтобы управлять каталогом.'
            : kind === 'forbidden'
              ? 'У этого аккаунта нет прав управления каталогом. Доступ назначается отдельно.'
              : kind === 'not_found'
                ? 'Проверьте ссылку или вернитесь к списку товаров.'
                : kind === 'category_limit'
                  ? 'Не удалось загрузить полный список категорий. Обратитесь к администратору.'
                  : 'Проверьте соединение и повторите попытку.'}
        </p>
        <Link
          className={s.primary}
          href={
            kind === 'guest' || kind === 'forbidden' ? '/account' : '/admin'
          }
        >
          {kind === 'guest'
            ? 'Войти в аккаунт'
            : kind === 'forbidden'
              ? 'Мой аккаунт'
              : 'К каталогу'}
          <Arrow />
        </Link>
      </main>
    </div>
  );
}

function Shell({
  phone,
  categories,
  children,
}: {
  phone: string;
  categories: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={s.desktop}
      style={
        {
          '--admin-bg': darkColors.canvas,
          '--admin-surface': darkColors.surface,
          '--admin-raised': darkColors.surfaceRaised,
          '--admin-text': darkColors.textPrimary,
          '--admin-muted': darkColors.textSecondary,
          '--admin-primary': darkColors.primary,
        } as CSSProperties
      }
    >
      <aside className={s.sidebar}>
        <Link
          href="/admin"
          className={s.logo}
          aria-label="VEGA, каталог управления"
        >
          VEGA<span>WORKSPACE</span>
        </Link>
        <p className={s.navCaption}>УПРАВЛЕНИЕ</p>
        <nav aria-label="Разделы управления" className={s.nav}>
          <Link
            href="/admin"
            className={!categories ? s.activeNav : ''}
            aria-current={!categories ? 'page' : undefined}
          >
            <NavIcon name="catalog" />
            Каталог
          </Link>
          <Link
            href="/admin?view=categories"
            className={categories ? s.activeNav : ''}
            aria-current={categories ? 'page' : undefined}
          >
            <NavIcon name="category" />
            Категории
          </Link>
          <span className={s.disabledNav} aria-disabled="true">
            <NavIcon name="orders" />
            Заказы<small>Позже</small>
          </span>
          <span className={s.disabledNav} aria-disabled="true">
            <NavIcon name="integration" />
            1С<small>Позже</small>
          </span>
        </nav>
        <div className={s.sidebarBottom}>
          <span className={s.connectionDot} />
          <span>
            Работа с каталогом
            <br />
            <small>Без управления остатками</small>
          </span>
        </div>
      </aside>
      <div className={s.workspace}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            Рабочее пространство<span>/</span>
            <strong>{categories ? 'Категории' : 'Каталог'}</strong>
          </div>
          <Link href="/account" className={s.manager}>
            <span className={s.avatar}>М</span>
            <span>
              <strong>{phone}</strong>
              <small>Менеджер</small>
            </span>
          </Link>
        </header>
        <main id="main" className={s.content}>
          {children}
        </main>
        <footer className={s.footer}>
          VEGA / Управление каталогом
          <span>Тестовая среда · без реальных продаж</span>
        </footer>
      </div>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseWorkspaceQuery(await searchParams);
  const safeQuery = query ?? {
    view: 'products' as const,
    limit: 20,
    newProduct: false,
  };
  let data: Awaited<ReturnType<typeof loadWorkspace>>;
  try {
    data = await loadWorkspace(safeQuery);
  } catch (error) {
    const kind =
      error instanceof AdminApiError &&
      ['guest', 'forbidden', 'not_found', 'category_limit'].includes(error.kind)
        ? (error.kind as 'guest' | 'forbidden' | 'not_found' | 'category_limit')
        : 'unavailable';
    return <Gate kind={kind} />;
  }
  const categoryName = (id: string) =>
    data.categories.items.find((category) => category.id === id)?.name ??
    'Другая категория';
  const categoryView = safeQuery.view === 'categories';
  const editorView = safeQuery.newProduct || Boolean(safeQuery.edit);
  return (
    <Shell phone={data.user.phone} categories={categoryView}>
      {!query ? (
        <section className={s.emptyState}>
          <h1>Проверьте параметры страницы</h1>
          <p>Откройте каталог заново и повторите поиск.</p>
          <Link className={s.primary} href="/admin">
            К каталогу
            <Arrow />
          </Link>
        </section>
      ) : editorView ? (
        <>
          <Link href="/admin" className={s.backLink}>
            ← Назад к каталогу
          </Link>
          <div className={s.pageHeader}>
            <div>
              <p className={s.eyebrow}>
                {safeQuery.newProduct
                  ? 'Каталог / создание'
                  : `Каталог / ${data.editing?.article ?? ''}`}
              </p>
              <h1>
                {safeQuery.newProduct ? 'Новый товар' : 'Редактирование товара'}
              </h1>
              <p className={s.subtitle}>
                Содержание карточки, размеры и публикация.
              </p>
            </div>
            {data.editing && (
              <span
                className={data.editing.isPublished ? s.published : s.draft}
              >
                <i />
                {data.editing.isPublished ? 'Опубликован' : 'Черновик'}
              </span>
            )}
          </div>
          <EditorGuard
            key={
              data.editing
                ? `${data.editing.id}:${data.editing.version}`
                : 'new'
            }
          >
            <div className={s.editorLayout}>
              <div className={s.editorPanel}>
                <ProductEditor
                  key={
                    data.editing
                      ? `${data.editing.id}:${data.editing.version}`
                      : 'new'
                  }
                  product={data.editing}
                  categories={data.categories.items}
                />
                <ProductPhotos product={data.editing} />
              </div>
              <aside className={s.publicationPanel}>
                <span className={s.eyebrow}>Видимость</span>
                <h2>Публикация</h2>
                <p>
                  {data.editing?.isPublished
                    ? 'Карточка видна в публичном каталоге.'
                    : 'Черновик доступен только сотрудникам.'}
                </p>
                {data.editing ? (
                  <>
                    <dl className={s.editorMeta}>
                      <div>
                        <dt>Статус</dt>
                        <dd>
                          {data.editing.isPublished
                            ? 'Опубликован'
                            : 'Черновик'}
                        </dd>
                      </div>
                      <div>
                        <dt>Версия</dt>
                        <dd>{data.editing.version}</dd>
                      </div>
                    </dl>
                    <PublicationForm
                      key={`${data.editing.id}:${data.editing.version}`}
                      product={data.editing}
                    />
                  </>
                ) : (
                  <p className={s.panelNote}>
                    Сначала сохраните черновик. После этого можно опубликовать
                    карточку.
                  </p>
                )}
              </aside>
            </div>
          </EditorGuard>
        </>
      ) : categoryView ? (
        <>
          <div className={s.pageHeader}>
            <div>
              <p className={s.eyebrow}>Структура ассортимента</p>
              <h1>Категории</h1>
              <p className={s.subtitle}>
                Организуйте товары так, чтобы их было проще найти.
              </p>
            </div>
          </div>
          <div className={s.categoryLayout}>
            <section className={s.tablePanel}>
              <div className={s.panelHeader}>
                <h2>Список категорий</h2>
                <span>{data.categories.items.length} в списке</span>
              </div>
              {data.categories.items.length ? (
                <div className={s.tableScroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Категория</th>
                        <th>Код</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categories.items.map((category) => (
                        <tr key={category.id}>
                          <td>
                            <span className={s.categorySymbol}>
                              <NavIcon name="category" />
                            </span>
                            <strong>{category.name}</strong>
                          </td>
                          <td className={s.mono}>{category.slug}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={s.emptyState}>
                  <h2>Категорий пока нет</h2>
                  <p>Создайте первую категорию в форме рядом.</p>
                </div>
              )}
            </section>
            <CategoryEditor
              key={data.categories.items
                .map((category) => category.id)
                .join(',')}
            />
          </div>
        </>
      ) : (
        <>
          <div className={s.pageHeader}>
            <div>
              <p className={s.eyebrow}>Ассортимент VEGA</p>
              <h1>Каталог товаров</h1>
              <p className={s.subtitle}>
                Материалы, характеристики и публикация в приложении.
              </p>
            </div>
            <Link href="/admin?new=product" className={s.primary}>
              <span aria-hidden="true" className={s.plus}>
                +
              </span>
              Создать товар
            </Link>
          </div>
          <div className={s.stats}>
            <div>
              <span>На этой странице</span>
              <strong>
                {data.products.items.length}
                <small>товаров</small>
              </strong>
              <p>С учётом текущих фильтров</p>
            </div>
            <div>
              <span>
                <i className={s.greenDot} />
                Опубликовано
              </span>
              <strong>
                {
                  data.products.items.filter((product) => product.isPublished)
                    .length
                }
                <small>на странице</small>
              </strong>
              <p>Карточки доступны в каталоге</p>
            </div>
            <div>
              <span>
                <i className={s.grayDot} />
                Черновики
              </span>
              <strong>
                {
                  data.products.items.filter((product) => !product.isPublished)
                    .length
                }
                <small>на странице</small>
              </strong>
              <p>Видны только сотрудникам</p>
            </div>
          </div>
          <section className={s.tablePanel}>
            <div className={s.panelHeader}>
              <div>
                <h2>Все товары</h2>
                <p>Редактируйте карточки и управляйте их видимостью.</p>
              </div>
              <span className={s.liveMark}>
                <i />
                Публичные карточки
              </span>
            </div>
            <form
              action="/admin"
              method="get"
              className={s.filters}
              key={JSON.stringify([
                query.q,
                query.categoryId,
                query.status,
                query.cursor,
                query.limit,
              ])}
              aria-label="Фильтры товаров"
            >
              <label className={s.searchField}>
                <span className={s.srOnly}>Поиск по названию или артикулу</span>
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="7" />
                  <path d="m15 15 6 6" />
                </svg>
                <input
                  type="search"
                  name="q"
                  maxLength={128}
                  defaultValue={query.q ?? ''}
                  placeholder="Название или артикул"
                />
              </label>
              <label>
                <span className={s.srOnly}>Категория</span>
                <select
                  aria-label="Категория"
                  name="categoryId"
                  defaultValue={query.categoryId ?? ''}
                >
                  <option value="">Все категории</option>
                  {data.categories.items.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={s.srOnly}>Статус</span>
                <select
                  aria-label="Статус"
                  name="status"
                  defaultValue={query.status ?? ''}
                >
                  <option value="">Все статусы</option>
                  <option value="published">Опубликован</option>
                  <option value="draft">Черновик</option>
                </select>
              </label>
              <input type="hidden" name="limit" value={query.limit} />
              <button type="submit" className={s.filterSubmit}>
                Найти
              </button>
              <a href={`/admin?limit=${query.limit}`} className={s.reset}>
                Сбросить
              </a>
            </form>
            {data.products.items.length ? (
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Категория</th>
                      <th>Размер рулона</th>
                      <th>Статус</th>
                      <th>
                        <span className={s.srOnly}>Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.items.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <div className={s.productName}>
                            <span className={s.productThumb} aria-hidden="true">
                              {product.images[0] ? (
                                <Image
                                  src={product.images[0].url}
                                  alt=""
                                  width={44}
                                  height={48}
                                  unoptimized
                                  className={s.tablePhoto}
                                />
                              ) : (
                                <i />
                              )}
                            </span>
                            <span>
                              <strong>{product.name}</strong>
                              <small>{product.article}</small>
                            </span>
                          </div>
                        </td>
                        <td>{categoryName(product.categoryId)}</td>
                        <td>
                          <span className={s.dimension}>
                            {millimetersToMeters(product.rollLengthMm)} м
                            <small>{product.widthMm} мм</small>
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              product.isPublished ? s.published : s.draft
                            }
                          >
                            <i />
                            {product.isPublished ? 'Опубликован' : 'Черновик'}
                          </span>
                        </td>
                        <td>
                          <Link
                            className={s.editLink}
                            href={workspaceHref(query, { edit: product.id })}
                            aria-label={`Редактировать ${product.name}`}
                          >
                            <svg
                              width="19"
                              height="19"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z" />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={s.emptyState}>
                <NavIcon name="catalog" />
                <h2>Товары не найдены</h2>
                <p>Измените фильтры или создайте новую карточку.</p>
                <Link className={s.secondary} href="/admin?new=product">
                  Создать товар
                </Link>
              </div>
            )}
            <div className={s.tableFooter}>
              <span>
                Показано {data.products.items.length} товаров
                {data.products.nextCursor ? ' · есть следующая страница' : ''}
              </span>
              <nav aria-label="Страницы товаров">
                {query.cursor && (
                  <Link
                    href={workspaceHref(query, {
                      cursor: undefined,
                      edit: undefined,
                    })}
                  >
                    К первой странице
                  </Link>
                )}
                {data.products.nextCursor && (
                  <Link
                    href={workspaceHref(query, {
                      cursor: data.products.nextCursor,
                      edit: undefined,
                    })}
                  >
                    Следующая страница
                    <Arrow />
                  </Link>
                )}
              </nav>
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
