import s from './catalog.module.css';

export default function CatalogLoading() {
  return (
    <div className={s.lab}>
      <main id="main" className={s.inner}>
        <p className={s.badge}>Тестовый каталог · демонстрационная БД</p>
        <h1 className={s.title}>Каталог.</h1>
        <div className={s.notice} role="status" aria-live="polite">
          <h2>Загружаем каталог</h2>
          <p>Получаем публичные товары из тестового API.</p>
        </div>
      </main>
    </div>
  );
}
