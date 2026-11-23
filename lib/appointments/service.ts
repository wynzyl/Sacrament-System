// lib/appointments/service.ts
// Appointment business logic (Constitution V: logic lives in lib/, not in route
// handlers or components). Every mutation runs in one transaction together with
// its audit row, takes the per-date schedule lock before checking conflicts,
// and goes through the state machine.

import { Prisma, type Appointment } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, type SessionUser } from '@/lib/http';
import {
  appointmentDiff,
  appointmentSnapshot,
  SYSTEM_ACTOR,
  userActor,
  writeAudit,
} from '@/lib/audit';
import { dateOnlyToUtc, manilaDateString, utcToDateOnly } from '@/lib/dates';
import { formatCurrencyPlain } from '@/lib/format';
import { generateReferenceNumber } from '@/lib/reference';
import { requirementsFor } from '@/lib/requirements';
import { assertNoScheduleConflict, lockScheduleDate } from '@/lib/appointments/conflicts';
import {
  actorForRole,
  canTransition,
  isTerminal,
  transitionErrorMessage,
} from '@/lib/appointments/stateMachine';
import { createReversalEntry, lockAppointmentRow, netPaidCentavos } from '@/lib/payments/ledger';
import { fromCentavos, toCentavos } from '@/lib/money';
import { DEFAULT_CITY, DEFAULT_LOCATION, DEFAULT_PROVINCE } from '@/lib/constants';
import { dispatchAppointmentNotificationById } from '@/lib/notifications';
import type {
  AppointmentCreateInput,
  AppointmentUpdateInput,
  CancelInput,
} from '@/lib/validation';

export type Tx = Prisma.TransactionClient;

/** Interactive transactions on a serverless Postgres need more than the 5s default. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run `fn`, retrying when the random reference number collides (P2002 on referenceNumber). */
export async function withReferenceRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('referenceNumber');
      if (!collided || i >= attempts - 1) throw error;
    }
  }
}

async function assertPriestAssignable(tx: Tx, priestId: string): Promise<void> {
  const priest = await tx.user.findFirst({
    where: { id: priestId, role: 'PRIEST', deletedAt: null },
    select: { name: true, status: true, availability: true },
  });
  if (!priest) throw new ApiError(400, 'The selected priest was not found');
  if (priest.status !== 'ACTIVE') throw new ApiError(409, `${priest.name} is inactive and cannot be assigned`);
  if (priest.availability === 'DAYOFF') throw new ApiError(409, `${priest.name} is on a day off`);
}

/** Make the checklist rows match the sacrament: add missing, drop unmet obsolete ones. */
export async function syncRequirements(tx: Tx, appointmentId: string, sacramentType: string): Promise<void> {
  const wanted = requirementsFor(sacramentType);
  const wantedKeys = wanted.map((r) => r.key);
  await tx.appointmentRequirement.deleteMany({
    where: { appointmentId, isMet: false, key: { notIn: wantedKeys } },
  });
  await tx.appointmentRequirement.createMany({
    data: wanted.map((r) => ({ appointmentId, key: r.key, label: r.label })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------------------
// Create (staff)
// ---------------------------------------------------------------------------

export async function createAppointment(actor: SessionUser, input: AppointmentCreateInput): Promise<Appointment> {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only administrators can create appointments');

  const scheduledDate = dateOnlyToUtc(input.scheduledDate);
  const location = input.location ?? DEFAULT_LOCATION;

  return withReferenceRetry(() =>
    prisma.$transaction(async (tx) => {
      await lockScheduleDate(tx, input.scheduledDate);
      if (input.assignedPriestId) await assertPriestAssignable(tx, input.assignedPriestId);
      await assertNoScheduleConflict(tx, {
        sacramentType: input.sacramentType,
        scheduledDate,
        scheduledTime: input.scheduledTime,
        assignedPriestId: input.assignedPriestId ?? null,
        location,
      });

      const appointment = await tx.appointment.create({
        data: {
          referenceNumber: generateReferenceNumber(),
          source: 'STAFF',
          sacramentType: input.sacramentType,
          participantName: input.participantName,
          participantPhone: input.participantPhone ?? null,
          participantEmail: input.participantEmail ?? null,
          barangay: input.barangay ?? null,
          city: input.city ?? DEFAULT_CITY,
          province: input.province ?? DEFAULT_PROVINCE,
          scheduledDate,
          scheduledTime: input.scheduledTime,
          location,
          notes: input.notes ?? null,
          status: 'PENDING', // always PENDING for new appointments
          fee: input.fee ?? 0,
          createdById: actor.id,
          assignedPriestId: input.assignedPriestId ?? null,
          requirements: {
            create: requirementsFor(input.sacramentType).map((r) => ({ key: r.key, label: r.label })),
          },
        },
      });

      await writeAudit(tx, {
        actor: userActor(actor),
        action: 'appointment.create',
        entityType: 'Appointment',
        entityId: appointment.id,
        after: appointmentSnapshot(appointment),
      });
      return appointment;
    }, TX_OPTIONS)
  );
}

// ---------------------------------------------------------------------------
// Update (staff / priest)
// ---------------------------------------------------------------------------

export async function updateAppointment(
  actor: SessionUser,
  id: string,
  input: AppointmentUpdateInput
): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Appointment not found');

    // --- authorization (server-side, Constitution III) ---
    if (actor.role === 'PRIEST') {
      if (existing.assignedPriestId !== actor.id) throw new ApiError(403, 'Access denied');
      const fields = Object.entries(input).filter(([, v]) => v !== undefined).map(([k]) => k);
      if (fields.some((f) => f !== 'status')) throw new ApiError(403, 'Access denied');
    } else if (actor.role !== 'ADMIN') {
      throw new ApiError(403, 'Only administrators can update appointments');
    }
    const transitionActor = actorForRole(actor.role);

    // --- status ---
    const statusChanged = input.status !== undefined && input.status !== existing.status;
    if (statusChanged) {
      if (input.status === 'CANCELLED') {
        throw new ApiError(400, 'Use the cancel action to cancel an appointment (a reason is required)');
      }
      if (!canTransition(existing.status, input.status!, transitionActor)) {
        throw new ApiError(409, transitionErrorMessage(existing.status, input.status!, transitionActor), 'INVALID_TRANSITION');
      }
    }

    // --- build the next schedule ---
    const nextType = input.sacramentType ?? existing.sacramentType;
    const nextDateOnly = input.scheduledDate ?? utcToDateOnly(existing.scheduledDate);
    const nextTime = input.scheduledTime ?? existing.scheduledTime;
    const nextLocation = input.location !== undefined ? input.location : existing.location;
    const nextPriest = input.assignedPriestId !== undefined ? input.assignedPriestId : existing.assignedPriestId;

    const typeChanged = nextType !== existing.sacramentType;
    const slotChanged =
      typeChanged ||
      nextDateOnly !== utcToDateOnly(existing.scheduledDate) ||
      nextTime !== existing.scheduledTime ||
      (nextLocation ?? null) !== (existing.location ?? null) ||
      (nextPriest ?? null) !== (existing.assignedPriestId ?? null);

    if (slotChanged && isTerminal(existing.status)) {
      throw new ApiError(409, `A ${existing.status.toLowerCase()} appointment can no longer be rescheduled or reassigned`);
    }

    if (slotChanged) {
      await lockScheduleDate(tx, nextDateOnly);
      if (nextPriest && nextPriest !== existing.assignedPriestId) await assertPriestAssignable(tx, nextPriest);
      await assertNoScheduleConflict(tx, {
        id: existing.id,
        sacramentType: nextType,
        scheduledDate: dateOnlyToUtc(nextDateOnly),
        scheduledTime: nextTime,
        assignedPriestId: nextPriest ?? null,
        location: nextLocation,
      });
    }

    // --- fee must never fall below what has already been received ---
    if (input.fee !== undefined && toCentavos(input.fee) !== toCentavos(existing.fee)) {
      await lockAppointmentRow(tx, id);
      const paid = await netPaidCentavos(tx, id);
      if (toCentavos(input.fee) < paid) {
        throw new ApiError(
          409,
          `The fee cannot be lower than the ${formatCurrencyPlain(fromCentavos(paid))} already received. Reverse a payment first.`
        );
      }
    }

    const data: Prisma.AppointmentUncheckedUpdateInput = {};
    if (input.sacramentType !== undefined) data.sacramentType = input.sacramentType;
    if (input.participantName !== undefined) data.participantName = input.participantName;
    if (input.participantPhone !== undefined) data.participantPhone = input.participantPhone;
    if (input.participantEmail !== undefined) data.participantEmail = input.participantEmail;
    if (input.barangay !== undefined) data.barangay = input.barangay;
    if (input.city !== undefined) data.city = input.city;
    if (input.province !== undefined) data.province = input.province;
    if (input.scheduledDate !== undefined) data.scheduledDate = dateOnlyToUtc(input.scheduledDate);
    if (input.scheduledTime !== undefined) data.scheduledTime = input.scheduledTime;
    if (input.location !== undefined) data.location = input.location;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.fee !== undefined) data.fee = input.fee;
    if (input.assignedPriestId !== undefined) data.assignedPriestId = input.assignedPriestId;
    if (statusChanged) data.status = input.status;

    const updated = await tx.appointment.update({ where: { id }, data });
    if (typeChanged) await syncRequirements(tx, id, nextType);

    const diff = appointmentDiff(existing, updated);
    if (Object.keys(diff.before).length > 0 || Object.keys(diff.after).length > 0) {
      await writeAudit(tx, {
        actor: userActor(actor),
        action: statusChanged && Object.keys(diff.after).length === 1 ? 'appointment.status_change' : 'appointment.update',
        entityType: 'Appointment',
        entityId: id,
        before: diff.before,
        after: diff.after,
      });
    }
    return {
      updated,
      justConfirmed: statusChanged && updated.status === 'CONFIRMED',
      feeChanged:
        input.fee !== undefined &&
        toCentavos(input.fee) !== toCentavos(existing.fee) &&
        toCentavos(updated.fee) > 0,
    };
  }, TX_OPTIONS).then(async ({ updated, justConfirmed, feeChanged }) => {
    if (updated.participantEmail) {
      if (feeChanged) {
        try {
          await dispatchAppointmentNotificationById({
            appointmentId: updated.id,
            template: 'FEE_ASSESSED',
            actor: userActor(actor),
          });
        } catch {
          // Do not fail update if notification dispatch fails
        }
      }
      if (justConfirmed) {
        try {
          await dispatchAppointmentNotificationById({
            appointmentId: updated.id,
            template: 'SCHEDULE_CONFIRMED',
            actor: userActor(actor),
          });
        } catch {
          // Do not fail update if notification dispatch fails
        }
      }
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Cancel (admin) - states the effect on any money received (Constitution IV)
// ---------------------------------------------------------------------------

export async function cancelAppointment(
  actor: SessionUser,
  id: string,
  input: CancelInput
): Promise<{ appointment: Appointment; refundedCentavos: number }> {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only administrators can cancel appointments');

  return prisma.$transaction(async (tx) => {
    await lockAppointmentRow(tx, id);
    const existing = await tx.appointment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Appointment not found');
    if (existing.status === 'CANCELLED') throw new ApiError(409, 'This appointment is already cancelled');
    if (!canTransition(existing.status, 'CANCELLED', 'ADMIN')) {
      throw new ApiError(409, transitionErrorMessage(existing.status, 'CANCELLED', 'ADMIN'), 'INVALID_TRANSITION');
    }

    const paid = await netPaidCentavos(tx, id);
    let refunded = 0;
    if (paid > 0) {
      if (!input.paymentDisposition) {
        throw new ApiError(
          400,
          `${formatCurrencyPlain(fromCentavos(paid))} has been received for this appointment. Choose whether to refund it or forfeit it.`,
          'PAYMENT_DISPOSITION_REQUIRED'
        );
      }
      if (input.paymentDisposition === 'REFUND') {
        const originals = await tx.payment.findMany({
          where: { appointmentId: id, kind: 'PAYMENT', deletedAt: null, reversal: null },
          orderBy: { createdAt: 'asc' },
        });
        for (const original of originals) {
          await createReversalEntry(tx, original, actor, `Refund: appointment cancelled - ${input.reason}`);
        }
        refunded = paid;
      }
    }

    const updated = await tx.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: input.reason, cancelledAt: new Date() },
    });

    await writeAudit(tx, {
      actor: userActor(actor),
      action: 'appointment.cancel',
      entityType: 'Appointment',
      entityId: id,
      before: appointmentSnapshot(existing),
      after: {
        ...appointmentSnapshot(updated),
        paymentDisposition: paid > 0 ? input.paymentDisposition : 'NONE',
        amountReceived: fromCentavos(paid),
      },
      reason: input.reason,
    });

    return {
      appointment: updated,
      refundedCentavos: refunded,
      disposition: (paid > 0 ? input.paymentDisposition : 'NONE') as 'REFUND' | 'FORFEIT' | 'NONE',
    };
  }, TX_OPTIONS).then(async ({ appointment, refundedCentavos, disposition }) => {
    if (appointment.participantEmail) {
      try {
        await dispatchAppointmentNotificationById({
          appointmentId: appointment.id,
          template: 'APPOINTMENT_CANCELLED',
          paymentDisposition: disposition,
          refundedAmount: fromCentavos(refundedCentavos),
          actor: userActor(actor),
        });
      } catch {
        // Do not fail cancellation if notification dispatch fails
      }
    }
    return { appointment, refundedCentavos };
  });
}

// ---------------------------------------------------------------------------
// Auto-completion (system transition, audited)
// ---------------------------------------------------------------------------

/**
 * Once an appointment's date has passed (Manila calendar), staff-entered
 * appointments are marked COMPLETED - the existing behaviour, now audited as a
 * SYSTEM action. An *online request nobody confirmed* is never reported as
 * completed to the parishioner: it expires as CANCELLED instead.
 *
 * Still triggered on read (docs/PRD.md risk R2); a scheduled job replaces this in R2-6.
 */
export async function autoCompletePastAppointments(now: Date = new Date()): Promise<number> {
  const today = dateOnlyToUtc(manilaDateString(now));
  const due = await prisma.appointment.findMany({
    where: { scheduledDate: { lt: today }, status: { in: ['PENDING', 'CONFIRMED'] }, deletedAt: null },
    select: { id: true, status: true, source: true },
  });
  if (due.length === 0) return 0;

  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of due) {
      const expire = row.source === 'ONLINE' && row.status === 'PENDING';
      const to = expire ? 'CANCELLED' : 'COMPLETED';
      const result = await tx.appointment.updateMany({
        where: { id: row.id, status: row.status },
        data: expire
          ? { status: 'CANCELLED', cancelReason: 'Expired: not confirmed before the scheduled date', cancelledAt: now }
          : { status: 'COMPLETED' },
      });
      if (result.count === 1) {
        changed += 1;
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          action: expire ? 'appointment.auto_expire' : 'appointment.auto_complete',
          entityType: 'Appointment',
          entityId: row.id,
          before: { status: row.status },
          after: { status: to },
          reason: 'Scheduled date has passed',
        });
      }
    }
  }, TX_OPTIONS);
  return changed;
}

// ---------------------------------------------------------------------------
// Requirement checklist
// ---------------------------------------------------------------------------

export async function listRequirements(appointmentId: string) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
      select: { id: true, sacramentType: true, assignedPriestId: true },
    });
    if (!appt) throw new ApiError(404, 'Appointment not found');
    // Lazily create rows for appointments that pre-date the checklist.
    await syncRequirements(tx, appointmentId, appt.sacramentType);
    const rows = await tx.appointmentRequirement.findMany({ where: { appointmentId }, orderBy: { label: 'asc' } });
    return { appointment: appt, requirements: rows };
  }, TX_OPTIONS);
}

export async function setRequirement(actor: SessionUser, appointmentId: string, key: string, isMet: boolean) {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only administrators can update the checklist');

  return prisma.$transaction(async (tx) => {
    const row = await tx.appointmentRequirement.findUnique({
      where: { appointmentId_key: { appointmentId, key } },
      include: { appointment: { select: { deletedAt: true } } },
    });
    if (!row || row.appointment.deletedAt) throw new ApiError(404, 'Requirement not found');
    if (row.isMet === isMet) return row;

    const updated = await tx.appointmentRequirement.update({
      where: { id: row.id },
      data: { isMet, verifiedById: isMet ? actor.id : null, verifiedAt: isMet ? new Date() : null },
    });
    await writeAudit(tx, {
      actor: userActor(actor),
      action: isMet ? 'requirement.check' : 'requirement.uncheck',
      entityType: 'AppointmentRequirement',
      entityId: row.id,
      before: { appointmentId, key, isMet: row.isMet },
      after: { appointmentId, key, isMet },
    });
    return updated;
  }, TX_OPTIONS).then(async (updated) => {
    try {
      await dispatchAppointmentNotificationById({
        appointmentId,
        template: 'DOCUMENT_FEEDBACK',
        requirementLabel: updated.label,
        requirementStatus: isMet ? 'VERIFIED' : 'RESUBMIT_REQUIRED',
        actor: userActor(actor),
      });
    } catch {
      // Ignore if appointment has no email on file
    }
    return updated;
  });
}
