'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type GuardState = {
  dirty: boolean;
  savePending: boolean;
  publicationPending: boolean;
  mediaPending: boolean;
  setDirty: (value: boolean) => void;
  setSavePending: (value: boolean) => void;
  setPublicationPending: (value: boolean) => void;
  setMediaPending: (value: boolean, owner: string) => void;
};

const EditorContext = createContext<GuardState | null>(null);

export function EditorGuard({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [publicationPending, setPublicationPending] = useState(false);
  const [mediaOwners, setMediaOwners] = useState<Set<string>>(() => new Set());
  const setMediaPending = useCallback((value: boolean, owner: string) => {
    setMediaOwners((current) => {
      if (current.has(owner) === value) return current;
      const next = new Set(current);
      if (value) next.add(owner);
      else next.delete(owner);
      return next;
    });
  }, []);
  return (
    <EditorContext.Provider
      value={{
        dirty,
        savePending,
        publicationPending,
        mediaPending: mediaOwners.size > 0,
        setDirty,
        setSavePending,
        setPublicationPending,
        setMediaPending,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorGuard() {
  const guard = useContext(EditorContext);
  if (!guard) throw new Error('Editor guard is required');
  return guard;
}
