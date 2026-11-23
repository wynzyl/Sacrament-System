// app/api/public/bookings/route.ts
// A parishioner submits a booking REQUEST. It is always created PENDING; the
// parish confirms it later (Constitution I). Requires a valid, email-verified
// parishioner (or staff) account.

import { NextRequest } from 'next/server';
import {
  ApiError,
  clientIp,
  errorResponse,
  json,
  parseBody,
  requireVerifiedAccount,
} from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { publicBookingSchema } from '@/lib/validation';
import { assertPublicBookingEnabled, createOnlineBooking } from '@/lib/appointments/public';
import { requirementsFor } from '@/lib/requirements';
import { prisma } from '@/lib/prisma';
import { balanceDueCentavos, fromCentavos, sumCentavos } from '@/lib/money';

export async function GET() {
  try {
    const user = await requireVerifiedAccount();

    const rows = await prisma.appointment.findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdById: user.id },
          { participantEmail: { equals: user.email, mode: 'insensitive' } },
        ],
      },
      include: {
        payments: { where: { deletedAt: null }, select: { amount: true } },
        requirements: { select: { label: true, isMet: true }, orderBy: { label: 'asc' } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const bookings = rows.map((appt) => {
      const paid = sumCentavos(appt.payments.map((p) => p.amount));
      return {
        id: appt.id,
        referenceNumber: appt.referenceNumber,
        sacramentType: appt.sacramentType,
        participantName: appt.participantName,
        participantPhone: appt.participantPhone,
        participantEmail: appt.participantEmail,
        scheduledDate: appt.scheduledDate.toISOString().slice(0, 10),
        scheduledTime: appt.scheduledTime,
        status: appt.status,
        fee: appt.fee,
        amountPaid: fromCentavos(paid),
        balanceDue: fromCentavos(balanceDueCentavos(appt.fee, paid)),
        requirements: appt.requirements,
      };
    });

    return json({ bookings });
  } catch (error) {
    return errorResponse(error, 'GET /api/public/bookings');
  }
}

export async function POST(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    // Require an authenticated & email-verified account before booking
    const user = await requireVerifiedAccount();

    // 5 requests per 15 minutes per IP.
    const limit = rateLimit(`book:${clientIp(request)}`, 5, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(429, `Too many requests. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`);
    }

    const input = await parseBody(request, publicBookingSchema);

    // Honeypot: a bot filled the hidden field. Pretend it worked, store nothing.
    if (input.website && input.website.trim() !== '') {
      return json(
        {
          referenceNumber: 'SAC-0000-000000',
          sacramentType: input.sacramentType,
          scheduledDate: input.scheduledDate,
          scheduledTime: input.scheduledTime,
          status: 'PENDING',
          requirements: requirementsFor(input.sacramentType),
        },
        201
      );
    }

    const booking = await createOnlineBooking(input, user);
    return json(booking, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/bookings');
  }
}
