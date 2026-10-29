import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicProductSchema, type PublicProduct } from '@vega/contracts';

export type SelectionItem = {
  product: PublicProduct;
  unit: 'meter' | 'roll';
  quantity: number;
};
const storageKey = 'vega.public-selection.v1';
const maximumBytes = 256 * 1024;
let storageQueue: Promise<void> = Promise.resolve();
function storageOperation<T>(work: () => Promise<T>): Promise<T> {
  const job = storageQueue.then(work);
  storageQueue = job.then(
    () => {},
    () => {},
  );
  return job;
}
function fitsStorageLimit(raw: string) {
  if (raw.length > maximumBytes) return false;
  let bytes = 0;
  for (const character of raw) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > maximumBytes) return false;
  }
  return true;
}
function validQuantity(unit: string, quantity: number) {
  return (
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    (unit === 'roll' || (unit === 'meter' && quantity <= 18))
  );
}
function decode(raw: string): SelectionItem[] {
  if (!fitsStorageLimit(raw)) throw new Error('Oversized selection');
  const payload: unknown = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid selection');
  const record = payload as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'items,version' ||
    record.version !== 1 ||
    !Array.isArray(record.items) ||
    record.items.length > 50
  )
    throw new Error('Invalid selection');
  const seen = new Set<string>();
  return record.items.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Invalid selection');
    const item = entry as Record<string, unknown>;
    if (
      Object.keys(item).sort().join(',') !== 'product,quantity,unit' ||
      (item.unit !== 'meter' && item.unit !== 'roll') ||
      typeof item.quantity !== 'number' ||
      !validQuantity(item.unit, item.quantity)
    )
      throw new Error('Invalid selection');
    const product = PublicProductSchema.parse(item.product);
    const key = `${product.skuId}:${item.unit}`;
    if (seen.has(key)) throw new Error('Duplicate selection');
    seen.add(key);
    return { product, unit: item.unit, quantity: item.quantity };
  });
}

type SelectionValue = {
  items: SelectionItem[];
  ready: boolean;
  error: string | null;
  put(
    product: PublicProduct,
    unit: 'meter' | 'roll',
    quantity: number,
  ): Promise<boolean>;
  remove(skuId: string, unit: 'meter' | 'roll'): Promise<boolean>;
};
const SelectionContext = createContext<SelectionValue | null>(null);
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<SelectionItem[]>([]);
  const initialized = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    initialized.current = false;
    setReady(false);
    const id = ++generation.current;
    const active = () => mounted.current && generation.current === id;
    void (async () => {
      try {
        const raw = await storageOperation(() =>
          AsyncStorage.getItem(storageKey),
        );
        if (!active()) return;
        const restored = raw ? decode(raw) : [];
        current.current = restored;
        setItems(restored);
        setError(null);
      } catch {
        if (!active()) return;
        await storageOperation(async () => {
          if (active()) await AsyncStorage.removeItem(storageKey);
        }).catch(() => {});
        if (active()) {
          current.current = [];
          setItems([]);
          setError(
            'Не удалось восстановить подбор. Добавьте материалы заново.',
          );
        }
      } finally {
        if (active()) {
          initialized.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      mounted.current = false;
      initialized.current = false;
      ++generation.current;
    };
  }, []);
  function mutate(transform: (previous: SelectionItem[]) => SelectionItem[]) {
    const id = generation.current;
    const active = () => mounted.current && generation.current === id;
    const job = queue.current.then(async () => {
      if (!initialized.current || !active()) return false;
      try {
        const next = transform(current.current);
        const raw = JSON.stringify({ version: 1, items: next });
        decode(raw); // Strict public schema and actual UTF-8 byte limit.
        const saved = await storageOperation(async () => {
          if (!active()) return false;
          await AsyncStorage.setItem(storageKey, raw);
          return true;
        });
        if (saved && active()) {
          current.current = next;
          setItems(next);
          setError(null);
          return true;
        }
        return false;
      } catch {
        if (active())
          setError(
            'Не удалось сохранить подбор. Проверьте свободное место и попробуйте ещё раз.',
          );
        return false;
      }
    });
    queue.current = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  const value: SelectionValue = {
    items,
    ready,
    error,
    put: (product, unit, quantity) =>
      mutate((previous) => {
        if (!validQuantity(unit, quantity)) throw new Error('Invalid quantity');
        const safeProduct = PublicProductSchema.parse(product);
        const next = previous.filter(
          (item) =>
            item.product.skuId !== safeProduct.skuId || item.unit !== unit,
        );
        if (next.length >= 50) throw new Error('Selection limit');
        return [...next, { product: safeProduct, unit, quantity }];
      }),
    remove: (skuId, unit) =>
      mutate((previous) =>
        previous.filter(
          (item) => item.product.skuId !== skuId || item.unit !== unit,
        ),
      ),
  };
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}
export function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('SelectionProvider is required');
  return value;
}
