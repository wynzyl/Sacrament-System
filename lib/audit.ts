// lib/audit.ts
// Append-only audit trail (Constitution II). The application only ever inserts;
// the add_phase1_foundations migration adds a trigger that rejects UPDATE,
// DELETE and TRUNCATE on the table.
//
// Always call writeAudit with the *transaction client* of the change it
// describes, so the change and its audit row commit (or roll back) together.
//
// Snapshots deliberately leave out participant names, phone numbers, emails and
// notes (Data Privacy Act): they record what changed about the booking, not who
// the family is.

import type { Prisma, PrismaClient } from '@prisma/client';
import { toPlain } from '@/lib/serialize';

export type AuditActor =
  | { type: 'USER'; id: string; name: string; role: string }
  | { type: 'SYSTEM' }
  | { type: 'PUBLIC' };

export function userActor(user: { id: string; name: string; role: string }): AuditActor {
  return { type: 'USER', id: user.id, name: user.name, role: user.role };
}

export const SYSTEM_ACTOR: AuditActor = { type: 'SYSTEM' };
export const PUBLIC_ACTOR: AuditActor = { type: 'PUBLIC' };

type Db = Prisma.TransactionClient | PrismaClient;

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  entityType: 'Appointment' | 'Payment' | 'User' | 'AppointmentRequirement';
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  const { actor } = entry;
  await db.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.type === 'USER' ? actor.id : null,
      actorName: actor.type === 'USER' ? actor.name : null,
      actorRole: actor.type === 'USER' ? actor.role : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined || entry.before === null ? undefined : toPlain(entry.before),
      after: entry.after === undefined || entry.after === null ? undefined : toPlain(entry.after),
      reason: entry.reason ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Snapshots (whitelists - never spread a whole row into the audit log)
// ---------------------------------------------------------------------------

const APPOINTMENT_AUDIT_FIELDS = [
  'referenceNumber',
  'source',
  'sacramentType',
  'status',
  'scheduledDate',
  'scheduledTime',
  'location',
  'fee',
  'assignedPriestId',
  'cancelReason',
] as const;

const APPOINTMENT_PII_FIELDS = [
  'participantName',
  'participantPhone',
  'participantEmail',
  'barangay',
  'city',
  'province',
  'notes',
] as const;

function pick(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in source) out[f] = source[f];
  }
  return out;
}

export function appointmentSnapshot(a: object): Record<string, unknown> {
  return pick(a as Record<string, unknown>, APPOINTMENT_AUDIT_FIELDS);
}

/**
 * Before/after snapshots limited to the fields that actually changed, plus a
 * flag when participant contact details changed (their values are not stored).
 */
export function appointmentDiff(
  before: object,
  after: object
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const outBefore: Record<string, unknown> = {};
  const outAfter: Record<string, unknown> = {};

  for (const f of APPOINTMENT_AUDIT_FIELDS) {
    const bv = toPlain(b[f] ?? null);
    const av = toPlain(a[f] ?? null);
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      outBefore[f] = bv;
      outAfter[f] = av;
    }
  }
  const piiChanged = APPOINTMENT_PII_FIELDS.filter(
    (f) => JSON.stringify(toPlain(b[f] ?? null)) !== JSON.stringify(toPlain(a[f] ?? null))
  );
  if (piiChanged.length > 0) outAfter.participantDetailsChanged = piiChanged;

  return { before: outBefore, after: outAfter };
}

export function paymentSnapshot(p: object): Record<string, unknown> {
  return pick(p as Record<string, unknown>, [
    'kind',
    'amount',
    'paymentMethod',
    'receiptNumber',
    'appointmentId',
    'reversesPaymentId',
    'gcashRefNumber',
    'processedById',
  ]);
}

export function userSnapshot(u: object): Record<string, unknown> {
  // Never includes the password hash.
  return pick(u as Record<string, unknown>, ['id', 'email', 'name', 'role', 'status', 'availability']);
}
