import { useState, useEffect, useRef } from 'react';
import { evidenceClient, buildEvidenceRequest } from '@/lib/evidenceClient';
import type { ScoreResponse, VisionPointState, EvidenceRequestPayload, DisburseResponse, PublishResponse } from '@/types';
import { ApiError } from '@/types';

interface UseEvidenceApiResult {
  scoreData: ScoreResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  publish: () => Promise<PublishResponse>;
  disburse: (amountArs?: number) => Promise<DisburseResponse>;
}

export function useEvidenceApi(
  scenario: 'bueno' | 'mixto' | 'malo',
  visionResults: Record<string, VisionPointState>
): UseEvidenceApiResult {
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  
  // We keep the payload ref up to date to use in publish and disburse
  const payloadRef = useRef<EvidenceRequestPayload>({ scenario });

  // Only re-run the effect if scenario or the stringified valid vision results change.
  // Using stringify or just passing the length/state of valid ones is better than deep-depending on visionResults.
  const validVisionKey = Object.values(visionResults)
    .filter(r => r.status === 'completed' && r.result?.status === 'assessed')
    .map(r => r.result?.status === 'assessed' ? r.result.weedsPct : null)
    .join(',');

  useEffect(() => {
    const controller = new AbortController();
    const fetchScore = async () => {
      setIsLoading(true);
      setError(null);
      
      const payload = buildEvidenceRequest(scenario, visionResults);
      payloadRef.current = payload;

      try {
        const response = await evidenceClient.score(payload, controller.signal);
        setScoreData(response);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof ApiError ? err : new ApiError({ error: 'Unknown Error' }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchScore();

    return () => {
      controller.abort();
    };
    // Note: deliberately excluding scoreData from dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, validVisionKey]);

  const publish = async () => {
    return evidenceClient.publish(payloadRef.current);
  };

  const disburse = async (amountArs?: number) => {
    const payload = { ...payloadRef.current };
    if (amountArs !== undefined) {
      payload.amount_ars = amountArs;
    }
    return evidenceClient.disburse(payload);
  };

  return {
    scoreData,
    isLoading,
    error,
    publish,
    disburse
  };
}
