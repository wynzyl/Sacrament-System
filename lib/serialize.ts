// lib/serialize.ts
// JSON serialisation that keeps Prisma Decimal amounts as plain numbers with
// at most two decimals, so API clients keep receiving `fee: 500` / `amount: 500.1`.

import { Prisma } from '@prisma/client';

export function serialize(data: unknown): string {
  return JSON.stringify(data, function (this: Record<string, unknown>, key: string, value: unknown) {
    // JSON.stringify calls toJSON() before the replacer; inspect the raw value.
    const raw = this[key];
    if (Prisma.Decimal.isDecimal(raw)) return (raw as Prisma.Decimal).toNumber();
    return value;
  });
}

/** Deep-copy into plain JSON (Decimal -> number, Date -> ISO string). */
export function toPlain(data: unknown): Prisma.InputJsonValue {
  return JSON.parse(serialize(data)) as Prisma.InputJsonValue;
}
