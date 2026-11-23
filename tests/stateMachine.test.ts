import { describe, expect, it } from 'vitest';
import {
  actorForRole,
  allowedNextStatuses,
  canTransition,
  isTerminal,
  transitionErrorMessage,
  type AppointmentStatusKey,
  type TransitionActor,
} from '@/lib/appointments/stateMachine';

const ALL_STATUSES: AppointmentStatusKey[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
const ALL_ACTORS: TransitionActor[] = ['ADMIN', 'PRIEST', 'CASHIER', 'SYSTEM', 'PUBLIC'];

describe('R1-3 Appointment lifecycle state machine', () => {
  it('enforces the exact transition table across every (from, to, actor) combination', () => {
    const expected: Record<TransitionActor, Record<AppointmentStatusKey, AppointmentStatusKey[]>> = {
      ADMIN: {
        PENDING: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        CANCELLED: [],
      },
      PRIEST: {
        PENDING: [],
        CONFIRMED: ['COMPLETED'],
        COMPLETED: [],
        CANCELLED: [],
      },
      CASHIER: {
        PENDING: [],
        CONFIRMED: [],
        COMPLETED: [],
        CANCELLED: [],
      },
      PUBLIC: {
        PENDING: [],
        CONFIRMED: [],
        COMPLETED: [],
        CANCELLED: [],
      },
      SYSTEM: {
        PENDING: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
        CONFIRMED: ['PENDING', 'COMPLETED'],
        COMPLETED: [],
        CANCELLED: [],
      },
    };

    for (const actor of ALL_ACTORS) {
      for (const from of ALL_STATUSES) {
        expect(allowedNextStatuses(from, actor)).toEqual(expected[actor][from]);
        for (const to of ALL_STATUSES) {
          const shouldAllow = expected[actor][from].includes(to);
          expect(canTransition(from, to, actor)).toBe(shouldAllow);
        }
      }
    }
  });

  it('marks COMPLETED and CANCELLED as terminal and rejects reopening them', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('CONFIRMED')).toBe(false);

    expect(canTransition('CANCELLED', 'PENDING', 'ADMIN')).toBe(false);
    expect(canTransition('COMPLETED', 'CONFIRMED', 'ADMIN')).toBe(false);
    expect(transitionErrorMessage('CANCELLED', 'PENDING', 'ADMIN')).toContain(
      'cancelled appointment cannot be changed'
    );
  });

  it('maps user roles to transition actors safely', () => {
    expect(actorForRole('ADMIN')).toBe('ADMIN');
    expect(actorForRole('PRIEST')).toBe('PRIEST');
    expect(actorForRole('CASHIER')).toBe('CASHIER');
    expect(actorForRole('UNKNOWN')).toBe('PUBLIC');
  });
});
