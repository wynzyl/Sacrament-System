// app/api/payments/route.ts
// API for recording a payment (cashier / admin).

import { NextRequest } from 'next/server';
import { errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { paymentCreateSchema } from '@/lib/validation';
import { createPayment } from '@/lib/payments/service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(['CASHIER', 'ADMIN'], 'Only cashiers can process payments');
    const input = await parseBody(request, paymentCreateSchema);
    const payment = await createPayment(user, input);
    return json(payment, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/payments');
  }
}
