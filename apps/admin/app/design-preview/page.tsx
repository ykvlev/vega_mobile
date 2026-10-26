'use client';

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { darkColors, radii, spacing } from '@vega/design-tokens';
import { demoProducts, type DemoPublicProduct } from './fixtures';
import s from './preview.module.css';

type Tab = 'home' | 'catalog' | 'studio' | 'cart' | 'profile';
type Unit = 'meter' | 'roll';
type Selection = {
  lineId: string;
  productId: string;
  unit: Unit;
  quantity: number;
};

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    catalog: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    studio: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7Z" />
        <path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5" />
      </>
    ),
    cart: (
      <>
        <path d="M6 7h15l-2 9H8L5 3H2" />
        <circle cx="9" cy="21" r="1" />
        <circle cx="18" cy="21" r="1" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    back: (
      <>
        <path d="M19 12H5m6-6-6 6 6 6" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    check: (
      <>
        <path d="m4 12 5 5L20 6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.arrow}
    </svg>
  );
}

function Car({
  color = '#70777a',
  className = '',
}: {
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      viewBox="0 0 760 390"
      role="img"
      aria-label="Авторская схематичная модель автомобиля, вид сбоку"
    >
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="0.18" y2="1">
          <stop stopColor="#e2e6e3" />
          <stop offset=".25" stopColor={color} />
          <stop offset=".7" stopColor={color} />
          <stop offset="1" stopColor="#171a1a" />
        </linearGradient>
        <linearGradient id={`${id}glass`} x2="1" y2="1">
          <stop stopColor="#3c4549" />
          <stop offset=".65" stopColor="#101719" />
          <stop offset="1" stopColor="#5b6261" />
        </linearGradient>
        <linearGradient id={`${id}side`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f3f5f4" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="392" cy="324" rx="315" ry="15" fill="#000" opacity=".7" />
      <path
        d="M68 271 91 234 191 209 278 133Q298 117 331 117H458Q486 119 510 142L581 208 665 229Q690 237 699 261L707 294 687 311H82L62 294Z"
        fill={`url(#${id}body)`}
        stroke="#b0b6b4"
        strokeOpacity=".45"
        strokeWidth="2"
      />
      <path
        d="m214 208 78-66q10-8 30-8h126q20 0 33 13l64 61Z"
        fill={`url(#${id}glass)`}
        stroke="#979f9d"
        strokeWidth="2"
      />
      <path d="m366 133-9 75m91-74 16 74" stroke="#424b4b" strokeWidth="10" />
      <path
        d="m202 220 360 2 96 23-455 9Z"
        fill={`url(#${id}side)`}
        opacity=".7"
      />
      <path
        d="m203 220-14 65m173-65-3 64m202-64 16 64M210 285h346"
        stroke="#252c2c"
        strokeOpacity=".7"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M281 231h25m119 0h25"
        stroke="#d2d5d3"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="m74 268 57-10-9 14-47 7m578-32 35 9 4 13-43-10" fill="#eff4de" />
      <path
        d="m89 284 30-5m542 1 29 6M281 303h229"
        stroke="#080b0c"
        strokeWidth="7"
      />
      {[195, 580].map((x) => (
        <g key={x}>
          <circle cx={x} cy="293" r="56" fill="#0a0b0c" />
          <circle
            cx={x}
            cy="293"
            r="39"
            fill="#383e40"
            stroke="#a9afb0"
            strokeWidth="2"
          />
          <circle cx={x} cy="293" r="29" fill="#14181a" />
          {Array.from({ length: 8 }, (_, n) => (
            <path
              key={n}
              d={`M${x} 266v18`}
              stroke="#9ca3a5"
              strokeWidth="5"
              transform={`rotate(${n * 45} ${x} 293)`}
            />
          ))}
          <circle cx={x} cy="293" r="9" fill="#a6adad" />
        </g>
      ))}
      <path
        d="m113 214 61-9m430 8 38 9"
        stroke="#d6dad7"
        strokeOpacity=".5"
        strokeWidth="2"
      />
      <rect x="665" y="273" width="26" height="9" rx="1" fill="#dedfd7" />
      <text
        x="678"
        y="280"
        textAnchor="middle"
        fontSize="6"
        fill="#111"
        fontFamily="Arial"
      >
        VEGA
      </text>
    </svg>
  );
}

function Film({
  product,
  compact = false,
}: {
  product: DemoPublicProduct;
  compact?: boolean;
}) {
  return (
    <div
      className={`${s.film} ${compact ? s.filmCompact : ''}`}
      style={{ '--film': product.color } as CSSProperties}
      aria-hidden="true"
    >
      <div className={s.filmSheet} />
      <div className={s.filmRoll}>
        <span>VEGA</span>
      </div>
      <div className={s.filmEnd} />
    </div>
  );
}

export default function DesignPreview() {
  const [tab, setTab] = useState<Tab>('home');
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [product, setProduct] = useState<DemoPublicProduct | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [unit, setUnit] = useState<Unit>('meter');
  const [quantity, setQuantity] = useState('1');
  const [selection, setSelection] = useState<Selection[]>([]);
  const [material, setMaterial] = useState(demoProducts[0]);
  const [announcement, setAnnouncement] = useState('');
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const removeControls = useRef(new Map<string, HTMLButtonElement>());
  const emptySelectionControl = useRef<HTMLButtonElement>(null);
  const selectionFocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    const destination = selectionFocus.current;
    if (destination === null) return;
    selectionFocus.current = null;
    const control =
      destination === 'empty'
        ? emptySelectionControl.current
        : removeControls.current.get(destination);
    (control ?? heading.current)?.focus();
  }, [selection]);

  // Move focus in the navigation commit, before the next keyboard action can
  // target a link. A deferred animation frame could steal that link's focus.
  useLayoutEffect(() => {
    if (navigationVersion === 0) return;
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigationVersion]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: 'Главная', icon: 'home' },
    { id: 'catalog', label: 'Каталог', icon: 'catalog' },
    { id: 'studio', label: '3D', icon: 'studio' },
    { id: 'cart', label: 'Корзина', icon: 'cart' },
    { id: 'profile', label: 'Профиль', icon: 'profile' },
  ];

  function navigate(next: Tab) {
    setTab(next);
    setProduct(null);
    setAnnouncement('');
    setNavigationVersion((version) => version + 1);
  }

  function openProduct(next: DemoPublicProduct) {
    setProduct(next);
    setUnit('meter');
    setQuantity('1');
    setAnnouncement('');
    setNavigationVersion((version) => version + 1);
  }

  function addSelection() {
    if (!product) return;
    const value = Number(quantity);
    if (
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      (unit === 'meter' && value > 18)
    )
      return;
    const lineId = `${product.id}:${unit}`;
    setSelection((current) => {
      const existing = current.find((line) => line.lineId === lineId);
      return existing
        ? current.map((line) =>
            line.lineId === lineId ? { ...line, quantity: value } : line,
          )
        : [
            ...current,
            { lineId, productId: product.id, unit, quantity: value },
          ];
    });
    setAnnouncement('Добавлено в подбор');
  }

  function removeSelection(lineId: string, name: string) {
    const index = selection.findIndex((line) => line.lineId === lineId);
    selectionFocus.current =
      selection[index + 1]?.lineId ?? selection[index - 1]?.lineId ?? 'empty';
    setSelection((current) => current.filter((line) => line.lineId !== lineId));
    setAnnouncement(`Удалено из подбора: ${name}`);
  }

  const visibleProducts = demoProducts.filter(
    (item) =>
      (category === 'Все' || item.category === category) &&
      `${item.name} ${item.article}`
        .toLocaleLowerCase('ru')
        .includes(query.toLocaleLowerCase('ru').trim()),
  );
  const quantityValid =
    Number(quantity) > 0 &&
    Number.isSafeInteger(Number(quantity)) &&
    (unit === 'roll' || Number(quantity) <= 18);

  function ProductCard({ item }: { item: DemoPublicProduct }) {
    return (
      <button
        className={s.productCard}
        onClick={() => openProduct(item)}
        aria-label={`Открыть ${item.name}`}
      >
        <div className={s.productVisual}>
          <Film product={item} compact />
          <span className={s.surfaceTag}>{item.finish}</span>
        </div>
        <span className={s.productMeta}>
          {item.category} <span>{item.article}</span>
        </span>
        <strong>{item.name.replace(/^VEGA(?:\s+·)?\s+/, '')}</strong>
        <span className={s.productFooter}>
          Рулон {item.rollLengthM} м<Icon name="plus" size={18} />
        </span>
      </button>
    );
  }

  return (
    <div
      className={s.preview}
      style={
        {
          '--preview-bg': darkColors.canvas,
          '--preview-card': darkColors.surface,
          '--preview-raised': darkColors.surfaceRaised,
          '--preview-text': darkColors.textPrimary,
          '--preview-muted': darkColors.textSecondary,
          '--preview-primary': darkColors.primary,
          '--preview-radius': `${radii.card}px`,
          '--preview-gap': `${spacing.md}px`,
        } as CSSProperties
      }
    >
      <div className={s.prototypeBar}>
        <span className={s.prototypeDot} />
        Дизайн-прототип · демонстрационные товары
      </div>
      <div className={s.shell}>
        <header className={s.header}>
          <button
            className={s.brand}
            onClick={() => navigate('home')}
            aria-label="VEGA, на главную"
          >
            VEGA<span>®</span>
          </button>
          <span className={s.headerCaption}>ЦВЕТ. ФОРМА. ХАРАКТЕР.</span>
          <button
            className={s.roundButton}
            onClick={() => navigate('profile')}
            aria-label="Открыть профиль"
          >
            <Icon name="profile" />
          </button>
        </header>
        <main id="main" className={s.main}>
          {product ? (
            <>
              <button
                className={s.backButton}
                onClick={() => navigate('catalog')}
              >
                <Icon name="back" size={18} />
                Назад в каталог
              </button>
              <div className={s.detailGrid}>
                <div className={s.detailVisual}>
                  <span className={s.surfaceTag}>Образец цвета</span>
                  <Film product={product} />
                  <span className={s.visualCaption}>
                    Демонстрационный материал
                  </span>
                </div>
                <section className={s.detailInfo}>
                  <p className={s.eyebrow}>
                    {product.category} / {product.article}
                  </p>
                  <h1 ref={heading} tabIndex={-1}>
                    {product.name}
                  </h1>
                  <p className={s.muted}>
                    Выберите формат для визуального подбора. Это пример
                    карточки, а не предложение к покупке.
                  </p>
                  <div className={s.specs}>
                    <span>
                      Рулон <strong>{product.rollLengthM} м</strong>
                    </span>
                    <span>
                      Ширина <strong>{product.widthMm} мм</strong>
                    </span>
                    <span>
                      Цвет <strong>{product.colorName}</strong>
                    </span>
                    <span>
                      Поверхность <strong>{product.finish}</strong>
                    </span>
                  </div>
                  <p className={s.lockedInfo}>
                    <Icon name="profile" size={18} />
                    Цены и наличие — после одобрения менеджером.
                  </p>
                  <div className={s.segmented} aria-label="Формат подбора">
                    <button
                      aria-pressed={unit === 'meter'}
                      onClick={() => {
                        setUnit('meter');
                        setQuantity('1');
                      }}
                    >
                      Метры
                    </button>
                    <button
                      aria-pressed={unit === 'roll'}
                      onClick={() => {
                        setUnit('roll');
                        setQuantity('1');
                      }}
                    >
                      Рулоны
                    </button>
                  </div>
                  {unit === 'meter' ? (
                    <fieldset className={s.meterChoices}>
                      <legend>Длина отреза</legend>
                      <div>
                        {Array.from(
                          { length: 18 },
                          (_, index) => index + 1,
                        ).map((meters) => (
                          <button
                            key={meters}
                            type="button"
                            aria-pressed={quantity === String(meters)}
                            onClick={() => setQuantity(String(meters))}
                          >
                            {meters} м
                          </button>
                        ))}
                      </div>
                      <p className={s.finePrint}>
                        Локальный подбор метража. Наличие отрезов здесь не
                        проверяется; в рабочем каталоге оно доступно после
                        одобрения менеджером и проверки 1С.
                      </p>
                    </fieldset>
                  ) : (
                    <label className={s.quantityLabel}>
                      Количество рулонов
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </label>
                  )}
                  <button
                    className={s.primaryButton}
                    onClick={addSelection}
                    disabled={!quantityValid}
                  >
                    Добавить в подбор
                    <Icon name="plus" />
                  </button>
                  <button
                    className={s.textButton}
                    onClick={() => {
                      setMaterial(product);
                      navigate('studio');
                    }}
                  >
                    Посмотреть цвет на автомобиле
                    <Icon name="arrow" size={18} />
                  </button>
                  <p className={s.finePrint}>
                    Только локальный подбор. Ничего не резервируется. Цвет на
                    экране условный.
                  </p>
                </section>
              </div>
            </>
          ) : tab === 'home' ? (
            <>
              <section className={s.hero}>
                {!heroImageFailed && (
                  <Image
                    src="/design-preview/vega-concept-hero.png"
                    alt="Авторская визуальная концепция автомобиля в графитовом цвете"
                    className={s.heroPhoto}
                    fill
                    sizes="(max-width: 700px) 100vw, 1060px"
                    unoptimized
                    preload
                    onError={() => setHeroImageFailed(true)}
                  />
                )}
                <div className={s.heroShade} aria-hidden="true" />
                <div className={s.heroTop}>
                  <span className={s.eyebrow}>Плёнки VEGA</span>
                  <span className={s.outlineTag}>Ваша следующая форма</span>
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  Другой цвет.
                  <br />
                  <span>Ваш характер.</span>
                </h1>
                <p className={s.heroDescription}>
                  Найдите свой оттенок.
                  <br />
                  Соберите новый образ автомобиля.
                </p>
                {heroImageFailed && (
                  <Car className={s.heroCar} color="#77817c" />
                )}
                <div className={s.heroBottom}>
                  <button
                    className={s.whiteButton}
                    onClick={() => navigate('catalog')}
                  >
                    Выбрать плёнку
                    <Icon name="arrow" size={20} />
                  </button>
                  <span className={s.heroFootnote}>
                    Авторская иллюстрация
                    <br />
                    Цветовая концепция
                  </span>
                </div>
              </section>
              <div className={s.sectionHeading}>
                <div>
                  <p className={s.eyebrow}>Найдите своё</p>
                  <h2>Начнём с цвета.</h2>
                </div>
                <button
                  className={s.roundButton}
                  onClick={() => navigate('catalog')}
                  aria-label="Перейти в каталог"
                >
                  <Icon name="arrow" />
                </button>
              </div>
              <div className={s.homeCategories}>
                <button
                  className={s.categoryFeature}
                  onClick={() => {
                    setCategory('Прозрачная');
                    navigate('catalog');
                  }}
                >
                  <div className={s.clearSculpture} aria-hidden="true" />
                  <span className={s.eyebrow}>01 / Прозрачная плёнка</span>
                  <strong>
                    Сохранить
                    <br />
                    оригинал.
                  </strong>
                  <span className={s.categoryArrow}>
                    <Icon name="arrow" />
                  </span>
                </button>
                <button
                  className={`${s.categoryFeature} ${s.colorCategory}`}
                  onClick={() => {
                    setCategory('Color');
                    navigate('catalog');
                  }}
                >
                  <div className={s.colorSculpture} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className={s.eyebrow}>02 / VEGA Color</span>
                  <strong>
                    Изменить
                    <br />
                    настроение.
                  </strong>
                  <span className={s.categoryArrow}>
                    <Icon name="arrow" />
                  </span>
                </button>
              </div>
              <div className={s.sectionHeading}>
                <div>
                  <p className={s.eyebrow}>Палитра</p>
                  <h2>Ближе к вашему.</h2>
                </div>
                <button
                  className={s.textButton}
                  onClick={() => {
                    setCategory('Все');
                    navigate('catalog');
                  }}
                >
                  Все цвета
                  <Icon name="arrow" size={18} />
                </button>
              </div>
              <div className={s.productGrid}>
                {demoProducts.slice(0, 3).map((item) => (
                  <ProductCard key={item.id} item={item} />
                ))}
              </div>
              <section className={s.studioCallout}>
                <div>
                  <p className={s.eyebrow}>Цветовая студия</p>
                  <h2>
                    Сначала
                    <br />
                    представьте.
                  </h2>
                  <button
                    className={s.whiteButton}
                    onClick={() => navigate('studio')}
                  >
                    Примерить цвет
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
                <Car className={s.calloutCar} color="#a58c79" />
              </section>
            </>
          ) : tab === 'catalog' ? (
            <>
              <div className={s.pageHeading}>
                <p className={s.eyebrow}>Материал для вашего проекта</p>
                <h1 ref={heading} tabIndex={-1}>
                  Каталог.
                </h1>
                <p className={s.muted}>Выберите оттенок. Рассмотрите детали.</p>
              </div>
              <label className={s.search}>
                <Icon name="search" />
                <span className={s.srOnly}>Поиск по названию или артикулу</span>
                <input
                  type="search"
                  placeholder="Название или артикул"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Очистить поиск"
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </label>
              <div className={s.filters} aria-label="Категории">
                {['Все', 'Прозрачная', 'Color', 'Ultima'].map((item) => (
                  <button
                    key={item}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className={s.resultsHeading}>
                <span>{visibleProducts.length} демонстрационных образцов</span>
                <span>Длина рулона — в карточке</span>
              </div>
              {visibleProducts.length ? (
                <div className={s.productGrid}>
                  {visibleProducts.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className={s.emptyState}>
                  <Icon name="search" size={32} />
                  <h2>Ничего не нашлось</h2>
                  <p>Попробуйте другое название или категорию.</p>
                  <button
                    className={s.whiteButton}
                    onClick={() => {
                      setQuery('');
                      setCategory('Все');
                    }}
                  >
                    Сбросить поиск
                  </button>
                </div>
              )}
              <p className={s.finePrint}>
                Демонстрационные названия и цвета. Коммерческие условия доступны
                только после одобрения менеджером.
              </p>
            </>
          ) : tab === 'studio' ? (
            <>
              <div className={s.pageHeading}>
                <p className={s.eyebrow}>Цветовая студия</p>
                <h1 ref={heading} tabIndex={-1}>
                  Ваш новый
                  <br />
                  оттенок.
                </h1>
                <p className={s.muted}>
                  Статичная концепция. Живое 3D ещё не подключено.
                </p>
              </div>
              <div className={s.studioScene}>
                <span className={s.sceneTag}>Авторский эскиз / вид сбоку</span>
                <Car color={material.color} className={s.studioCar} />
                <span className={s.sceneFloor}>VEGA / COLOR STUDY</span>
              </div>
              <div className={s.materialInfo}>
                <div>
                  <p className={s.eyebrow}>{material.category}</p>
                  <h2>{material.colorName}</h2>
                </div>
                <span className={s.outlineTag}>{material.finish}</span>
              </div>
              <div className={s.swatches} aria-label="Цвет автомобиля">
                {demoProducts
                  .filter((item) => item.category !== 'Прозрачная')
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setMaterial(item)}
                      aria-label={`Цвет ${item.colorName}`}
                      aria-pressed={material.id === item.id}
                      style={{ '--swatch': item.color } as CSSProperties}
                    >
                      <span />
                    </button>
                  ))}
              </div>
              <button
                className={s.primaryButton}
                onClick={() => openProduct(material)}
              >
                К образцу плёнки
                <Icon name="arrow" />
              </button>
              <p className={s.finePrint}>
                Это 2D-иллюстрация с переключением цвета. Она не передаёт
                реальную фактуру и не заменяет физический образец.
              </p>
            </>
          ) : tab === 'cart' ? (
            <>
              <div className={s.pageHeading}>
                <p className={s.eyebrow}>Сохраните идею</p>
                <h1 ref={heading} tabIndex={-1}>
                  Ваш подбор.
                </h1>
                <p className={s.muted}>
                  Только на этой странице, до её перезагрузки.
                </p>
              </div>
              {selection.length ? (
                <>
                  <div className={s.cartList}>
                    {selection.map((line) => {
                      const item = demoProducts.find(
                        (entry) => entry.id === line.productId,
                      )!;
                      const unitName =
                        line.unit === 'meter' ? 'метры' : 'рулоны';
                      return (
                        <article
                          className={s.cartLine}
                          key={line.lineId}
                          aria-label={`${item.name}, ${unitName}`}
                        >
                          <div className={s.cartVisual}>
                            <Film product={item} compact />
                          </div>
                          <div className={s.cartInfo}>
                            <span className={s.eyebrow}>{item.article}</span>
                            <h2>{item.name}</h2>
                            <p>
                              {line.quantity}{' '}
                              {line.unit === 'meter' ? 'м' : 'рул.'} ·{' '}
                              {line.unit === 'meter'
                                ? 'Метры'
                                : `Целый рулон ${item.rollLengthM} м`}
                            </p>
                            <button
                              ref={(control) => {
                                if (control)
                                  removeControls.current.set(
                                    line.lineId,
                                    control,
                                  );
                                else removeControls.current.delete(line.lineId);
                              }}
                              className={s.textButton}
                              onClick={() =>
                                removeSelection(line.lineId, item.name)
                              }
                              aria-label={`Удалить ${item.name}, ${unitName}`}
                            >
                              Удалить
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className={s.selectionNote}>
                    <Icon name="check" />
                    <p>
                      Подбор не является корзиной рабочего магазина. Заказы,
                      резервы и оплата здесь не создаются.
                    </p>
                  </div>
                  <button
                    className={s.whiteButton}
                    onClick={() => navigate('catalog')}
                  >
                    Продолжить подбор
                    <Icon name="arrow" />
                  </button>
                </>
              ) : (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>
                    <Icon name="cart" size={42} />
                  </div>
                  <h2>Место для ваших идей.</h2>
                  <p>Добавьте образцы из каталога — метрами или рулонами.</p>
                  <button
                    ref={emptySelectionControl}
                    className={s.whiteButton}
                    onClick={() => navigate('catalog')}
                  >
                    Открыть каталог
                    <Icon name="arrow" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className={s.pageHeading}>
                <p className={s.eyebrow}>Всегда под рукой</p>
                <h1 ref={heading} tabIndex={-1}>
                  Ваш VEGA.
                </h1>
              </div>
              <section className={s.profileCard}>
                <div className={s.avatar}>
                  <Icon name="profile" size={38} />
                </div>
                <h2>Знакомство начинается здесь.</h2>
                <p>
                  После регистрации менеджер проверит аккаунт. Коммерческие
                  условия станут доступны после его одобрения; выбирать
                  менеджера при регистрации не нужно.
                </p>
                <a className={s.whiteButton} href="/account">
                  Войти
                  <Icon name="arrow" />
                </a>
                <span className={s.finePrint}>
                  Сейчас вы смотрите дизайн-прототип.
                </span>
              </section>
              <section className={s.profileNote}>
                <p className={s.eyebrow}>Для себя и для дела</p>
                <h2>
                  Один подход.
                  <br />
                  Разные проекты.
                </h2>
                <p>Для автовладельцев, мастеров и студий.</p>
              </section>
            </>
          )}
          <div className={s.liveRegion} role="status" aria-live="polite">
            {announcement && (
              <span>
                <Icon name="check" size={18} />
                <span>{announcement}</span>
                <button onClick={() => navigate('cart')}>Посмотреть</button>
              </span>
            )}
          </div>
        </main>
        <nav className={s.bottomNav} aria-label="Основная навигация">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={!product && tab === item.id ? s.activeTab : ''}
              aria-current={!product && tab === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <span className={s.navIcon}>
                <Icon name={item.icon} />
                {item.id === 'cart' && selection.length > 0 && (
                  <span
                    className={s.badge}
                    aria-label={`${selection.length} позиций`}
                  >
                    {selection.length}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
