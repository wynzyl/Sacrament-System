import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  assertAuthenticEmailAddress,
  registerParishionerAccount,
  requestParishionerVerificationLink,
  verifyEmailConfirmationToken,
} from '@/lib/emailAuth';
import { createOnlineBooking } from '@/lib/appointments/public';
import { parishionerRegisterSchema } from '@/lib/validation';

describe('Parishioner OAuth-like Email Authentication & Confirmation Link', () => {
  it('validates authentic email accounts and rejects non-emails and disposable domains', async () => {
    const clean = await assertAuthenticEmailAddress('  Maria.Santos@Gmail.com ');
    expect(clean).toBe('maria.santos@gmail.com');

    await expect(assertAuthenticEmailAddress('not-an-email')).rejects.toThrow(
      /valid email address/
    );

    await expect(assertAuthenticEmailAddress('spammer@mailinator.com')).rejects.toThrow(
      /Disposable or temporary email/
    );

    expect(() =>
      parishionerRegisterSchema.parse({
        name: 'Maria Clara',
        email: '09171234567', // Phone number instead of email must be rejected
        password: 'password123',
      })
    ).toThrow(/valid email address/);
  });

  it('registers a parishioner account as unverified, sends confirmation link, and verifies via one-time token', async () => {
    const testEmail = `parishioner.${Date.now()}@gmail.com`;
    let createdUserId: string | null = null;

    try {
      // 1. Register new parishioner account
      const reg = await registerParishionerAccount(
        {
          name: 'Juan Dela Cruz',
          email: testEmail,
          password: 'password123',
          phone: '09171234567',
          barangay: 'Poblacion',
        },
        'http://localhost:3000'
      );

      createdUserId = reg.user.id;
      expect(reg.user.role).toBe('PARISHIONER');
      expect(reg.user.emailVerifiedAt).toBeNull();
      expect(reg.emailConfirmation.to).toBe(testEmail);
      expect(reg.emailConfirmation.confirmationUrl).toContain('/auth/verify?token=');

      // 2. Verify confirmation token
      const verified = await verifyEmailConfirmationToken(reg.emailConfirmation.token);
      expect(verified.user.id).toBe(reg.user.id);
      expect(verified.user.emailVerifiedAt).not.toBeNull();
      expect(verified.sessionToken).toHaveLength(64);

      // 3. Reusing the same one-time token must fail with 409
      await expect(
        verifyEmailConfirmationToken(reg.emailConfirmation.token)
      ).rejects.toThrow(/already been used/);

      // 4. Requesting a one-click OAuth-like magic sign-in link issues a fresh token
      const magic = await requestParishionerVerificationLink(
        testEmail,
        'MAGIC_SIGNIN',
        'http://localhost:3000'
      );
      expect(magic.emailConfirmation.purpose).toBe('MAGIC_SIGNIN');
      const magicVerified = await verifyEmailConfirmationToken(magic.emailConfirmation.token);
      expect(magicVerified.user.email).toBe(testEmail);

      // 5. Verified parishioner account can create an online booking linked to their account
      const booking = await createOnlineBooking(
        {
          sacramentType: 'BAPTISM',
          participantName: 'Baby Juan Dela Cruz',
          participantPhone: '09171234567',
          participantEmail: testEmail,
          barangay: 'Poblacion',
          scheduledDate: '2026-12-28',
          scheduledTime: '14:00',
          notes: 'Verified parishioner booking test',
          consent: true,
        },
        magicVerified.user
      );

      expect(booking.referenceNumber).toMatch(/^SAC-\d{4}-[A-Z0-9]{6}$/);
      expect(booking.status).toBe('PENDING');

      const storedAppt = await prisma.appointment.findUniqueOrThrow({
        where: { referenceNumber: booking.referenceNumber },
      });
      expect(storedAppt.createdById).toBe(createdUserId);
      expect(storedAppt.participantEmail).toBe(testEmail);

      await prisma.appointmentRequirement.deleteMany({ where: { appointmentId: storedAppt.id } });
      await prisma.appointment.delete({ where: { id: storedAppt.id } });
    } finally {
      if (createdUserId) {
        await prisma.session.deleteMany({ where: { userId: createdUserId } });
        await prisma.emailVerificationToken.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.delete({ where: { id: createdUserId } });
      }
    }
  });
});
