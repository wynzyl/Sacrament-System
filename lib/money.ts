// lib/money.ts
// Exact money handling (Constitution II). Amounts are stored as DECIMAL(12,2)
// in the database; all arithmetic here is done in integer centavos so that
// 0.1 + 0.2 is exactly 0.3.

import type { Prisma } from '@prisma/client';

export type MoneyInput = number | string | Prisma.Decimal;

export const MAX_MONEY = 9_999_999_999.99;

/** True if the value is a finite number with at most two decimal places. */
export function isValidMoney(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6 && Math.abs(value) <= MAX_MONEY;
}

/** Convert a money value to integer centavos. */
export function toCentavos(value: MoneyInput): number {
  if (typeof value === 'number') return Math.round(value * 100);
  if (typeof value === 'string') return Math.round(Number(value) * 100);
  // Prisma.Decimal: scale exactly, no float involved.
  return value.mul(100).toDecimalPlaces(0).toNumber();
}

/** Integer centavos -> a JSON-friendly number with at most two decimals. */
export function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function sumCentavos(values: MoneyInput[]): number {
  return values.reduce<number>((total, v) => total + toCentavos(v), 0);
}

/** Sum of money values as a number with two decimals, computed in centavos. */
export function sumMoney(values: MoneyInput[]): number {
  return fromCentavos(sumCentavos(values));
}

/** Outstanding balance in centavos (never negative). */
export function balanceDueCentavos(fee: MoneyInput, netPaidCentavos: number): number {
  return Math.max(0, toCentavos(fee) - netPaidCentavos);
}
