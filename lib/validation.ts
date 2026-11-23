// lib/validation.ts
// Runtime validation for every external input (Constitution III). Schemas are
// shared by the route handlers; business rules live in the service layer.

import { z } from 'zod';
import {
  AppointmentStatus,
  PaymentMethod,
  PriestAvailability,
  SacramentType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { isValidMoney } from '@/lib/money';
import { isValidDateOnly } from '@/lib/dates';
import { BOOKING_CONFIG } from '@/lib/scheduling';
import {
  ALL_PROVIDER_CHANNEL_IDS,
  BANK_TRANSFER_CHANNELS,
  ONLINE_WALLET_CHANNELS,
  URDANETA_BARANGAYS,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** '' -> null so a cleared form field clears the value. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Optional trimmed text. undefined stays undefined (patch-friendly), '' becomes null. */
const optText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `Must be at most ${max} characters`).nullable().optional()
  );

const money = z
  .number({ error: 'Amount must be a number' })
  .refine(isValidMoney, 'Amount can have at most 2 decimal places')
  .refine((v) => v >= 0, 'Amount cannot be negative');

const positiveMoney = money.refine((v) => v > 0, 'Amount must be greater than zero');

/** Accepts "YYYY-MM-DD" or a full ISO string (the first 10 characters are used). */
export const dateOnly = z
  .string({ error: 'Date is required' })
  .transform((s) => s.trim().slice(0, 10))
  .refine(isValidDateOnly, 'Enter a valid date');

export const timeOfDay = z
  .string({ error: 'Time is required' })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:MM (24-hour)');

const phone = z
  .string({ error: 'Mobile number is required' })
  .trim()
  .regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid mobile number')
  // Tracking uses the phone as a second factor, so require a full number.
  .refine((v) => {
    const digits = v.replace(/\D/g, '').length;
    return digits >= 10 && digits <= 15;
  }, 'Enter the full mobile number, e.g. 0917 123 4567');

const optEmail = z.preprocess(
  emptyToNull,
  z.email('Enter a valid email address').max(160).nullable().optional()
);

const reason = z
  .string({ error: 'A reason is required' })
  .trim()
  .min(3, 'Please give a short reason (at least 3 characters)')
  .max(300, 'Reason must be at most 300 characters');

// ---------------------------------------------------------------------------
// Appointments (staff)
// ---------------------------------------------------------------------------

const appointmentFields = {
  sacramentType: z.enum(SacramentType, { error: 'Choose a sacrament' }),
  participantName: z
    .string({ error: 'Participant name is required' })
    .trim()
    .min(1, 'Participant name is required')
    .max(120),
  participantPhone: optText(30),
  participantEmail: optEmail,
  barangay: optText(80),
  city: optText(80),
  province: optText(80),
  scheduledDate: dateOnly,
  scheduledTime: timeOfDay,
  location: optText(160),
  notes: optText(1000),
  fee: money,
  assignedPriestId: z.preprocess(emptyToNull, z.string().min(1).nullable().optional()),
};

export const appointmentCreateSchema = z.object({
  ...appointmentFields,
  fee: money.optional(), // defaults to 0 in the service
});
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;

export const appointmentUpdateSchema = z
  .object(appointmentFields)
  .partial()
  .extend({ status: z.enum(AppointmentStatus).optional() });
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;

export const cancelSchema = z.object({
  reason,
  paymentDisposition: z.enum(['REFUND', 'FORFEIT']).optional(),
});
export type CancelInput = z.infer<typeof cancelSchema>;

export const requirementUpdateSchema = z.object({
  key: z.string().min(1).max(80),
  isMet: z.boolean(),
});

// ---------------------------------------------------------------------------
// Payments (in-office & online gateway)
// ---------------------------------------------------------------------------

export const paymentCreateSchema = z
  .object({
    appointmentId: z.string().min(1, 'Appointment is required'),
    amount: positiveMoney,
    paymentMethod: z.enum(PaymentMethod, { error: 'Choose a payment method' }),
    gcashRefNumber: z.preprocess(
      emptyToNull,
      z.string().trim().min(3).max(64).nullable().optional()
    ),
    providerChannel: z.preprocess(
      emptyToNull,
      z.string().trim().min(2).max(40).nullable().optional()
    ),
  })
  .refine(
    (v) =>
      v.paymentMethod === 'CASH' ||
      (!!v.gcashRefNumber && v.gcashRefNumber.trim().length >= 3),
    {
      path: ['gcashRefNumber'],
      message: 'A reference number is required for GCash, Online Wallet, and Bank Transfer payments',
    }
  );
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const reverseSchema = z.object({ reason });

const onlineWalletChannelIds = ONLINE_WALLET_CHANNELS.map((c) => c.id) as [string, ...string[]];
const bankTransferChannelIds = BANK_TRANSFER_CHANNELS.map((c) => c.id) as [string, ...string[]];
const allChannelIds = ALL_PROVIDER_CHANNEL_IDS as unknown as [string, ...string[]];

export const onlineCheckoutCreateSchema = z
  .object({
    reference: z.string().trim().min(6).max(30),
    contact: z.string().trim().min(5).max(160),
    paymentMethod: z.enum(['ONLINE_WALLET', 'BANK_TRANSFER'], {
      error: 'Choose Online Wallet or Bank Transfer',
    }),
    providerChannel: z.enum(allChannelIds, {
      error: 'Choose a supported wallet or bank channel',
    }),
  })
  .refine(
    (v) =>
      (v.paymentMethod === 'ONLINE_WALLET' &&
        onlineWalletChannelIds.includes(v.providerChannel)) ||
      (v.paymentMethod === 'BANK_TRANSFER' &&
        bankTransferChannelIds.includes(v.providerChannel)),
    {
      path: ['providerChannel'],
      message: 'Selected channel does not match the chosen payment method',
    }
  );
export type OnlineCheckoutCreateInput = z.infer<typeof onlineCheckoutCreateSchema>;

export const sandboxSettleSchema = z.object({
  referenceNumber: z.preprocess(
    emptyToNull,
    z.string().trim().min(4).max(64).nullable().optional()
  ),
  outcome: z.enum(['PAID', 'FAILED']).optional(),
});

export const paymentWebhookEventSchema = z.object({
  eventId: z.string().trim().min(4).max(120),
  type: z.enum(['payment.paid', 'payment.failed']),
  providerIntentId: z.string().trim().min(4).max(120),
  providerRef: z.string().trim().min(4).max(120),
  providerChannel: z.string().trim().min(2).max(40).optional(),
  amount: positiveMoney,
  referenceNumber: z.string().trim().max(64).optional(),
});
export type PaymentWebhookEventInput = z.infer<typeof paymentWebhookEventSchema>;

// ---------------------------------------------------------------------------
// Audit log query
// ---------------------------------------------------------------------------

export const auditQuerySchema = z.object({
  entityType: z
    .enum([
      'Appointment',
      'Payment',
      'User',
      'AppointmentRequirement',
      'OnlinePaymentIntent',
      'EmailVerificationToken',
    ])
    .optional(),
  entityId: z.string().min(1).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------------------------------------------------------------------------
// Public booking
// ---------------------------------------------------------------------------

export const onlineSacramentSchema = z.enum(BOOKING_CONFIG.onlineSacraments, {
  error: 'This sacrament cannot be requested online. Please contact the parish office.',
});

export const publicBookingSchema = z.object({
  sacramentType: onlineSacramentSchema,
  participantName: z
    .string({ error: 'Name is required' })
    .trim()
    .min(2, 'Please enter the full name')
    .max(120),
  participantPhone: phone,
  participantEmail: optEmail,
  barangay: z.preprocess(
    emptyToNull,
    z.enum(URDANETA_BARANGAYS, { error: 'Choose a barangay from the list' }).nullable().optional()
  ),
  scheduledDate: dateOnly,
  scheduledTime: z
    .string()
    .refine(
      (t) => (BOOKING_CONFIG.slots as readonly string[]).includes(t),
      'Choose an available time'
    ),
  notes: optText(500),
  consent: z.literal(true, { error: 'Please agree to the data privacy notice to continue' }),
  // Honeypot: real users never see or fill this.
  website: z.string().max(200).optional(),
});
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

export const publicAvailabilityQuerySchema = z.object({
  sacramentType: onlineSacramentSchema,
  date: dateOnly,
});

export const trackSchema = z.object({
  reference: z.string().trim().min(6).max(30),
  contact: z.string().trim().min(5).max(160),
});

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

const userEmail = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));
const userPassword = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128);

export const userCreateSchema = z.object({
  email: userEmail,
  password: userPassword,
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(120),
  role: z.enum(UserRole, { error: 'Choose a role' }),
  status: z.enum(UserStatus).optional(),
  availability: z.enum(PriestAvailability).optional(),
});

export const userUpdateSchema = z.object({
  email: userEmail.optional(),
  // An empty string means "leave the password unchanged" (the edit form posts it blank).
  password: z.preprocess(emptyToNull, userPassword.nullable().optional()),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(UserRole).optional(),
  status: z.enum(UserStatus).optional(),
  availability: z.enum(PriestAvailability).optional(),
});

// ---------------------------------------------------------------------------
// Parishioner OAuth-like Email Authentication & Confirmation
// ---------------------------------------------------------------------------

export const parishionerRegisterSchema = z.object({
  name: z
    .string({ error: 'Full name is required' })
    .trim()
    .min(2, 'Please enter your full name (at least 2 characters)')
    .max(120),
  email: userEmail,
  password: userPassword,
  phone: z.preprocess(emptyToNull, phone.nullable().optional()),
  barangay: z.preprocess(
    emptyToNull,
    z.enum(URDANETA_BARANGAYS, { error: 'Choose a barangay from the list' }).nullable().optional()
  ),
});
export type ParishionerRegisterInput = z.infer<typeof parishionerRegisterSchema>;

export const parishionerEmailRequestSchema = z.object({
  email: userEmail,
  purpose: z.enum(['EMAIL_CONFIRMATION', 'MAGIC_SIGNIN']).default('EMAIL_CONFIRMATION'),
});
export type ParishionerEmailRequestInput = z.infer<typeof parishionerEmailRequestSchema>;

export const emailTokenVerifySchema = z.object({
  token: z
    .string({ error: 'Verification token is required' })
    .trim()
    .min(16, 'Invalid verification link')
    .max(200),
});
export type EmailTokenVerifyInput = z.infer<typeof emailTokenVerifySchema>;
