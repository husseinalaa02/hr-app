export function formatIQD(amount) {
  if (amount == null) return '—';
  return Number(amount).toLocaleString('en-US') + ' IQD';
}

// Iraqi phone placeholder hint
export const IQ_PHONE_PLACEHOLDER = '+964 7XX XXX XXXX';
