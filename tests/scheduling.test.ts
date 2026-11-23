import { describe, expect, it } from 'vitest';
import {
  canonicalVenue,
  computeSlotAvailability,
  findConflict,
  formatTime,
  parseTime,
  validateBookingDate,
  type ScheduledItem,
} from '@/lib/scheduling';

describe('R1-4 Scheduling conflict prevention & R1-8 slot availability', () => {
  it('parses and formats 24h HH:MM times as minutes since midnight', () => {
    expect(parseTime('08:00')).toBe(480);
    expect(parseTime('14:30')).toBe(870);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('10:00 AM')).toBeNull();
    expect(formatTime(480)).toBe('08:00');
    expect(formatTime(870)).toBe('14:30');
  });

  it('normalizes both parish church name spellings to the same canonical venue', () => {
    expect(canonicalVenue('Immaculate Conception Parish Church')).toBe('parish-church');
    expect(canonicalVenue('Immaculate Conception Cathedral Parish')).toBe('parish-church');
    expect(canonicalVenue('St. Jude Hospital Room 302')).toBe('st. jude hospital room 302');
  });

  it('rejects overlapping EXCLUSIVE appointments for the same priest (PRIEST_BUSY)', () => {
    const existing: ScheduledItem[] = [
      {
        id: 'wed-1',
        sacramentType: 'WEDDING', // 120 min: 09:00-11:00
        scheduledTime: '09:00',
        assignedPriestId: 'priest-1',
        location: 'Immaculate Conception Cathedral Parish',
      },
    ];

    const conflict = findConflict(
      {
        sacramentType: 'ANOINTING_OF_SICK',
        scheduledTime: '10:30',
        assignedPriestId: 'priest-1',
        location: 'Home Visit',
      },
      existing
    );
    expect(conflict?.kind).toBe('PRIEST_BUSY');
    expect(conflict?.withId).toBe('wed-1');
  });

  it('rejects overlapping ceremonies at the parish church even with different priests (VENUE_BUSY)', () => {
    const existing: ScheduledItem[] = [
      {
        id: 'fun-1',
        sacramentType: 'FUNERAL', // 90 min: 14:00-15:30
        scheduledTime: '14:00',
        assignedPriestId: 'priest-1',
        location: 'Immaculate Conception Parish Church',
      },
    ];

    const conflict = findConflict(
      {
        sacramentType: 'WEDDING',
        scheduledTime: '15:00',
        assignedPriestId: 'priest-2',
        location: 'Immaculate Conception Cathedral Parish',
      },
      existing
    );
    expect(conflict?.kind).toBe('VENUE_BUSY');
  });

  it('allows multiple families to share a GROUPED ceremony at the same start time up to capacity (10)', () => {
    const nineBaptisms: ScheduledItem[] = Array.from({ length: 9 }, (_, i) => ({
      id: `bap-${i}`,
      sacramentType: 'BAPTISM',
      scheduledTime: '10:00',
      assignedPriestId: 'priest-1',
      location: 'Immaculate Conception Cathedral Parish',
    }));

    // 10th baptism at the same start time succeeds
    expect(
      findConflict(
        {
          sacramentType: 'BAPTISM',
          scheduledTime: '10:00',
          assignedPriestId: 'priest-1',
          location: 'Immaculate Conception Cathedral Parish',
        },
        nineBaptisms
      )
    ).toBeNull();

    // 11th baptism at the same start time hits SLOT_FULL
    const tenBaptisms: ScheduledItem[] = [
      ...nineBaptisms,
      {
        id: 'bap-9',
        sacramentType: 'BAPTISM',
        scheduledTime: '10:00',
        assignedPriestId: 'priest-1',
        location: 'Immaculate Conception Cathedral Parish',
      },
    ];
    const fullConflict = findConflict(
      {
        sacramentType: 'BAPTISM',
        scheduledTime: '10:00',
        assignedPriestId: 'priest-1',
        location: 'Immaculate Conception Cathedral Parish',
      },
      tenBaptisms
    );
    expect(fullConflict?.kind).toBe('SLOT_FULL');
  });

  it('validates public booking dates (Mon-Sat, 3..180 days lead time)', () => {
    const today = '2026-11-23'; // Monday
    expect(validateBookingDate('2026-02-31', today)).toContain('valid date');
    // Same day or +2 days -> rejected (< 3 days lead)
    expect(validateBookingDate('2026-11-24', today)).toContain('at least 3 days');
    // Sunday 2026-11-29 -> rejected
    expect(validateBookingDate('2026-11-29', today)).toContain('Sundays');
    // Thursday 2026-11-26 (+3 days) -> allowed
    expect(validateBookingDate('2026-11-26', today)).toBeNull();
    // > 180 days ahead -> rejected (2027-08-02 is Monday)
    expect(validateBookingDate('2027-08-02', today)).toContain('180 days');
  });

  it('computes slot availability across the parish workday', () => {
    const existing: ScheduledItem[] = [
      {
        id: 'wed-1',
        sacramentType: 'WEDDING', // 09:00 - 11:00 (blocks 09:00 and 10:00 at venue)
        scheduledTime: '09:00',
        assignedPriestId: 'priest-1',
        location: 'Immaculate Conception Cathedral Parish',
      },
    ];
    const slots = computeSlotAvailability(
      'BAPTISM',
      existing,
      'Immaculate Conception Cathedral Parish'
    );
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['08:00']).toBe(true);
    expect(byTime['09:00']).toBe(false);
    expect(byTime['10:00']).toBe(false);
    expect(byTime['11:00']).toBe(true);
    expect(byTime['14:00']).toBe(true);
  });
});
