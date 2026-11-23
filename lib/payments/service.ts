// lib/payments/service.ts
// Payment business logic (Constitution II). Every operation is one database
// transaction containing: the appointment lock, validation against the server's
// own view of the balance, the ledger entry, the receipt number, any appointment
// status change, and the audit rows. Nothing is trusted from the client except
// which appointment, how much, and how it was paid.

import type { Payment } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, type SessionUser } from '@/lib/http';
import { appointmentSnapshot, paymentSnapshot, userActor, writeAudit } from '@/lib/audit';
import { formatCurrencyPlain } from '@/lib/format';
import { balanceDueCentavos, fromCentavos, toCentavos } from '@/lib/money';
import { canTransition } from '@/lib/appointments/stateMachine';
import { TX_OPTIONS } from '@/lib/appointments/service';
import { allocateReceiptNumber } from '@/lib/payments/receipts';
import { createReversalEntry, lockAppointmentRow, netPaidCentavos } from '@/lib/payments/ledger';
import type { PaymentCreateInput } from '@/lib/validation';

const PAYMENT_INCLUDE = {
  appointment: {
    select: {
      id: true,
      participantName: true,
      sacramentType: true,
      scheduledDate: true,
      referenceNumber: true,
      status: true,
    },
  },
  processedBy: { select: { name: true } },
} as const;

export async function createPayment(actor: SessionUser, input: PaymentCreateInput) {
  if (actor.role !== 'CASHIER' && actor.role !== 'ADMIN') {
    throw new ApiError(403, 'Only cashiers can process payments');
  }

  return prisma.$transaction(async (tx) => {
    await lockAppointmentRow(tx, input.appointmentId);
    const appointment = await tx.appointment.findFirst({
      where: { id: input.appointmentId, deletedAt: null },
    });
    if (!appointment) throw new ApiError(404, 'Appointment not found');
    if (appointment.status === 'CANCELLED') {
      throw new ApiError(409, 'Cannot take a payment for a cancelled appointment');
    }

    const fee = toCentavos(appointment.fee);
    if (fee <= 0) throw new ApiError(409, 'No fee has been set for this appointment yet');

    const paid = await netPaidCentavos(tx, appointment.id);
    const balance = balanceDueCentavos(appointment.fee, paid);
    if (balance === 0)
      throw new ApiError(409, 'This appointment is already fully paid', 'ALREADY_PAID');

    const amount = toCentavos(input.amount);
    if (amount > balance) {
      throw new ApiError(
        409,
        `The amount exceeds the balance due of ${formatCurrencyPlain(fromCentavos(balance))}`,
        'EXCEEDS_BALANCE'
      );
    }

    const needsReference =
      input.paymentMethod === 'GCASH' ||
      input.paymentMethod === 'ONLINE_WALLET' ||
      input.paymentMethod === 'BANK_TRANSFER';

    // A wallet or bank reference identifies one real-world transaction: it can
    // be recorded once, even if the receipt was later reversed.
    if (needsReference && input.gcashRefNumber) {
      const dup = await tx.payment.findFirst({
        where: {
          kind: 'PAYMENT',
          gcashRefNumber: { equals: input.gcashRefNumber, mode: 'insensitive' },
        },
        select: { receiptNumber: true },
      });
      if (dup) {
        throw new ApiError(
          409,
          `That transaction reference was already recorded on receipt ${dup.receiptNumber}`,
          'DUPLICATE_REFERENCE'
        );
      }
    }

    const defaultChannel =
      input.paymentMethod === 'GCASH'
        ? 'GCASH'
        : input.paymentMethod === 'ONLINE_WALLET'
        ? input.providerChannel ?? 'MAYA'
        : input.paymentMethod === 'BANK_TRANSFER'
        ? input.providerChannel ?? 'INSTAPAY'
        : null;

    const receiptNumber = await allocateReceiptNumber(tx, 'RCP');
    const payment = await tx.payment.create({
      data: {
        kind: 'PAYMENT',
        amount: (amount / 100).toFixed(2),
        paymentMethod: input.paymentMethod,
        gcashRefNumber: needsReference ? input.gcashRefNumber ?? null : null,
        provider: needsReference ? 'MANUAL' : null,
        providerChannel: defaultChannel,
        receiptNumber,
        appointmentId: appointment.id,
        processedById: actor.id,
      },
      include: PAYMENT_INCLUDE,
    });

    await writeAudit(tx, {
      actor: userActor(actor),
      action: 'payment.create',
      entityType: 'Payment',
      entityId: payment.id,
      after: paymentSnapshot(payment),
    });

    // Payment confirms a pending booking (existing behaviour, now a validated
    // SYSTEM transition and audited).
    if (appointment.status === 'PENDING' && canTransition('PENDING', 'CONFIRMED', 'SYSTEM')) {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CONFIRMED' },
      });
      await writeAudit(tx, {
        actor: userActor(actor),
        action: 'appointment.status_change',
        entityType: 'Appointment',
        entityId: appointment.id,
        before: { status: 'PENDING' },
        after: { status: 'CONFIRMED' },
        reason: `Payment received (${receiptNumber})`,
      });
    }

    return payment;
  }, TX_OPTIONS);
}

/** Reverse (void/refund) a payment by appending a REVERSAL entry. Admin only. */
export async function reversePayment(actor: SessionUser, paymentId: string, reason: string) {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only administrators can reverse payments');

  return prisma.$transaction(async (tx) => {
    const original = await tx.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
    if (!original) throw new ApiError(404, 'Payment not found');

    await lockAppointmentRow(tx, original.appointmentId);
    const reversal: Payment = await createReversalEntry(tx, original, actor, reason);

    // A confirmed booking with nothing left paid returns to PENDING.
    let appointmentReturnedToPending = false;
    const appointment = await tx.appointment.findUnique({
      where: { id: original.appointmentId },
    });
    if (appointment && appointment.status === 'CONFIRMED') {
      const net = await netPaidCentavos(tx, appointment.id);
      if (net <= 0 && canTransition('CONFIRMED', 'PENDING', 'SYSTEM')) {
        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'PENDING' },
        });
        await writeAudit(tx, {
          actor: userActor(actor),
          action: 'appointment.status_change',
          entityType: 'Appointment',
          entityId: appointment.id,
          before: appointmentSnapshot(appointment),
          after: appointmentSnapshot(updated),
          reason: `Payment ${original.receiptNumber} reversed`,
        });
        appointmentReturnedToPending = true;
      }
    }

    const full = await tx.payment.findUniqueOrThrow({
      where: { id: reversal.id },
      include: PAYMENT_INCLUDE,
    });
    return { reversal: full, appointmentReturnedToPending };
  }, TX_OPTIONS);
}
