import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  AuthResponseSchema,
  type AuthCredentials,
  type AuthUser,
} from '@vega/contracts';
import * as api from './api';

const storageKey = 'vega.demo.session.v1';
const storageOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'vega.demo.session',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
type StoredSession = { token: string; expiresAt: string };
// Web bearer stays in memory, never browser storage. Native I/O is serialized
// across provider remounts: an old delete cannot finish after a newer save.
let webSession: StoredSession | null = null;
let storageQueue: Promise<void> = Promise.resolve();
function storageOperation<T>(work: () => Promise<T>): Promise<T> {
  const job = storageQueue.then(work);
  storageQueue = job.then(
    () => {},
    () => {},
  );
  return job;
}
function readSession(): Promise<StoredSession | null> {
  return storageOperation(async () => {
    if (Platform.OS === 'web') return webSession;
    const raw = await SecureStore.getItemAsync(storageKey, storageOptions);
    if (!raw || raw.length > 512) return null;
    try {
      const session = AuthResponseSchema.shape.session.parse(JSON.parse(raw));
      return Date.parse(session.expiresAt) > Date.now() ? session : null;
    } catch {
      // Cleanup belongs to the current caller, not an obsolete restore read.
      return null;
    }
  });
}
function saveSession(session: StoredSession, current: () => boolean) {
  return storageOperation(async () => {
    if (!current()) return false;
    if (Platform.OS === 'web') webSession = session;
    else
      await SecureStore.setItemAsync(
        storageKey,
        JSON.stringify(session),
        storageOptions,
      );
    return true;
  });
}
function deleteSession(current: () => boolean) {
  return storageOperation(async () => {
    if (!current()) return false;
    if (Platform.OS === 'web') webSession = null;
    else await SecureStore.deleteItemAsync(storageKey, storageOptions);
    return true;
  });
}

type SessionState = 'restoring' | 'guest' | 'authenticated' | 'unavailable';
type SessionValue = {
  state: SessionState;
  user: AuthUser | null;
  pending: boolean;
  error: string | null;
  login(credentials: AuthCredentials): Promise<void>;
  register(credentials: AuthCredentials): Promise<void>;
  logout(): Promise<void>;
  retry(): Promise<void>;
  clearError(): void;
};
const SessionContext = createContext<SessionValue | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>('restoring');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const restore = useCallback(async () => {
    if (busy.current) return;
    const id = ++generation.current;
    const current = () => mounted.current && generation.current === id;
    busy.current = true;
    setPending(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    try {
      const saved = await readSession();
      if (!current()) return;
      if (!saved || Date.parse(saved.expiresAt) <= Date.now()) {
        await deleteSession(current);
        if (!current()) return;
        token.current = null;
        setUser(null);
        setState('guest');
        return;
      }
      // Retain the known bearer for an explicit logout even if /me is offline.
      token.current = saved.token;
      const verifiedUser = await api.getMe(saved.token, request.signal);
      if (!current()) return;
      setUser(verifiedUser);
      setState('authenticated');
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof api.ApiError && failure.kind === 'expired') {
        try {
          await deleteSession(current);
          if (!current()) return;
          token.current = null;
          setUser(null);
          setState('guest');
        } catch {
          if (!current()) return;
          setUser(null);
          setState('unavailable');
          setError('Не удалось завершить сеанс. Повторите попытку.');
        }
      } else {
        setUser(null);
        setState('unavailable');
        setError(
          'Не удалось проверить сеанс. Проверьте соединение и повторите попытку.',
        );
      }
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void restore();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !busy.current) void restore();
    });
    return () => {
      mounted.current = false;
      ++generation.current;
      busy.current = false;
      controller.current?.abort();
      subscription.remove();
    };
  }, [restore]);

  async function authenticate(
    mode: 'login' | 'register',
    credentials: AuthCredentials,
  ) {
    if (busy.current) return;
    const id = ++generation.current;
    const current = () => mounted.current && generation.current === id;
    busy.current = true;
    setPending(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await api[mode](credentials, request.signal);
      if (!current() || Date.parse(result.session.expiresAt) <= Date.now()) {
        void api.logout(result.session.token).catch(() => {});
        if (current()) setError('Сеанс завершён. Повторите вход.');
        return;
      }
      let stored = false;
      try {
        stored = await saveSession(result.session, current);
      } catch {
        await api.logout(result.session.token).catch(() => {});
        if (current())
          setError('Не удалось сохранить защищённый сеанс. Повторите вход.');
        return;
      }
      if (!stored) {
        void api.logout(result.session.token).catch(() => {});
        return;
      }
      // A successfully persisted session may be restored by a new provider.
      // Do not revoke it merely because this provider unmounted during the write.
      if (!current()) return;
      token.current = result.session.token;
      setUser(result.user);
      setState('authenticated');
    } catch (failure) {
      if (current())
        setError(
          failure instanceof api.ApiError
            ? failure.message
            : 'Не удалось войти. Повторите попытку.',
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function logout() {
    if (busy.current) return;
    const id = ++generation.current;
    const current = () => mounted.current && generation.current === id;
    busy.current = true;
    setPending(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    try {
      // A failed restore may leave a persisted token without an in-memory user.
      const savedToken = token.current ?? (await readSession())?.token;
      if (!current()) return;
      if (savedToken) {
        try {
          await api.logout(savedToken, request.signal);
        } catch (failure) {
          if (!(failure instanceof api.ApiError && failure.kind === 'expired'))
            throw failure;
        }
      }
      if (!current()) return;
      await deleteSession(current);
      if (!current()) return;
      token.current = null;
      setUser(null);
      setState('guest');
    } catch {
      if (current())
        setError(
          'Не удалось завершить выход. Проверьте соединение и повторите попытку.',
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <SessionContext.Provider
      value={{
        state,
        user,
        pending,
        error,
        login: (credentials) => authenticate('login', credentials),
        register: (credentials) => authenticate('register', credentials),
        logout,
        retry: restore,
        clearError: () => setError(null),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
