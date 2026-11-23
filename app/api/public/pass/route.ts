// app/api/public/pass/route.ts
// FEAT-P3: Returns the QR Appointment Confirmation Pass and Official Receipts
// (`RCP-YYYY-NNNNN`) for a booking.
// Supports both POST and GET with `reference` + `contact`, or an authenticated
// session belonging to the booking owner or parish staff (ADMIN, CASHIER, PRIEST).

import { NextRequest } from 'next/server';
import { validateApiSession } from '@/lib/auth';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { passLookupSchema } from '@/lib/validation';
import { getAppointmentPassAndReceipts } from '@/lib/appointments/public';

function enforcePassRateLimit(request: NextRequest) {
  const limit = rateLimit(`pass:${clientIp(request)}`, 20, 15 * 60_000);
  if (!limit.ok) {
    throw new ApiError(
      429,
      `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    enforcePassRateLimit(request);
    const { user } = await validateApiSession();

    const url = new URL(request.url);
    const parsed = passLookupSchema.parse({
      reference: url.searchParams.get('reference') ?? '',
      contact: url.searchParams.get('contact') ?? undefined,
    });

    const data = await getAppointmentPassAndReceipts(parsed.reference, {
      contact: parsed.contact,
      actor: user,
    });
    return json(data);
  } catch (error) {
    return errorResponse(error, 'GET /api/public/pass');
  }
}

export async function POST(request: NextRequest) {
  try {
    enforcePassRateLimit(request);
    const { user } = await validateApiSession();

    const parsed = await parseBody(request, passLookupSchema);
    const data = await getAppointmentPassAndReceipts(parsed.reference, {
      contact: parsed.contact,
      actor: user,
    });
    return json(data);
  } catch (error) {
    return errorResponse(error, 'POST /api/public/pass');
  }
}
