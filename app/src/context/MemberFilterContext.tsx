import { createContext, useContext, useState, type ReactNode } from 'react';

interface Ctx {
  filterMemberIds: string[];
  setFilterMemberIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}

const MemberFilterContext = createContext<Ctx | null>(null);

export function MemberFilterProvider({ children }: { children: ReactNode }) {
  const [filterMemberIds, setFilterMemberIds] = useState<string[]>([]);
  return (
    <MemberFilterContext.Provider value={{ filterMemberIds, setFilterMemberIds }}>
      {children}
    </MemberFilterContext.Provider>
  );
}

export function useMemberFilter(): Ctx {
  const ctx = useContext(MemberFilterContext);
  if (!ctx) throw new Error('useMemberFilter must be used within MemberFilterProvider');
  return ctx;
}
