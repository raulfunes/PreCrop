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

export function useCapacity(enabled: boolean): UseCapacityResult {
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const fetchIdRef = useRef(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (fetchedRef.current && retryCount === 0) return;

    const controller = new AbortController();
    const currentFetchId = ++fetchIdRef.current;

    const fetchCapacity = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await evidenceClient.capacity(controller.signal);
        if (currentFetchId === fetchIdRef.current) {
          setData(response);
          setIsLoading(false);
          fetchedRef.current = true;
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
  }, [enabled, retryCount]);

  const retry = () => setRetryCount(c => c + 1);

  return { data, isLoading, error, retry };
}
