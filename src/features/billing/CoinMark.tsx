export function CoinMark({ coin }: { coin?: string }) {
  return <span className="coin-mark" aria-hidden="true">{coin === 'ETH' ? <svg viewBox="0 0 24 30" width="18" height="23" fill="currentColor"><path d="M12 1 2 16l10 6 10-6L12 1Z" opacity=".8" /><path d="m2 18 10 11 10-11-10 6-10-6Z" opacity=".5" /><path d="M12 1v21l10-6L12 1Z" opacity=".38" /></svg> : coin === 'USDT' ? '₮' : coin === 'USDC' ? '$' : coin?.slice(0, 1) ?? '$'}</span>;
}
