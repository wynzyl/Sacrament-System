// app/api/public/payments/[id]/route.ts
// Hosted checkout session lookup (GET), PayMongo server-side verification, and
// sandbox provider settlement (POST).
// Settlement dispatches an HMAC-SHA256 signed PayMongo-formatted webhook event
// through the verified webhook processor so that online payments follow the
// exact same verification and idempotency path (Constitution II & VI).

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { sandboxSettleSchema } from '@/lib/validation';
import {
  getOnlinePaymentIntentPublic,
  settleSandboxIntent,
  verifyOnlinePaymentSession,
} from '@/lib/payments/onlineProvider';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    // When returning from PayMongo's hosted checkout page (?verify=1), perform
    // a server-side verification call against PayMongo's Checkout Sessions API.
    if (request.nextUrl.searchParams.get('verify') === '1') {
      await verifyOnlinePaymentSession(id).catch(() => null);
    }
    const session = await getOnlinePaymentIntentPublic(id);
    return json(session);
  } catch (error) {
    return errorResponse(error, 'GET /api/public/payments/[id]');
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limit = rateLimit(`settle:${clientIp(request)}`, 15, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
    }

    const { id } = await params;
    const input = await parseBody(request, sandboxSettleSchema);
    const result = await settleSandboxIntent(id, input);
    const session = await getOnlinePaymentIntentPublic(id);
    return json({ result, session });
  } catch (error) {
    return errorResponse(error, 'POST /api/public/payments/[id]');
  }
}
