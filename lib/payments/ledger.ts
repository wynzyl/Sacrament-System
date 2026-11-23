// lib/payments/ledger.ts
// Low-level payment ledger operations shared by the payment and appointment
// services. Payments are append-only (Constitution II): a correction is a new
// REVERSAL row (negative amount) pointing at the original, never an edit.

import { Prisma, type Payment } from '@prisma/client';
import { ApiError } from '@/lib/http';
import { paymentSnapshot, userActor, writeAudit } from '@/lib/audit';
import { sumCentavos, fromCentavos } from '@/lib/money';
import { allocateReceiptNumber } from '@/lib/payments/receipts';

type Tx = Prisma.TransactionClient;

/**
 * Serialise concurrent money operations on one appointment. Held until the
 * surrounding transaction ends. Without this, two cashiers could both see a
 * balance of 500 and each record 500.
 */
export async function lockAppointmentRow(tx: Tx, appointmentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${appointmentId} FOR UPDATE`;
}

/** Net amount received for an appointment in centavos (payments minus reversals). */
export async function netPaidCentavos(tx: Tx, appointmentId: string): Promise<number> {
  const rows = await tx.payment.findMany({
    where: { appointmentId, deletedAt: null },
    select: { amount: true },
  });
  return sumCentavos(rows.map((r) => r.amount));
}

/**
 * Write a REVERSAL entry for `original`. Throws 409 if the original is itself
 * a reversal or was already reversed. Caller must hold the appointment lock.
 */
export async function createReversalEntry(
  tx: Tx,
  original: Payment,
  actor: { id: string; name: string; role: string },
  reason: string
): Promise<Payment> {
  if (original.kind !== 'PAYMENT') {
    throw new ApiError(409, 'A reversal entry cannot be reversed');
  }
  const already = await tx.payment.findUnique({ where: { reversesPaymentId: original.id }, select: { id: true } });
  if (already) {
    throw new ApiError(409, `Receipt ${original.receiptNumber} was already reversed`);
  }

  const receiptNumber = await allocateReceiptNumber(tx, 'RVS');
  const reversal = await tx.payment.create({
    data: {
      kind: 'REVERSAL',
      amount: new Prisma.Decimal(original.amount).neg(),
      paymentMethod: original.paymentMethod,
      receiptNumber,
      appointmentId: original.appointmentId,
      processedById: actor.id,
      reversesPaymentId: original.id,
      reason,
    },
  });

  await writeAudit(tx, {
    actor: userActor(actor),
    action: 'payment.reverse',
    entityType: 'Payment',
    entityId: reversal.id,
    before: paymentSnapshot(original),
    after: paymentSnapshot(reversal),
    reason,
  });

  return reversal;
}

export interface PaymentSummary {
  cash: number;
  gcash: number;
  total: number;
}

/** Cash / GCash / total of a ledger slice, net of reversals, computed in centavos. */
export function summarizePayments(
  payments: { amount: Prisma.Decimal | number | string; paymentMethod: string }[]
): PaymentSummary {
  let cash = 0;
  let gcash = 0;
  for (const p of payments) {
    const c = sumCentavos([p.amount]);
    if (p.paymentMethod === 'CASH') cash += c;
    else if (p.paymentMethod === 'GCASH') gcash += c;
  }
  return { cash: fromCentavos(cash), gcash: fromCentavos(gcash), total: fromCentavos(cash + gcash) };
}
