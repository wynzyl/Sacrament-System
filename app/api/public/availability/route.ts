// app/api/public/availability/route.ts
// Which time slots are open for a sacrament on a date. No login required.

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { publicAvailabilityQuerySchema } from '@/lib/validation';
import { assertPublicBookingEnabled, getSlotAvailability } from '@/lib/appointments/public';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    const limit = rateLimit(`avail:${clientIp(request)}`, 60, 60_000);
    if (!limit.ok) throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');

    const q = publicAvailabilityQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const slots = await getSlotAvailability(q.sacramentType, q.date);
    return json({ date: q.date, sacramentType: q.sacramentType, slots });
  } catch (error) {
    return errorResponse(error, 'GET /api/public/availability');
  }
}
