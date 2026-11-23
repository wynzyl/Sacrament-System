// lib/scheduling.ts
// Pure scheduling rules (Constitution IV): durations, who may share a slot,
// conflict detection and public-booking slot availability. No database access
// here so every rule is unit-testable; lib/appointments/conflicts.ts feeds it
// rows from Postgres under a lock.

import { addDays, dayOfWeek, daysBetween, isValidDateOnly } from '@/lib/dates';
import { SACRAMENT_LABELS } from '@/lib/constants';

export type SacramentKey =
  | 'BAPTISM'
  | 'WEDDING'
  | 'CONFIRMATION'
  | 'FUNERAL'
  | 'FIRST_COMMUNION'
  | 'ANOINTING_OF_SICK'
  | 'MASS_INTENTION';

export interface SacramentRule {
  /** Minutes the ceremony occupies, used for overlap checks. */
  durationMin: number;
  /**
   * EXCLUSIVE: nothing else may overlap (for the same priest / venue).
   * GROUPED: several families may share one ceremony *starting at the same time*
   * (e.g. communal baptism), up to `capacity`.
   */
  mode: 'EXCLUSIVE' | 'GROUPED';
  capacity: number;
  /** Whether the ceremony occupies the parish church (venue conflicts apply). */
  usesVenue: boolean;
}

// Defaults the parish should confirm (see docs/PRD.md, open questions Q2-Q4).
export const SACRAMENT_RULES: Record<SacramentKey, SacramentRule> = {
  BAPTISM: { durationMin: 60, mode: 'GROUPED', capacity: 10, usesVenue: true },
  WEDDING: { durationMin: 120, mode: 'EXCLUSIVE', capacity: 1, usesVenue: true },
  CONFIRMATION: { durationMin: 90, mode: 'GROUPED', capacity: 10, usesVenue: true },
  FUNERAL: { durationMin: 90, mode: 'EXCLUSIVE', capacity: 1, usesVenue: true },
  FIRST_COMMUNION: { durationMin: 90, mode: 'GROUPED', capacity: 10, usesVenue: true },
  ANOINTING_OF_SICK: { durationMin: 30, mode: 'EXCLUSIVE', capacity: 1, usesVenue: false },
  MASS_INTENTION: { durationMin: 60, mode: 'GROUPED', capacity: 10, usesVenue: false },
};

export function ruleFor(type: string): SacramentRule {
  return SACRAMENT_RULES[type as SacramentKey] ?? SACRAMENT_RULES.BAPTISM;
}

/** Public booking window (see docs/PRD.md, open question Q3). */
export const BOOKING_CONFIG = {
  slots: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
  /** 0 = Sunday ... 6 = Saturday. Monday-Saturday. */
  openWeekdays: [1, 2, 3, 4, 5, 6],
  minLeadDays: 3,
  maxHorizonDays: 180,
  /**
   * Funerals and anointing of the sick are urgent and cannot wait for a 3-day
   * lead time, so they are arranged with the parish office, not online.
   */
  onlineSacraments: ['BAPTISM', 'WEDDING', 'CONFIRMATION', 'FIRST_COMMUNION', 'MASS_INTENTION'],
} as const;

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** "HH:MM" (24h) -> minutes since midnight, or null when it is not that format. */
export function parseTime(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// Venue identity
// ---------------------------------------------------------------------------

/**
 * The same church has been written two ways in this system ("Immaculate
 * Conception Parish Church" as the DB default and "...Cathedral Parish" in the
 * UI); both mean the parish church.
 */
export function canonicalVenue(location: string | null | undefined): string | null {
  const v = (location ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return null;
  if (v.includes('immaculate conception')) return 'parish-church';
  return v;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export interface ScheduledItem {
  id?: string;
  sacramentType: string;
  scheduledTime: string;
  assignedPriestId?: string | null;
  location?: string | null;
}

export type ConflictKind = 'PRIEST_BUSY' | 'VENUE_BUSY' | 'SLOT_FULL';

export interface Conflict {
  kind: ConflictKind;
  message: string;
  withId?: string;
}

function labelFor(type: string): string {
  return SACRAMENT_LABELS[type] ?? type;
}

/**
 * Check `candidate` against the other (non-cancelled) appointments on the same
 * calendar date. Returns the first conflict, or null when the slot is free.
 *
 * Rules:
 *  - A priest cannot be in two overlapping ceremonies, except when both are the
 *    same GROUPED sacrament starting at the same minute (one shared ceremony).
 *  - The parish church hosts one ceremony at a time, with the same exception;
 *    ceremonies that do not use the venue (anointing, mass intentions) are ignored.
 *  - A shared (grouped) ceremony has a capacity.
 */
export function findConflict(candidate: ScheduledItem, others: ScheduledItem[]): Conflict | null {
  const cRule = ruleFor(candidate.sacramentType);
  const cStart = parseTime(candidate.scheduledTime);
  if (cStart === null) return null; // invalid time is rejected by validation, not here
  const cEnd = cStart + cRule.durationMin;
  const cVenue = canonicalVenue(candidate.location);

  let groupMates = 0;

  for (const other of others) {
    if (candidate.id && other.id === candidate.id) continue;
    const oStart = parseTime(other.scheduledTime);
    if (oStart === null) continue; // legacy free-text time: cannot compare, skip
    const oRule = ruleFor(other.sacramentType);
    const oEnd = oStart + oRule.durationMin;
    if (!overlaps(cStart, cEnd, oStart, oEnd)) continue;

    const sameCeremony =
      cRule.mode === 'GROUPED' && candidate.sacramentType === other.sacramentType && cStart === oStart;

    const range = `${formatTime(oStart)}-${formatTime(oEnd)}`;

    if (candidate.assignedPriestId && other.assignedPriestId === candidate.assignedPriestId && !sameCeremony) {
      return {
        kind: 'PRIEST_BUSY',
        withId: other.id,
        message: `This priest already has a ${labelFor(other.sacramentType)} from ${range} on that day.`,
      };
    }

    const bothUseVenue = cRule.usesVenue && oRule.usesVenue;
    const sameVenue = !cRule.usesVenue || (cVenue !== null && cVenue === canonicalVenue(other.location));

    if (bothUseVenue && sameVenue && !sameCeremony) {
      return {
        kind: 'VENUE_BUSY',
        withId: other.id,
        message: `The venue is already booked for a ${labelFor(other.sacramentType)} from ${range} on that day.`,
      };
    }

    if (sameCeremony && (cRule.usesVenue ? sameVenue : true)) groupMates += 1;
  }

  if (cRule.mode === 'GROUPED' && groupMates >= cRule.capacity) {
    return {
      kind: 'SLOT_FULL',
      message: `That ${labelFor(candidate.sacramentType)} time is full (${cRule.capacity} bookings).`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public booking: which dates / slots can a parishioner request?
// ---------------------------------------------------------------------------

/** Returns an error message when `date` cannot be requested online, else null. */
export function validateBookingDate(date: string, today: string): string | null {
  if (!isValidDateOnly(date)) return 'Please choose a valid date.';
  if (!(BOOKING_CONFIG.openWeekdays as readonly number[]).includes(dayOfWeek(date))) {
    return 'The parish office does not schedule sacraments on Sundays.';
  }
  const lead = daysBetween(today, date);
  if (lead < BOOKING_CONFIG.minLeadDays) {
    return `Please choose a date at least ${BOOKING_CONFIG.minLeadDays} days from today.`;
  }
  if (lead > BOOKING_CONFIG.maxHorizonDays) {
    return `Bookings open up to ${BOOKING_CONFIG.maxHorizonDays} days ahead.`;
  }
  return null;
}

export function earliestBookingDate(today: string): string {
  return addDays(today, BOOKING_CONFIG.minLeadDays);
}

export function latestBookingDate(today: string): string {
  return addDays(today, BOOKING_CONFIG.maxHorizonDays);
}

export interface SlotAvailability {
  time: string;
  available: boolean;
  reason?: string;
}

/** Availability of every bookable slot for a sacrament on a date. */
export function computeSlotAvailability(
  sacramentType: string,
  existingOnDate: ScheduledItem[],
  location: string | null
): SlotAvailability[] {
  return BOOKING_CONFIG.slots.map((time) => {
    const conflict = findConflict(
      { sacramentType, scheduledTime: time, assignedPriestId: null, location },
      existingOnDate
    );
    return conflict ? { time, available: false, reason: conflict.kind } : { time, available: true };
  });
}
