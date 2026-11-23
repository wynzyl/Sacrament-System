// app/api/public/bookings/route.ts
// A parishioner submits a booking REQUEST. It is always created PENDING; the
// parish confirms it later (Constitution I). No login required.

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { publicBookingSchema } from '@/lib/validation';
import { assertPublicBookingEnabled, createOnlineBooking } from '@/lib/appointments/public';
import { requirementsFor } from '@/lib/requirements';

export async function POST(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

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

    const booking = await createOnlineBooking(input);
    return json(booking, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/bookings');
  }
}
