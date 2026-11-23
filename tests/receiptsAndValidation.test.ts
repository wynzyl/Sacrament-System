import { describe, expect, it } from 'vitest';
import { formatReceiptNumber } from '@/lib/payments/receipts';
import {
  generateReferenceNumber,
  normalizeReference,
  REFERENCE_PATTERN,
} from '@/lib/reference';
import { appointmentDiff, appointmentSnapshot, userSnapshot } from '@/lib/audit';
import { rateLimit, resetRateLimits } from '@/lib/rateLimit';
import {
  cancelSchema,
  paymentCreateSchema,
  publicBookingSchema,
} from '@/lib/validation';

describe('R1-2 Audit privacy, R1-5 Receipt format & R1-8 Public booking validation', () => {
  it('formats sequential payment and reversal receipt numbers (FR-5.1, FR-5.4)', () => {
    expect(formatReceiptNumber('RCP', 2026, 1)).toBe('RCP-2026-00001');
    expect(formatReceiptNumber('RCP', 2026, 42)).toBe('RCP-2026-00042');
    expect(formatReceiptNumber('RVS', 2026, 7)).toBe('RVS-2026-00007');
  });

  it('generates and normalizes unambiguous booking references (FR-8.2)', () => {
    const ref = generateReferenceNumber(new Date('2026-11-23T00:00:00Z'));
    expect(ref).toMatch(REFERENCE_PATTERN);
    expect(ref.split('-')[2]).not.toMatch(/[0O1IL]/);
    expect(normalizeReference('  sac 2026 k7m4qx ')).toBe('SAC-2026-K7M4QX');
    expect(normalizeReference('SAC2026K7M4QX')).toBe('SAC-2026-K7M4QX');
  });

  it('strips passwords and personal contact data from audit snapshots (FR-2.6, RA 10173)', () => {
    const uSnap = userSnapshot({
      id: 'u1',
      email: 'admin@church.com',
      password: '$2a$10$secretHashValue',
      name: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    });
    expect(uSnap).not.toHaveProperty('password');

    const aSnap = appointmentSnapshot({
      id: 'a1',
      referenceNumber: 'SAC-2026-ABCDEF',
      source: 'ONLINE',
      sacramentType: 'BAPTISM',
      status: 'PENDING',
      participantName: 'Private Family Name',
      participantPhone: '09171234567',
      participantEmail: 'private@example.com',
      notes: 'Private family notes',
      fee: 500,
    });
    expect(aSnap).not.toHaveProperty('participantName');
    expect(aSnap).not.toHaveProperty('participantPhone');
    expect(aSnap).not.toHaveProperty('participantEmail');
    expect(aSnap).not.toHaveProperty('notes');

    const diff = appointmentDiff(
      { status: 'PENDING', participantPhone: '09171111111' },
      { status: 'CONFIRMED', participantPhone: '09172222222' }
    );
    expect(diff.before).toEqual({ status: 'PENDING' });
    expect(diff.after).toEqual({
      status: 'CONFIRMED',
      participantDetailsChanged: ['participantPhone'],
    });
  });

  it('enforces Zod schemas for payments, cancellations, and public bookings (FR-10)', () => {
    // GCash requires a reference number
    expect(() =>
      paymentCreateSchema.parse({
        appointmentId: 'apt-1',
        amount: 500,
        paymentMethod: 'GCASH',
      })
    ).toThrow(/reference number is required/);

    // Negative or >2dp amounts are rejected
    expect(() =>
      paymentCreateSchema.parse({
        appointmentId: 'apt-1',
        amount: 500.123,
        paymentMethod: 'CASH',
      })
    ).toThrow(/2 decimal places/);

    // Cancel requires a reason of at least 3 characters
    expect(() => cancelSchema.parse({ reason: 'no' })).toThrow(/at least 3/);

    // Public booking rejects urgent offline-only sacraments (FUNERAL) and missing privacy consent
    expect(() =>
      publicBookingSchema.parse({
        sacramentType: 'FUNERAL',
        participantName: 'Juan Dela Cruz',
        participantPhone: '09171234567',
        scheduledDate: '2026-12-10',
        scheduledTime: '09:00',
        consent: true,
      })
    ).toThrow();

    const validPublic = publicBookingSchema.parse({
      sacramentType: 'BAPTISM',
      participantName: 'Baby Juan Dela Cruz',
      participantPhone: '0917 123 4567',
      barangay: 'Poblacion',
      scheduledDate: '2026-12-10',
      scheduledTime: '09:00',
      consent: true,
    });
    expect(validPublic.sacramentType).toBe('BAPTISM');
  });

  it('throttles excess requests per window in rateLimit', () => {
    resetRateLimits();
    expect(rateLimit('ip-1', 2, 60_000, 1_000).ok).toBe(true);
    expect(rateLimit('ip-1', 2, 60_000, 2_000).ok).toBe(true);
    const blocked = rateLimit('ip-1', 2, 60_000, 3_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
