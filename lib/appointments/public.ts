// lib/appointments/public.ts
// Parishioner-facing booking: availability, request and status tracking.
// Everything here is reachable without a login, so it validates strictly,
// exposes the minimum personal data and never confirms anything on its own
// (Constitution I and III).

import { prisma } from '@/lib/prisma';
import { ApiError, type SessionUser } from '@/lib/http';
import { PUBLIC_ACTOR, userActor, appointmentSnapshot, writeAudit } from '@/lib/audit';
import { dateOnlyToUtc, manilaDateString } from '@/lib/dates';
import { generateReferenceNumber, normalizeReference } from '@/lib/reference';
import { requirementsFor } from '@/lib/requirements';
import { computeSlotAvailability, validateBookingDate } from '@/lib/scheduling';
import { assertNoScheduleConflict, loadDaySchedule, lockScheduleDate } from '@/lib/appointments/conflicts';
import { TX_OPTIONS, withReferenceRetry } from '@/lib/appointments/service';
import { balanceDueCentavos, fromCentavos, sumCentavos, toCentavos } from '@/lib/money';
import { getArancelTariff } from '@/lib/arancel';
import { DEFAULT_CITY, DEFAULT_LOCATION, DEFAULT_PROVINCE } from '@/lib/constants';
import {
  buildAppointmentPassData,
  buildOfficialReceiptData,
  type AppointmentPassData,
  type OfficialReceiptData,
} from '@/lib/receiptPass';
import type { PublicBookingInput } from '@/lib/validation';

export function isPublicBookingEnabled(): boolean {
  return process.env.PUBLIC_BOOKING_ENABLED !== 'false';
}

export function assertPublicBookingEnabled(): void {
  if (!isPublicBookingEnabled()) {
    throw new ApiError(404, 'Online booking is not available yet. Please contact the parish office.');
  }
}

export async function getSlotAvailability(sacramentType: string, date: string, now: Date = new Date()) {
  const problem = validateBookingDate(date, manilaDateString(now));
  if (problem) throw new ApiError(400, problem);

  const existing = await loadDaySchedule(prisma, dateOnlyToUtc(date));
  return computeSlotAvailability(sacramentType, existing, DEFAULT_LOCATION);
}

export async function createOnlineBooking(
  input: PublicBookingInput,
  actor?: SessionUser | null,
  now: Date = new Date()
) {
  const problem = validateBookingDate(input.scheduledDate, manilaDateString(now));
  if (problem) throw new ApiError(400, problem);

  const scheduledDate = dateOnlyToUtc(input.scheduledDate);

  const appointment = await withReferenceRetry(() =>
    prisma.$transaction(async (tx) => {
      await lockScheduleDate(tx, input.scheduledDate);
      try {
        await assertNoScheduleConflict(tx, {
          sacramentType: input.sacramentType,
          scheduledDate,
          scheduledTime: input.scheduledTime,
          assignedPriestId: null,
          location: DEFAULT_LOCATION,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new ApiError(409, 'Sorry, that time was just taken. Please choose another time.', 'SLOT_TAKEN');
        }
        throw error;
      }

      const created = await tx.appointment.create({
        data: {
          referenceNumber: generateReferenceNumber(now),
          source: 'ONLINE',
          sacramentType: input.sacramentType,
          participantName: input.participantName,
          participantPhone: input.participantPhone,
          participantEmail: actor?.email ?? input.participantEmail ?? null,
          barangay: input.barangay ?? null,
          city: DEFAULT_CITY,
          province: DEFAULT_PROVINCE,
          scheduledDate,
          scheduledTime: input.scheduledTime,
          location: DEFAULT_LOCATION,
          notes: input.notes ?? null,
          status: 'PENDING', // never confirmed automatically
          fee: getArancelTariff(input.sacramentType).baseFee, // standard Diocesan Arancel base tariff
          createdById: actor?.id ?? null,
          requirements: {
            create: requirementsFor(input.sacramentType).map((r) => ({ key: r.key, label: r.label })),
          },
        },
        select: { id: true, referenceNumber: true, sacramentType: true, scheduledDate: true, scheduledTime: true, source: true, status: true, fee: true, location: true },
      });

      await writeAudit(tx, {
        actor: actor ? userActor(actor) : PUBLIC_ACTOR,
        action: 'appointment.create',
        entityType: 'Appointment',
        entityId: created.id,
        after: appointmentSnapshot(created),
        reason: 'Online booking request by verified parishioner account',
      });
      return created;
    }, TX_OPTIONS)
  );

  return {
    referenceNumber: appointment.referenceNumber,
    sacramentType: appointment.sacramentType,
    scheduledDate: input.scheduledDate,
    scheduledTime: appointment.scheduledTime,
    status: appointment.status,
    fee: fromCentavos(toCentavos(appointment.fee)),
    requirements: requirementsFor(appointment.sacramentType),
  };
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** Last 10 digits - makes 0917..., +63917... and 917... compare equal. */
function phoneKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

function contactMatches(contact: string, appt: { participantPhone: string | null; participantEmail: string | null }): boolean {
  const input = contact.trim();
  if (input.includes('@')) {
    return !!appt.participantEmail && appt.participantEmail.trim().toLowerCase() === input.toLowerCase();
  }
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return false; // too short to be a safe second factor
  return phoneKey(input) === phoneKey(appt.participantPhone) && phoneKey(appt.participantPhone).length === 10;
}

const NOT_FOUND = 'We could not find a booking with those details. Check the reference number and the phone or email you used.';

/**
 * Look up a booking by reference number AND the contact it was made with.
 * A wrong reference and a wrong contact produce the identical error so the
 * endpoint cannot be used to discover which references exist.
 */
export async function trackBooking(reference: string, contact: string) {
  const appt = await prisma.appointment.findFirst({
    where: { referenceNumber: normalizeReference(reference), deletedAt: null },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
      requirements: { select: { label: true, isMet: true }, orderBy: { label: 'asc' } },
    },
  });
  if (!appt || !contactMatches(contact, appt)) throw new ApiError(404, NOT_FOUND);

  const paid = sumCentavos(appt.payments.map((p) => p.amount));
  return {
    referenceNumber: appt.referenceNumber,
    sacramentType: appt.sacramentType,
    status: appt.status,
    scheduledDate: appt.scheduledDate.toISOString().slice(0, 10),
    scheduledTime: appt.scheduledTime,
    location: appt.location,
    fee: appt.fee,
    amountPaid: fromCentavos(paid),
    balanceDue: fromCentavos(balanceDueCentavos(appt.fee, paid)),
    requirements: appt.requirements,
  };
}

/**
 * Retrieve the full QR Appointment Confirmation Pass and Official Receipts
 * (`RCP-YYYY-NNNNN`) for a booking.
 *
 * Accessible when:
 * 1) The caller has an active authenticated session as staff (`ADMIN`, `CASHIER`, `PRIEST`), OR
 * 2) The caller has an active authenticated session as the booking owner (`createdById`, matching email, or matching phone), OR
 * 3) The caller supplies a valid second-factor `contact` (mobile number or email used on the booking).
 */
export async function getAppointmentPassAndReceipts(
  reference: string,
  options: { contact?: string | null; actor?: SessionUser | null } = {}
): Promise<{ pass: AppointmentPassData; receipts: OfficialReceiptData[] }> {
  const normalizedRef = normalizeReference(reference);
  const appt = await prisma.appointment.findFirst({
    where: { referenceNumber: normalizedRef, deletedAt: null },
    include: {
      assignedPriest: { select: { name: true } },
      requirements: {
        select: { key: true, label: true, isMet: true, verifiedAt: true },
        orderBy: { label: 'asc' },
      },
      payments: {
        where: { deletedAt: null },
        include: {
          processedBy: { select: { name: true } },
          reversal: { select: { id: true, receiptNumber: true } },
          reversesPayment: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!appt) throw new ApiError(404, NOT_FOUND);

  const actor = options.actor;
  const isStaff =
    !!actor && (actor.role === 'ADMIN' || actor.role === 'CASHIER' || actor.role === 'PRIEST');
  const isOwnerById = !!actor && !!appt.createdById && appt.createdById === actor.id;
  const isOwnerByEmail =
    !!actor &&
    !!actor.email &&
    !!appt.participantEmail &&
    appt.participantEmail.trim().toLowerCase() === actor.email.trim().toLowerCase();
  const isOwnerByPhone =
    !!actor &&
    !!actor.phone &&
    phoneKey(actor.phone).length === 10 &&
    phoneKey(actor.phone) === phoneKey(appt.participantPhone);
  const isContactVerified =
    !!options.contact && options.contact.trim().length > 0 && contactMatches(options.contact, appt);

  if (!isStaff && !isOwnerById && !isOwnerByEmail && !isOwnerByPhone && !isContactVerified) {
    throw new ApiError(404, NOT_FOUND);
  }

  const pass = buildAppointmentPassData(appt, appt.payments, appt.requirements);
  const receipts = appt.payments.map((payment) => buildOfficialReceiptData(payment, appt));

  return { pass, receipts };
}
