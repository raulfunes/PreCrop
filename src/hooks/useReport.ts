import { useState, useEffect, useRef } from 'react';
import { evidenceClient } from '@/lib/evidenceClient';
import { ApiError } from '@/types';

interface UseReportResult {
  markdown: string | null;
  isLoading: boolean;
  error: ApiError | null;
  retry: () => void;
}

export function useReport(
  scenario: 'bueno' | 'mixto' | 'malo',
  enabled: boolean,
  options?: { weeds_pct?: number; signature?: string; explorer_url?: string }
): UseReportResult {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const currentFetchId = ++fetchIdRef.current;

    const fetchReport = async () => {
      setIsLoading(true);
      setError(null);
      setMarkdown(null);

      try {
        const response = await evidenceClient.report(scenario, options, controller.signal);
        if (currentFetchId === fetchIdRef.current) {
          setMarkdown(response);
          setIsLoading(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof ApiError ? err : new ApiError({ error: 'Error desconocido' }));
          setIsLoading(false);
        }
      }
    };

    fetchReport();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, enabled, retryCount, options?.weeds_pct, options?.signature, options?.explorer_url]);

  const retry = () => setRetryCount(c => c + 1);

  return { markdown, isLoading, error, retry };
}
