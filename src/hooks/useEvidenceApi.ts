import { useState, useEffect, useRef } from 'react';
import { evidenceClient, buildEvidenceRequest } from '@/lib/evidenceClient';
import type { ScoreResponse, VisionPointState, EvidenceRequestPayload, DisburseResponse, PublishResponse } from '@/types';
import { ApiError } from '@/types';

interface UseEvidenceApiResult {
  scoreData: ScoreResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  retry: () => void;
  publish: () => Promise<PublishResponse>;
  disburse: (amountArs?: number) => Promise<DisburseResponse>;
}

export function useEvidenceApi(
  scenario: 'bueno' | 'mixto' | 'malo',
  visionResults: Record<string, VisionPointState>,
  loteId?: string
): UseEvidenceApiResult {
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // We keep the payload ref up to date to use in publish and disburse
  const payloadRef = useRef<EvidenceRequestPayload>({ scenario });
  // Track active fetch to avoid race conditions overriding isLoading
  const fetchIdRef = useRef<number>(0);

  // Only re-run the effect if scenario or the stringified valid vision results change.
  const validVisionKey = Object.values(visionResults)
    .filter(r => r.status === 'completed' && r.result?.status === 'assessed')
    .map(r => r.result?.status === 'assessed' ? r.result.weedsPct : null)
    .join(',');

  useEffect(() => {
    const controller = new AbortController();
    const currentFetchId = ++fetchIdRef.current;

    const fetchScore = async () => {
      setIsLoading(true);
      setError(null);
      setScoreData(null); // Clear previous data explicitly on change

      const payload = buildEvidenceRequest(scenario, visionResults);
      payloadRef.current = payload;

      try {
        const response = await evidenceClient.score(payload, controller.signal, loteId);
        if (currentFetchId === fetchIdRef.current) {
          setScoreData(response);
          setIsLoading(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof ApiError ? err : new ApiError({ error: 'Unknown Error' }));
          setIsLoading(false);
        }
      }
    };

    fetchScore();

    return () => {
      controller.abort();
    };
    // Note: deliberately excluding scoreData from dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, validVisionKey, retryCount, loteId]);

  const retry = () => setRetryCount(c => c + 1);

  const checkActionPreconditions = () => {
    if (isLoading || !scoreData || scoreData.scenario !== scenario) {
      throw new Error('Estado no sincronizado. Espere a que la carga finalice.');
    }
  };

  const publish = async () => {
    checkActionPreconditions();
    return evidenceClient.publish(payloadRef.current, undefined, loteId);
  };

  const disburse = async (amountArs?: number) => {
    checkActionPreconditions();
    const payload = { ...payloadRef.current };
    if (amountArs !== undefined) {
      payload.amount_ars = amountArs;
    }
    return evidenceClient.disburse(payload, undefined, loteId);
  };

  return {
    scoreData,
    isLoading,
    error,
    retry,
    publish,
    disburse
  };
}
