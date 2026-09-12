import { useState, useEffect, useRef } from 'react';
import { evidenceClient } from '@/lib/evidenceClient';
import type { CapacityResponse } from '@/types';
import { ApiError } from '@/types';

interface UseCapacityResult {
  data: CapacityResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  retry: () => void;
}

export function useCapacity(enabled: boolean, loteId?: string): UseCapacityResult {
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const fetchIdRef = useRef(0);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = `${loteId ?? 'demo'}:${retryCount}`;
    if (fetchedRef.current === key) return;

    const controller = new AbortController();
    const currentFetchId = ++fetchIdRef.current;

    const fetchCapacity = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await evidenceClient.capacity(controller.signal, loteId);
        if (currentFetchId === fetchIdRef.current) {
          setData(response);
          setIsLoading(false);
          fetchedRef.current = key;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof ApiError ? err : new ApiError({ error: 'Error desconocido' }));
          setIsLoading(false);
        }
      }
    };

    fetchCapacity();

    return () => {
      controller.abort();
    };
  }, [enabled, retryCount, loteId]);

  const retry = () => setRetryCount(c => c + 1);

  return { data, isLoading, error, retry };
}
