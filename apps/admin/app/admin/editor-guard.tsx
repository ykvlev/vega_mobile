'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type GuardState = {
  dirty: boolean;
  savePending: boolean;
  publicationPending: boolean;
  setDirty: (value: boolean) => void;
  setSavePending: (value: boolean) => void;
  setPublicationPending: (value: boolean) => void;
};

const EditorContext = createContext<GuardState | null>(null);

export function EditorGuard({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [publicationPending, setPublicationPending] = useState(false);
  return (
    <EditorContext.Provider
      value={{
        dirty,
        savePending,
        publicationPending,
        setDirty,
        setSavePending,
        setPublicationPending,
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
