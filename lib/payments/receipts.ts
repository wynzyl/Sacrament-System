// lib/payments/receipts.ts
// Sequential, gap-free receipt numbers allocated inside the payment transaction
// (Constitution II). Replaces the old Math.random() generator, which collided.

import type { Prisma } from '@prisma/client';
import { manilaYear } from '@/lib/dates';

export type ReceiptPrefix = 'RCP' | 'RVS';

export function formatReceiptNumber(prefix: ReceiptPrefix, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Atomically increment and return the next number for `prefix` in the current
 * Manila year. Must be called with the transaction client so the increment
 * rolls back together with the payment if anything later fails.
 */
export async function allocateReceiptNumber(
  tx: Prisma.TransactionClient,
  prefix: ReceiptPrefix,
  now: Date = new Date()
): Promise<string> {
  const year = manilaYear(now);
  const key = `${prefix}-${year}`;
  // Raw SQL (parameterised) because Prisma's upsert is not an atomic
  // increment when two transactions create the first row of a year at once.
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return formatReceiptNumber(prefix, year, rows[0].value);
}
