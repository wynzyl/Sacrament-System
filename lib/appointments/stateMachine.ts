// lib/appointments/stateMachine.ts
// Appointment lifecycle (Constitution IV). Pure and dependency-free so the same
// rules drive the API (enforcement) and the admin form (which options to show).
//
//   PENDING ──► CONFIRMED ──► COMPLETED
//      │            │
//      └────────────┴──► CANCELLED          (COMPLETED and CANCELLED are terminal)
//
// SYSTEM transitions are performed by the application itself (never by a user
// clicking a status): a payment confirming a booking, a void returning it to
// PENDING, and auto-completion once the date has passed.

export type AppointmentStatusKey = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type TransitionActor = 'ADMIN' | 'PRIEST' | 'CASHIER' | 'SYSTEM' | 'PUBLIC';

const TRANSITIONS: Record<TransitionActor, Partial<Record<AppointmentStatusKey, AppointmentStatusKey[]>>> = {
  ADMIN: {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
  },
  PRIEST: {
    CONFIRMED: ['COMPLETED'],
  },
  CASHIER: {},
  PUBLIC: {},
  SYSTEM: {
    PENDING: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
    CONFIRMED: ['PENDING', 'COMPLETED'],
  },
};

export const TERMINAL_STATUSES: AppointmentStatusKey[] = ['COMPLETED', 'CANCELLED'];

export function isTerminal(status: string): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/** Statuses `actor` may move an appointment to from `from` (excluding staying put). */
export function allowedNextStatuses(from: string, actor: TransitionActor): AppointmentStatusKey[] {
  return TRANSITIONS[actor]?.[from as AppointmentStatusKey] ?? [];
}

export function canTransition(from: string, to: string, actor: TransitionActor): boolean {
  return allowedNextStatuses(from, actor).includes(to as AppointmentStatusKey);
}

export function transitionErrorMessage(from: string, to: string, actor: TransitionActor): string {
  if (isTerminal(from)) {
    return `A ${from.toLowerCase()} appointment cannot be changed to ${to.toLowerCase()}`;
  }
  if (actor === 'PRIEST') {
    return 'Priests can only mark a confirmed appointment as completed';
  }
  return `Cannot change an appointment from ${from.toLowerCase()} to ${to.toLowerCase()}`;
}

/** Map a session role to a transition actor. */
export function actorForRole(role: string): TransitionActor {
  if (role === 'ADMIN' || role === 'PRIEST' || role === 'CASHIER') return role;
  return 'PUBLIC';
}
