// lib/appointments/conflicts.ts
// Database side of scheduling correctness (Constitution IV): a per-date
// advisory lock plus a conflict query. The rules themselves are pure and live
// in lib/scheduling.ts.

import type { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/http';
import { findConflict, type ScheduledItem } from '@/lib/scheduling';

type Tx = Prisma.TransactionClient;

/**
 * Take a transaction-scoped advisory lock for one calendar date. Every code
 * path that creates or moves an appointment takes this lock *before* checking
 * for conflicts, so two concurrent requests for the same slot are serialised:
 * the second one sees the first one's row and is rejected. One lock per date
 * (rather than per priest) keeps lock ordering trivial and cannot deadlock;
 * parish write volume is far too low for it to matter.
 */
export async function lockScheduleDate(tx: Tx, dateOnly: string): Promise<void> {
  // pg_advisory_xact_lock returns void, which Prisma cannot deserialise from
  // $queryRaw, so use $executeRaw.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'schedule:' + dateOnly}))`;
}

export interface CandidateSlot extends ScheduledItem {
  scheduledDate: Date;
}

/** Throw a 409 if the candidate collides with an existing appointment. */
export async function assertNoScheduleConflict(tx: Tx, candidate: CandidateSlot): Promise<void> {
  const others = await tx.appointment.findMany({
    where: {
      scheduledDate: candidate.scheduledDate,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      ...(candidate.id ? { id: { not: candidate.id } } : {}),
    },
    select: { id: true, sacramentType: true, scheduledTime: true, assignedPriestId: true, location: true },
  });

  const conflict = findConflict(candidate, others);
  if (conflict) {
    throw new ApiError(409, conflict.message, conflict.kind);
  }
}

/** Existing non-cancelled appointments on a date, for slot availability. */
export async function loadDaySchedule(tx: Pick<Tx, 'appointment'>, scheduledDate: Date) {
  return tx.appointment.findMany({
    where: { scheduledDate, deletedAt: null, status: { not: 'CANCELLED' } },
    select: { id: true, sacramentType: true, scheduledTime: true, assignedPriestId: true, location: true },
  });
}
