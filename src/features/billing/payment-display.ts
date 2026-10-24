/** Non-payable adapter sentinels must never become payment instructions. */
export function unavailablePaymentValue(value: string | undefined) {
  return value === 'demo-network' || value === 'DEMO' || Boolean(value?.startsWith('DEMO_'));
}

export function paymentDisplayValue(value: string | undefined) {
  return !value || unavailablePaymentValue(value) ? 'Unavailable' : value;
}
