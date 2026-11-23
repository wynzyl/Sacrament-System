// lib/format.ts
// Server-safe formatting used in error messages.

export function formatCurrencyPlain(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}
