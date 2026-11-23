// app/api/public/track/route.ts
// Look up a booking by reference number + the phone/email used to book.
// POST (not GET) so the contact detail never lands in URLs or access logs.

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { trackSchema } from '@/lib/validation';
import { assertPublicBookingEnabled, trackBooking } from '@/lib/appointments/public';

export async function POST(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    // 10 lookups per 15 minutes per IP: enough for a family, too slow to guess with.
    const limit = rateLimit(`track:${clientIp(request)}`, 10, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(429, `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`);
    }

    const { reference, contact } = await parseBody(request, trackSchema);
    const booking = await trackBooking(reference, contact);
    return json(booking);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/track');
  }
}
