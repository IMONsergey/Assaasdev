import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Icon } from '../../components/ui';
import { dateLabel } from './model';

const COUNTERS = [
  ['ipv4', 'IPv4 addresses'],
  ['ipv6', 'IPv6 addresses'],
  ['domains', 'Domains'],
  ['protocols', 'Protocols'],
  ['products', 'Products'],
  ['unique_products', 'Unique products'],
  ['cves', 'CVEs'],
] as const;

type IndexStatisticsData = Partial<Record<typeof COUNTERS[number][0] | 'last_updated_timestamp', number | null>>;
interface IndexStatisticsResponse { success: boolean; data?: IndexStatisticsData | null }

function countLabel(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en') : 'Not provided';
}

export function IndexStatistics() {
  const { api, mode } = useApp();
  const statistics = useQuery({
    queryKey: ['index-statistics', mode],
    enabled: false,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const response = await api.http<IndexStatisticsResponse>('/api/statistics', { method: 'GET', signal });
      if (response?.success !== true || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('The server did not return an index-statistics snapshot.');
      }
      return response.data;
    },
  });
  const timestamp = statistics.data?.last_updated_timestamp;
  const validTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0 && !Number.isNaN(new Date(timestamp * 1000).getTime());

  return <details className="search-index-statistics">
    <summary><span>Index statistics</span><Icon name="chevron-down" size={16} /></summary>
    <div className="search-index-content">
      <div className="search-index-toolbar">
        <p>Snapshot of the global internet index.</p>
        <Button variant="secondary" size="sm" loading={statistics.isFetching} onClick={() => void statistics.refetch()}>
          {statistics.data && <Icon name="refresh" size={16} />}
          {statistics.data ? 'Refresh statistics' : 'Load statistics'}
        </Button>
      </div>
      {statistics.isFetching && <p className="search-index-status" role="status">Loading index statistics…</p>}
      {statistics.error && <Alert tone="error" title="Index statistics could not be loaded">{statistics.error.message}{statistics.data && ' Previously loaded statistics remain below.'}</Alert>}
      {statistics.data && <>
        <dl className="search-index-counts">
          {COUNTERS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{countLabel(statistics.data[key])}</dd></div>)}
        </dl>
        <p className="search-index-updated">Last updated: {validTimestamp ? <time dateTime={new Date(timestamp * 1000).toISOString()}>{dateLabel(timestamp)}</time> : 'Not provided'}{mode === 'demo' && <Badge>Demo snapshot</Badge>}</p>
      </>}
      {!statistics.data && !statistics.isFetching && !statistics.error && <p className="search-index-status">Load the current snapshot when you need it.</p>}
    </div>
  </details>;
}
