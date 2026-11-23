// app/api/public/payments/checkout/route.ts
// Create a hosted online payment session for an appointment (Online Wallet or
// Bank Transfer). Authenticated with booking reference + contact second factor.
// Does NOT confirm the booking or record a payment (Constitution II).

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { onlineCheckoutCreateSchema } from '@/lib/validation';
import { assertPublicBookingEnabled } from '@/lib/appointments/public';
import { createOnlineCheckoutSession } from '@/lib/payments/onlineProvider';

export async function POST(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    const limit = rateLimit(`checkout:${clientIp(request)}`, 10, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many payment attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }

    const input = await parseBody(request, onlineCheckoutCreateSchema);
    const session = await createOnlineCheckoutSession(input);
    return json(session, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/payments/checkout');
  }
}
