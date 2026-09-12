'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { workflowClient, type LotStateResponse, type DisburseWorkflowResponse, type Scenario } from '@/lib/workflowClient';
import { ApiError } from '@/types';

interface UseLotWorkflowResult {
  state: LotStateResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  busy: 'approve' | 'disburse' | 'reset' | 'photo' | null;
  refresh: () => Promise<void>;
  approve: (quotaUsd?: number) => Promise<void>;
  disburse: () => Promise<DisburseWorkflowResponse>;
  reset: () => Promise<void>;
  recordPhoto: (body: Parameters<typeof workflowClient.recordPhoto>[1]) => Promise<void>;
  clearPhotos: () => Promise<void>;
  lastReceipt: DisburseWorkflowResponse | null;
}

export function useLotWorkflow(loteId: string, scenario: Scenario): UseLotWorkflowResult {
  const [state, setState] = useState<LotStateResponse | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<UseLotWorkflowResult['busy']>(null);
  // The receipt is remembered together with its lot, so switching lots never shows a stale one.
  const [receiptFor, setReceiptFor] = useState<{ loteId: string; receipt: DisburseWorkflowResponse } | null>(null);
  const lastReceipt = receiptFor && receiptFor.loteId === loteId ? receiptFor.receipt : null;
  const setLastReceipt = (r: DisburseWorkflowResponse | null) => setReceiptFor(r ? { loteId, receipt: r } : null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await workflowClient.state(loteId, scenario);
      if (alive.current) { setState(s); setError(null); }
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e : new ApiError({ error: 'Error inesperado' }));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [loteId, scenario]);

  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => {
      if (alive.current) {
        setLoading(true);
        void refresh();
      }
    }, 0);
    return () => { 
      alive.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  const run = useCallback(async <T,>(kind: UseLotWorkflowResult['busy'], fn: () => Promise<T>): Promise<T> => {
    setBusy(kind);
    try {
      const r = await fn();
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ error: 'Error inesperado' }));
      throw e;
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [refresh]);

  return {
    state,
    isLoading,
    error,
    busy,
    lastReceipt,
    refresh,
    approve: (quotaUsd) => run('approve', () => workflowClient.approve(loteId, quotaUsd === undefined ? {} : { quota_usd: quotaUsd })).then(() => undefined),
    disburse: () => run('disburse', async () => {
      const r = await workflowClient.disburse(loteId, { scenario });
      setLastReceipt(r);
      return r;
    }),
    reset: () => run('reset', async () => { setLastReceipt(null); return workflowClient.reset(loteId); }).then(() => undefined),
    recordPhoto: (body) => run('photo', () => workflowClient.recordPhoto(loteId, { ...body, scenario })).then(() => undefined),
    clearPhotos: () => run('photo', () => workflowClient.clearPhotos(loteId)).then(() => undefined),
  };
}
