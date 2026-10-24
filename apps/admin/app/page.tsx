const sections = [
  {
    id: 'catalog',
    number: '01',
    title: 'Каталог',
    description:
      'Товары, фотографии и длина рулона. Управление появится на следующем этапе.',
  },
  {
    id: 'orders',
    number: '02',
    title: 'Заказы',
    description:
      'Согласование менеджером, резерв в 1С и подтверждение полной оплаты.',
  },
  {
    id: 'integrations',
    number: '03',
    title: 'Интеграции',
    description: 'Подключения к 1С и платёжному провайдеру ещё не настроены.',
  },
];

export default function Home() {
  return (
    <div className="workspace">
      <header className="site-header">
        <a
          className="wordmark"
          href="#main"
          aria-label="VEGA, к началу страницы"
        >
          VEGA<span aria-hidden="true">®</span>
        </a>
        <span className="environment">Разработка · этап 1</span>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">Административная панель</p>
          <h1 id="page-title">
            Рабочее
            <br />
            пространство.
          </h1>
          <p className="intro">
            Основа VEGA для команды. Здесь будут каталог, клиенты и заказы.
          </p>
          <div className="notice" role="note" aria-label="Состояние разработки">
            <span className="status-mark" aria-hidden="true" />
            <p>
              Это стартовый экран разработки. Он не подключён к API и не
              показывает реальные товары, остатки или заказы. Вход и продажи
              пока недоступны.
            </p>
          </div>
        </section>

        <nav className="section-nav" aria-label="Разделы на этой странице">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
              <span aria-hidden="true"> ↘</span>
            </a>
          ))}
        </nav>

        <div className="section-grid">
          {sections.map((section) => (
            <section
              className="section-card"
              id={section.id}
              key={section.id}
              aria-labelledby={`${section.id}-title`}
            >
              <span className="section-number" aria-hidden="true">
                {section.number}
              </span>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              <p>{section.description}</p>
              <span className="planned">Запланировано</span>
            </section>
          ))}
        </div>

        <section className="next-step" aria-labelledby="next-title">
          <p className="eyebrow">Следующий шаг</p>
          <h2 id="next-title">От основы к первому сценарию</h2>
          <p>
            Сотрудник создаёт товар → клиент видит каталог → менеджер согласует
            заказ. До подключения 1С и оплаты используются только тестовые
            данные.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>VEGA / Admin</span>
        <span>Без реальных продаж и платежей</span>
      </footer>
    </div>
  );
}
