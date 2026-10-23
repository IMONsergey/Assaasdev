import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CompleteData, FacetData, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import type { Dataset } from './model';

export function useFacets(request: SearchRequest, dataset: Dataset, enabled: boolean, principal: string) {
  const { api } = useApp();
  const identity = JSON.stringify([principal, dataset, request]);
  const [partial, setPartial] = useState<{ identity: string; data: FacetData[] }>({ identity: '', data: [] });
  const query = useQuery({ queryKey: ['analytics', principal, dataset, request], enabled, staleTime: Infinity, queryFn: ({ signal }) => new Promise<FacetData[]>((resolve, reject) => {
    const facets = new Map<string, FacetData>();
    const stop = api.stream<FacetData | CompleteData>(dataset === 'private' ? 'private_analytics' : 'analytics', request, {
      signal,
      onFrame: frame => { if (frame.data && 'facet_name' in frame.data) { facets.set(frame.data.facet_name, frame.data); setPartial({ identity, data: [...facets.values()] }); } },
      onComplete: () => resolve([...facets.values()]),
      onError: reject,
    });
    signal.addEventListener('abort', () => { stop(); reject(new DOMException('The analytics request was cancelled.', 'AbortError')); }, { once: true });
  }) });
  return { ...query, facets: query.data || (partial.identity === identity ? partial.data : []) };
}
