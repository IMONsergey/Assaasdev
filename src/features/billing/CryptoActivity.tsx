import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AddressTransactionsData, TrackedAddress, UserAddressesData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Icon, Skeleton } from '../../components/ui';
import { formatDate, formatNumber, responseData } from '../account/operation';
import { paymentDisplayValue, unavailablePaymentValue } from './payment-display';

// Amounts and block numbers are exact API strings. Never round them through Number.
const exactValue = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : 'Not available';

export function CryptoActivity() {
  const { api, user, session } = useApp();
  const [requested, setRequested] = useState(false);
  const [selected, setSelected] = useState<TrackedAddress | null>(null);
  const addresses = useQuery({
    queryKey: ['billing-tracked-addresses', user?.user_id],
    enabled: requested && session.status === 'authenticated',
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const data = responseData(await api.request<UserAddressesData>('get_user_addresses_info', {}, { signal, mutation: false }));
      if (!Array.isArray(data.addresses) || data.addresses.some(item => !item || typeof item.address !== 'string' || typeof item.network !== 'string' || typeof item.coin !== 'string')) {
        throw new Error('The service returned an incomplete address list. Refresh to check again.');
      }
      return data;
    },
  });
  const transactions = useQuery({
    queryKey: ['billing-address-transactions', user?.user_id, selected?.address],
    enabled: selected !== null && session.status === 'authenticated',
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const address = selected!.address;
      const data = responseData(await api.request<AddressTransactionsData>('get_address_transactions', { address }, { signal, mutation: false }));
      if (data.address !== address || !Array.isArray(data.transactions) || data.transactions.some(item => !item || typeof item.tx_hash !== 'string')) {
        throw new Error('The returned transactions could not be matched to this address. Refresh to check again.');
      }
      return data;
    },
  });

  function loadAddresses() {
    if (requested) void addresses.refetch();
    else setRequested(true);
  }

  const usableAddresses = addresses.data?.addresses.filter(item => !unavailablePaymentValue(item.address) && !unavailablePaymentValue(item.network) && !unavailablePaymentValue(item.coin)) ?? [];

  return <>
    <Card className="crypto-activity">
      <div className="billing-section-heading">
        <div className="billing-heading-label"><Icon name="database" size={20} /><h2 className="section-title">Tracked addresses</h2></div>
        <Button variant="secondary" loading={addresses.isFetching} onClick={loadAddresses}><Icon name={requested ? 'refresh' : 'database'} size={16} />{requested ? 'Refresh addresses' : 'Load tracked addresses'}</Button>
      </div>
      {!requested ? <div className="crypto-unrequested"><Icon name="database" size={26} /><p>Load tracked addresses to view transfers and balances.</p></div>
        : addresses.isPending ? <Skeleton rows={3} label="Loading tracked addresses…" />
        : addresses.isError ? <Alert tone="error" title="Addresses could not be loaded" actions={<Button variant="secondary" onClick={() => void addresses.refetch()}>Retry addresses</Button>}>{addresses.error.message}</Alert>
        : <div className="stack">
          <p className="crypto-report-meta muted">{formatNumber(usableAddresses.length)} {usableAddresses.length === 1 ? 'address' : 'addresses'} · Updated {formatDate(addresses.data.timestamp)}</p>
          {!usableAddresses.length && addresses.data.addresses.length > 0 ? <EmptyState icon={<Icon name="card" size={24} />} title="Payment service unavailable" description="No payment address is available for this account." /> : usableAddresses.length === 0 ? <EmptyState title="No tracked addresses" /> : <ul className="crypto-address-list">{usableAddresses.map(item => <li key={`${item.network}:${item.coin}:${item.address}`}>
            <article className="crypto-address">
              <div className="crypto-address-heading"><h3>{item.coin} <span className="muted">on {item.network}</span></h3><Badge tone={item.is_active ? 'accent' : 'neutral'}>{item.is_active === true ? 'Active' : item.is_active === false ? 'Inactive' : 'Status unavailable'}</Badge></div>
              <code className="crypto-exact">{item.address}</code>
              <dl className="crypto-details">
                <div><dt>Total received</dt><dd className="crypto-exact">{exactValue(item.total_received_readable)} {item.coin}</dd></div>
                <div><dt>Total received · raw units</dt><dd className="crypto-exact">{exactValue(item.total_received)}</dd></div>
                <div><dt>Last checked</dt><dd>{formatDate(item.last_checked_at)}</dd></div>
                <div><dt>Last transaction</dt><dd>{formatDate(item.last_tx_timestamp)}</dd></div>
              </dl>
              <Button variant="secondary" size="sm" onClick={() => setSelected(item)} aria-label={`View transactions for ${item.coin} on ${item.network}`}>View transactions</Button>
            </article>
          </li>)}</ul>}
          <p className="crypto-report-meta muted">For payment instructions, use the address and network on your current invoice.</p>
        </div>}
    </Card>
    <Dialog open={selected !== null} onClose={() => setSelected(null)} title="Address transactions" size="lg" footer={<><Button variant="secondary" loading={transactions.isFetching} onClick={() => void transactions.refetch()}>Refresh transactions</Button><Button onClick={() => setSelected(null)}>Close</Button></>}>
      {selected && <div className="stack crypto-transactions">
        <div><p className="crypto-report-meta muted">Tracked coin: {selected.coin} · Network: {selected.network}</p><code className="crypto-exact">{selected.address}</code></div>
        <p className="crypto-report-meta muted">Transfer activity · Check Payments for invoice status.</p>
        {transactions.isPending ? <Skeleton rows={4} label="Loading address transactions…" />
          : transactions.isError ? <Alert tone="error" title="Transactions could not be loaded" actions={<Button variant="secondary" onClick={() => void transactions.refetch()}>Retry transactions</Button>}>{transactions.error.message}</Alert>
          : transactions.data && <>
            <p className="crypto-report-meta muted">{formatNumber(transactions.data.transactions.length)} returned · {formatNumber(transactions.data.count)} reported · Updated {formatDate(transactions.data.timestamp)}</p>
            {!transactions.data.transactions.length ? <EmptyState title="No transactions reported" description="No transfers were returned for this address. Refresh later to check for updates." /> : <ol className="crypto-transaction-list">{transactions.data.transactions.map((item, index) => <li key={`${item.tx_hash}:${index}`}>
              <article className="crypto-transaction">
                <div className="crypto-address-heading"><h3>Transfer {index + 1}</h3><Badge tone={item.status === 'failed' ? 'error' : 'neutral'}>{item.status || 'Status unavailable'}</Badge></div>
                <dl className="crypto-details">
                  <div className="crypto-detail-wide"><dt>Transaction hash</dt><dd><code className="crypto-exact">{paymentDisplayValue(item.tx_hash)}</code></dd></div>
                  <div className="crypto-detail-wide"><dt>From address</dt><dd><code className="crypto-exact">{paymentDisplayValue(item.from_address)}</code></dd></div>
                  <div className="crypto-detail-wide"><dt>Amount · exact base units</dt><dd><code className="crypto-exact" data-testid="crypto-raw-amount">{exactValue(item.amount)}</code></dd></div>
                  <div><dt>Decimal places</dt><dd>{typeof item.decimals === 'number' && Number.isInteger(item.decimals) && item.decimals >= 0 ? item.decimals : 'Not available'}</dd></div>
                  <div><dt>Block number</dt><dd><code className="crypto-exact">{exactValue(item.block_number)}</code></dd></div>
                  <div><dt>Transaction time</dt><dd>{formatDate(item.timestamp)}</dd></div>
                  <div><dt>Recorded</dt><dd>{formatDate(item.created_at)}</dd></div>
                  <div><dt>Processed</dt><dd>{formatDate(item.processed_at)}</dd></div>
                </dl>
              </article>
            </li>)}</ol>}
          </>}
      </div>}
    </Dialog>
  </>;
}
