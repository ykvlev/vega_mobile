'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  colors,
  finishes,
  type ColorId,
  type FinishId,
  type ViewId,
} from './config';
import type { Viewer, FrameInfo } from './viewer';
import s from './studio.module.css';

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M5 19 19 5M5 5h14v14" />
    </svg>
  );
}

type Phase = 'loading' | 'ready' | 'failed' | 'paused';
export function ConfiguratorStudio({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [color, setColor] = useState<ColorId>('graphite');
  const [finish, setFinish] = useState<FinishId>('gloss');
  const [phase, setPhase] = useState<Phase>('loading');
  const [enabled, setEnabled] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [rotation, setRotation] = useState(false);
  const [info, setInfo] = useState<FrameInfo | null>(null);
  const choice = useRef({ color, finish });
  choice.current = { color, finish };

  useEffect(() => {
    if (!enabled) {
      setPhase('paused');
      return;
    }
    const target = host.current;
    if (!target) return;
    let active = true;
    let instance: Viewer | null = null;
    setPhase('loading');
    setInfo(null);
    setRotation(false);
    void import('./viewer')
      .then(({ createViewer }) => {
        if (!active) return;
        instance = createViewer(target, {
          frame(next) {
            if (active) {
              setInfo(next);
              setPhase('ready');
            }
          },
          error() {
            if (active) {
              viewer.current = null;
              setPhase('failed');
              setRotation(false);
            }
          },
        });
        viewer.current = instance;
        instance.setMaterial(choice.current.color, choice.current.finish);
      })
      .catch(() => {
        if (active) setPhase('failed');
      });
    return () => {
      active = false;
      viewer.current = null;
      instance?.dispose();
    };
  }, [attempt, enabled]);

  function selectColor(next: ColorId) {
    setColor(next);
    viewer.current?.setMaterial(next, finish);
  }
  function selectFinish(next: FinishId) {
    setFinish(next);
    viewer.current?.setMaterial(color, next);
  }
  // One-way public lifecycle only. No auth, material commands, URL inputs or
  // parent-supplied JavaScript cross this boundary. The host validates source,
  // origin (web) / document URL (native), version and the exact message schema.
  useEffect(() => {
    if (!embedded) return;
    const message = { version: 1, type: 'vega-studio', phase };
    const native = (
      window as Window & {
        ReactNativeWebView?: { postMessage: (value: string) => void };
      }
    ).ReactNativeWebView;
    native?.postMessage(JSON.stringify(message));
    if (window.parent !== window) window.parent.postMessage(message, '*');
  }, [embedded, phase]);

  const ready = phase === 'ready';
  const selected = colors.find((item) => item.id === color)!;
  const selectedFinish = finishes.find((item) => item.id === finish)!;
  return (
    <main
      id="main"
      tabIndex={-1}
      className={`${s.page} ${embedded ? s.embedded : ''}`}
    >
      {!embedded && (
        <header className={s.header}>
          <Link
            href="/design-preview"
            aria-label="На главную VEGA"
            className={s.brand}
          >
            VEGA
          </Link>
          <span className={s.headerLabel}>Цветовая студия</span>
          <Link href="/catalog-lab" className={s.catalogLink}>
            Каталог <Arrow />
          </Link>
        </header>
      )}
      <div className={s.layout}>
        <section className={s.sceneSection} aria-label="Просмотр автомобиля">
          <div className={s.sceneHeader}>
            <span>КОНЦЕПТ 01</span>
            <span>ИНТЕРАКТИВНЫЙ 3D</span>
          </div>
          <div
            className={s.scene}
            data-testid="three-scene"
            data-phase={phase}
            data-frames={info?.frames ?? 0}
            data-color={info?.color ?? ''}
            data-roughness={info?.roughness ?? ''}
            data-fixed-materials={info?.fixedMaterials ?? ''}
            data-camera={info?.camera ?? ''}
            data-triangles={info?.triangles ?? 0}
            data-calls={info?.calls ?? 0}
            data-load-ms={info?.loadMs ?? 0}
            data-ground-clearance={info?.groundClearance ?? 0}
          >
            <div ref={host} className={s.canvasHost} />
            {phase === 'loading' && (
              <div className={s.loading} role="status">
                <span className={s.spinner} />
                Загружаем автомобиль
              </div>
            )}
            {(phase === 'failed' || phase === 'paused') && (
              <div className={s.fallback}>
                <Image
                  src="/design-preview/vega-concept-hero.png"
                  alt="Автомобиль VEGA — статичная иллюстрация"
                  fill
                  sizes="(max-width: 760px) 100vw, 65vw"
                  className={s.fallbackImage}
                />
                <div className={s.fallbackMessage}>
                  <p role="status">
                    {phase === 'failed'
                      ? embedded
                        ? '3D сейчас недоступно.'
                        : '3D сейчас недоступно. Каталог продолжает работать.'
                      : '3D приостановлено.'}
                  </p>
                  <button
                    onClick={() => {
                      setEnabled(true);
                      setAttempt((value) => value + 1);
                    }}
                  >
                    {phase === 'failed' ? 'Повторить загрузку' : 'Вернуть 3D'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={s.viewBar} aria-label="Управление ракурсом">
            {(['perspective', 'front', 'side', 'rear'] as ViewId[]).map(
              (view, index) => (
                <button
                  key={view}
                  disabled={!ready}
                  onClick={() => viewer.current?.setView(view)}
                >
                  {['Общий вид', 'Спереди', 'Сбоку', 'Сзади'][index]}
                </button>
              ),
            )}
            <button
              disabled={!ready}
              onClick={() => viewer.current?.zoom(1)}
              aria-label="Приблизить автомобиль"
            >
              ＋
            </button>
            <button
              disabled={!ready}
              onClick={() => viewer.current?.zoom(-1)}
              aria-label="Отдалить автомобиль"
            >
              −
            </button>
          </div>
          <div className={s.sceneFooter}>
            <span>Проведите по автомобилю, чтобы повернуть</span>
            <button
              disabled={!ready}
              aria-pressed={rotation}
              onClick={() => {
                const next = !rotation;
                setRotation(next);
                viewer.current?.setRotation(next);
              }}
            >
              {rotation ? 'Остановить вращение' : 'Автовращение'}
            </button>
            <button disabled={!ready} onClick={() => setEnabled(false)}>
              Скрыть 3D
            </button>
          </div>
        </section>
        <section className={s.options} aria-labelledby="studio-title">
          <p className={s.eyebrow}>VEGA / ЦВЕТ И ФАКТУРА</p>
          <h1 id="studio-title">
            Другой цвет.
            <br />
            Другой характер.
          </h1>
          <p className={s.intro}>
            Исследуйте цвет с разных сторон. Меняйте световой отклик поверхности
            — от глубокого глянца до мягкого матового финиша.
          </p>
          <fieldset className={s.fieldset} disabled={!ready}>
            <legend>
              Цвет <span>{selected.name}</span>
            </legend>
            <div className={s.swatches}>
              {colors.map((item) => (
                <button
                  key={item.id}
                  aria-label={`Цвет: ${item.name}`}
                  aria-pressed={color === item.id}
                  onClick={() => selectColor(item.id)}
                  className={s.swatch}
                >
                  <span style={{ backgroundColor: item.hex }} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={s.fieldset} disabled={!ready}>
            <legend>Поверхность</legend>
            <div className={s.finishes}>
              {finishes.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={finish === item.id}
                  onClick={() => selectFinish(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>
          <p className={s.selection} aria-live="polite">
            {selected.name} / {selectedFinish.name}
          </p>
          {!embedded && (
            <Link href="/catalog-lab" className={s.primary}>
              ПЕРЕЙТИ К ПЛЁНКАМ <Arrow />
            </Link>
          )}
          <p className={s.notice}>
            Демонстрационная палитра, не цвета конкретных артикулов. Оттенок на
            экране зависит от освещения и дисплея. Для выбора плёнки нужен
            реальный образец.
          </p>
        </section>
      </div>
      <footer className={s.attribution}>
        <span>
          Car Concept: © 2024 Darmstadt Graphics Group GmbH, Eric Chadwick.
        </span>
        {embedded ? (
          <span>
            CC BY 4.0 · Изменено для VEGA: оптимизация геометрии и текстур,
            удаление логотипов, материалы кузова и номер. Источник: Khronos
            glTF-Sample-Assets / CarConcept. Лицензия:
            creativecommons.org/licenses/by/4.0/
          </span>
        ) : (
          <>
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0 <Arrow />
            </a>
            <a href="/3d/car-concept/ATTRIBUTION.md">Источник и изменения</a>
          </>
        )}
      </footer>
    </main>
  );
}
