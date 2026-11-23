// app/api/webhooks/payments/route.ts
// Verified, idempotent webhook endpoint for the online payment provider
// (Constitution II, VI, VII). Accepts HMAC-SHA256 signatures in either
// `x-payment-signature` or `paymongo-signature`.

import { NextRequest } from 'next/server';
import { errorResponse, json } from '@/lib/http';
import { handlePaymentWebhook } from '@/lib/payments/onlineProvider';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get('x-payment-signature') ??
      request.headers.get('paymongo-signature');
    const result = await handlePaymentWebhook(rawBody, signature);
    return json(result, 200);
  } catch (error) {
    return errorResponse(error, 'POST /api/webhooks/payments');
  }
}
