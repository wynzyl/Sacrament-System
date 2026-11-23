import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  balanceDueCentavos,
  fromCentavos,
  isValidMoney,
  sumCentavos,
  sumMoney,
  toCentavos,
} from '@/lib/money';
import { summarizePayments } from '@/lib/payments/ledger';
import { serialize } from '@/lib/serialize';

describe('R1-1 Exact money (lib/money.ts)', () => {
  it('sums 0.10 + 0.20 across 1,000 payments to the exact centavo (PRD R1-1 acceptance)', () => {
    const payments: number[] = [];
    for (let i = 0; i < 500; i++) {
      payments.push(0.1, 0.2);
    }
    expect(payments).toHaveLength(1000);
    expect(sumCentavos(payments)).toBe(15_000);
    expect(sumMoney(payments)).toBe(150);
  });

  it('converts numbers, strings, and Prisma.Decimal values to integer centavos', () => {
    expect(toCentavos(500)).toBe(50_000);
    expect(toCentavos('1234.56')).toBe(123_456);
    expect(toCentavos(new Prisma.Decimal('99.95'))).toBe(9_995);
    expect(fromCentavos(9_995)).toBe(99.95);
  });

  it('validates money inputs with at most 2 decimal places', () => {
    expect(isValidMoney(0)).toBe(true);
    expect(isValidMoney(500)).toBe(true);
    expect(isValidMoney(12.34)).toBe(true);
    expect(isValidMoney(12.345)).toBe(false);
    expect(isValidMoney(Number.NaN)).toBe(false);
    expect(isValidMoney(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidMoney('500')).toBe(false);
  });

  it('computes non-negative outstanding balance in centavos', () => {
    expect(balanceDueCentavos(new Prisma.Decimal('500.00'), 20_000)).toBe(30_000);
    expect(balanceDueCentavos(500, 50_000)).toBe(0);
    expect(balanceDueCentavos(500, 60_000)).toBe(0);
  });

  it('summarizes cash and GCash payments net of negative reversals (FR-5.7)', () => {
    const summary = summarizePayments([
      { amount: new Prisma.Decimal('500.00'), paymentMethod: 'CASH' },
      { amount: new Prisma.Decimal('-500.00'), paymentMethod: 'CASH' },
      { amount: new Prisma.Decimal('1500.50'), paymentMethod: 'GCASH' },
      { amount: new Prisma.Decimal('0.10'), paymentMethod: 'CASH' },
      { amount: new Prisma.Decimal('0.20'), paymentMethod: 'CASH' },
    ]);
    expect(summary).toEqual({
      cash: 0.3,
      gcash: 1500.5,
      total: 1500.8,
    });
  });

  it('serializes Prisma.Decimal fields as JSON numbers with at most 2 decimals (FR-1.4)', () => {
    const payload = {
      fee: new Prisma.Decimal('500.00'),
      amount: new Prisma.Decimal('123.45'),
    };
    expect(JSON.parse(serialize(payload))).toEqual({ fee: 500, amount: 123.45 });
  });
});
