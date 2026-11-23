// app/api/public/pass/route.ts
// Returns structured QR Appointment Confirmation Pass data and Diocesan Official
// Receipts (RCP-YYYY-NNNNN) for a booking.
//
// Accessible via:
// 1. Authenticated staff (ADMIN, CASHIER, PRIEST) by reference number alone.
// 2. Authenticated parishioner who owns the booking (createdById, email, or phone).
// 3. Public lookup with reference + second-factor contact (mobile phone or email).

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateApiSession } from '@/lib/auth';
import { ApiError, clientIp, errorResponse, json, parseBody, type SessionUser } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { normalizeReference } from '@/lib/reference';
import {
  buildAppointmentPassData,
  buildOfficialReceiptData,
} from '@/lib/receiptPass';

const passLookupSchema = z.object({
  reference: z.string().trim().min(6, 'Reference number is required').max(30),
  contact: z.string().trim().max(160).optional().nullable(),
});

const NOT_FOUND_MESSAGE =
  'We could not find a booking pass with those details. Check the reference number and the phone or email you used.';

function phoneKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

function contactMatchesBooking(
  contact: string | null | undefined,
  appt: { participantPhone: string | null; participantEmail: string | null }
): boolean {
  const input = (contact ?? '').trim();
  if (!input) return false;
  if (input.includes('@')) {
    return (
      Boolean(appt.participantEmail) &&
      appt.participantEmail!.trim().toLowerCase() === input.toLowerCase()
    );
  }
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return false;
  const apptPhone = phoneKey(appt.participantPhone);
  return apptPhone.length === 10 && phoneKey(input) === apptPhone;
}

function isAuthorizedBySession(
  user: SessionUser | null,
  appt: {
    createdById: string | null;
    participantEmail: string | null;
    participantPhone: string | null;
  }
): boolean {
  if (!user) return false;
  if (['ADMIN', 'CASHIER', 'PRIEST'].includes(user.role)) return true;
  if (appt.createdById && appt.createdById === user.id) return true;
  if (
    user.email &&
    appt.participantEmail &&
    user.email.trim().toLowerCase() === appt.participantEmail.trim().toLowerCase()
  ) {
    return true;
  }
  if (
    user.phone &&
    appt.participantPhone &&
    phoneKey(user.phone).length === 10 &&
    phoneKey(user.phone) === phoneKey(appt.participantPhone)
  ) {
    return true;
  }
  return false;
}

async function resolvePassAndReceipts(
  request: NextRequest,
  referenceInput: string,
  contactInput?: string | null
) {
  const { user } = await validateApiSession();
  const normalizedRef = normalizeReference(referenceInput);

  // Rate limit unauthenticated lookups per IP
  if (!user) {
    const limit = rateLimit(`pass:${clientIp(request)}`, 15, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }
  }

  const appt = await prisma.appointment.findFirst({
    where: { referenceNumber: normalizedRef, deletedAt: null },
    include: {
      assignedPriest: { select: { id: true, name: true } },
      payments: {
        where: { deletedAt: null },
        include: {
          processedBy: { select: { name: true } },
          reversal: { select: { id: true, receiptNumber: true } },
          reversesPayment: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      requirements: {
        select: { key: true, label: true, isMet: true, verifiedAt: true },
        orderBy: { label: 'asc' },
      },
    },
  });

  if (!appt) {
    throw new ApiError(404, NOT_FOUND_MESSAGE, 'PASS_NOT_FOUND');
  }

  const sessionAuthorized = isAuthorizedBySession(user, appt);
  if (!sessionAuthorized) {
    if (!contactInput || !contactInput.trim()) {
      throw new ApiError(
        401,
        'Enter the mobile number or email address used for this booking to view or print the pass and official receipt.',
        'CONTACT_REQUIRED'
      );
    }
    if (!contactMatchesBooking(contactInput, appt)) {
      throw new ApiError(404, NOT_FOUND_MESSAGE, 'PASS_NOT_FOUND');
    }
  }

  const pass = buildAppointmentPassData(appt, appt.payments, appt.requirements);
  const receipts = appt.payments.map((payment) => buildOfficialReceiptData(payment, appt));

  return { pass, receipts };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const reference = searchParams.get('reference') ?? searchParams.get('ref') ?? '';
    const contact = searchParams.get('contact');

    const parsed = passLookupSchema.parse({ reference, contact });
    const result = await resolvePassAndReceipts(request, parsed.reference, parsed.contact);
    return json(result);
  } catch (error) {
    return errorResponse(error, 'GET /api/public/pass');
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, passLookupSchema);
    const result = await resolvePassAndReceipts(request, parsed.reference, parsed.contact);
    return json(result);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/pass');
  }
}
