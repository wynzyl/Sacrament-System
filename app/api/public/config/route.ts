// app/api/public/config/route.ts
// Tells the public pages whether online booking is open and the bookable window.

import { errorResponse, json } from '@/lib/http';
import { isPublicBookingEnabled } from '@/lib/appointments/public';
import { manilaDateString } from '@/lib/dates';
import { BOOKING_CONFIG, earliestBookingDate, latestBookingDate } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = manilaDateString();
    return json({
      enabled: isPublicBookingEnabled(),
      earliestDate: earliestBookingDate(today),
      latestDate: latestBookingDate(today),
      openWeekdays: BOOKING_CONFIG.openWeekdays,
      onlineSacraments: BOOKING_CONFIG.onlineSacraments,
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/public/config');
  }
}
