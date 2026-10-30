import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_STUDIO_CHOICE,
  StudioChoiceSchema,
  type StudioChoice,
} from '@vega/contracts';

// Public demonstration IDs only. No customer, session, SKU or commercial data.
const storageKey = 'vega.public-studio-choice.v1';
let storageQueue: Promise<void> = Promise.resolve();
function storageOperation<T>(work: () => Promise<T>): Promise<T> {
  const job = storageQueue.then(work);
  storageQueue = job.then(
    () => {},
    () => {},
  );
  return job;
}
function decode(raw: string): StudioChoice {
  if (raw.length > 256) throw new Error('Oversized studio choice');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid studio choice');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'choice,version' ||
    record.version !== 1
  )
    throw new Error('Invalid studio choice');
  return StudioChoiceSchema.parse(record.choice);
}

export function useStudioChoice() {
  const [choice, setChoice] = useState<StudioChoice>(DEFAULT_STUDIO_CHOICE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<StudioChoice>(DEFAULT_STUDIO_CHOICE);
  const mounted = useRef(false);
  const generation = useRef(0);
  const revision = useRef(0);
  const dirty = useRef(false);

  const restore = useCallback(async (): Promise<boolean> => {
    const id = generation.current;
    const version = revision.current;
    const active = () => mounted.current && generation.current === id;
    try {
      const raw = await storageOperation(() =>
        AsyncStorage.getItem(storageKey),
      );
      if (!active() || revision.current !== version) return false;
      const restored = raw === null ? DEFAULT_STUDIO_CHOICE : decode(raw);
      current.current = restored;
      setChoice(restored);
      setError(null);
      return true;
    } catch {
      if (active() && revision.current === version)
        setError(
          'Не удалось восстановить цвет и поверхность. Можно выбрать их заново или повторить.',
        );
      return false;
    } finally {
      if (active()) setReady(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    ++generation.current;
    setReady(false);
    void restore();
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, [restore]);

  const save = useCallback(async (input: StudioChoice): Promise<boolean> => {
    if (!mounted.current) return false;
    const parsed = StudioChoiceSchema.safeParse(input);
    if (!parsed.success) return false;
    const next = parsed.data;
    const id = generation.current;
    const version = ++revision.current;
    const active = () => mounted.current && generation.current === id;
    current.current = next;
    dirty.current = true;
    setChoice(next);
    try {
      const written = await storageOperation(async () => {
        if (!active()) return false;
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ version: 1, choice: next }),
        );
        return true;
      });
      if (!written || !active() || revision.current !== version) return false;
      dirty.current = false;
      setError(null);
      return true;
    } catch {
      if (active() && revision.current === version)
        setError(
          'Цвет и поверхность выбраны, но не сохранены на устройстве. Повторите сохранение.',
        );
      return false;
    }
  }, []);
  const retry = useCallback(
    () => (dirty.current ? save(current.current) : restore()),
    [restore, save],
  );
  return { choice, ready, error, save, retry };
}
