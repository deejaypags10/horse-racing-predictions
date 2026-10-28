import { createContext, useContext, type ReactNode } from 'react';
import { api } from '../api/client';
import type { BoardResponse } from '../api/types';
import { useApi, type ApiState } from '../api/useApi';

const BoardCtx = createContext<ApiState<BoardResponse> | null>(null);

/** Board data, polled every 30s while a screen that needs it is mounted. */
export function BoardProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const state = useApi<BoardResponse>(enabled ? 'board' : null, (s) => api.board(s), 30_000);
  return <BoardCtx.Provider value={state}>{children}</BoardCtx.Provider>;
}

export function useBoard(): ApiState<BoardResponse> {
  const c = useContext(BoardCtx);
  if (!c) throw new Error('useBoard outside provider');
  return c;
}
