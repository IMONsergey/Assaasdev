import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DnsData, DomainMapData, HostDetail, SearchRequest, WhoisData } from '../../api';
import { useApp } from '../../app/AppProvider';
import type { Dataset } from '../search/model';

export type HostSection = 'host' | 'dns' | 'whois' | 'domains';
export interface HostSections {
  host?: HostDetail; dns?: DnsData; whois?: WhoisData; domains?: DomainMapData;
  received: HostSection[]; errors: Partial<Record<HostSection, string>>;
}
const blank = (): HostSections => ({ received: [], errors: {} });

export function useHost(request: SearchRequest, dataset: Dataset, enabled: boolean, principal: string) {
  const { api } = useApp();
  const identity = JSON.stringify([principal, dataset, request]);
  const [partial, setPartial] = useState<{ identity: string; sections: HostSections }>({ identity: '', sections: blank() });
  const query = useQuery({ queryKey: ['host', principal, dataset, request], enabled, staleTime: Infinity, queryFn: ({ signal }) => new Promise<HostSections>((resolve, reject) => {
    const sections = blank();
    setPartial({ identity, sections: blank() });
    let stop = () => {};
    const abort = () => { stop(); reject(new DOMException('The host request was cancelled.', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    stop = api.stream<unknown>(dataset === 'private' ? 'private_hostinfo' : 'hostinfo', request, {
      signal,
      onFrame: frame => {
        const section: HostSection | undefined = ({ hostinfo: 'host', private_hostinfo: 'host', dnsinfo: 'dns', whois: 'whois', domain_ip_map: 'domains' } as Record<string, HostSection>)[frame.type];
        if (!section) return;
        if (!sections.received.includes(section)) sections.received.push(section);
        if (frame.data === undefined || (frame.data !== null && typeof frame.data !== 'object') || (section === 'host' && (frame.data === null || Array.isArray(frame.data)))) {
          sections.errors[section] = 'This section has an unexpected response format.';
        } else if (section === 'host') sections.host = frame.data as HostDetail;
        else if (section === 'dns') sections.dns = frame.data as DnsData;
        else if (section === 'whois') sections.whois = frame.data as WhoisData;
        else sections.domains = frame.data as DomainMapData;
        setPartial({ identity, sections: { ...sections, received: [...sections.received], errors: { ...sections.errors } } });
      },
      onComplete: () => { cleanup(); resolve({ ...sections, received: [...sections.received], errors: { ...sections.errors } }); },
      onError: error => { cleanup(); reject(error); },
    });
    if (signal.aborted) abort();
  }) });
  return { ...query, sections: query.data || (partial.identity === identity ? partial.sections : blank()) };
}
