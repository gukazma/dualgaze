import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Viewer } from 'cesium';

interface CesiumContextValue {
  viewer: Viewer | null;
  setViewer: (v: Viewer | null) => void;
}

const CesiumContext = createContext<CesiumContextValue | null>(null);

export function CesiumProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  return (
    <CesiumContext.Provider value={{ viewer, setViewer }}>
      {children}
    </CesiumContext.Provider>
  );
}

/** 读 viewer（可能为 null —— mount 完才有）*/
export function useCesiumViewer(): Viewer | null {
  const ctx = useContext(CesiumContext);
  return ctx?.viewer ?? null;
}

/** 写 viewer —— 只给 CesiumViewer 自己用 */
export function useCesiumSetViewer(): (v: Viewer | null) => void {
  const ctx = useContext(CesiumContext);
  if (!ctx) throw new Error('useCesiumSetViewer must be inside <CesiumProvider>');
  return ctx.setViewer;
}
