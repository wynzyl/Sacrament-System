// app/api/payments/[id]/reverse/route.ts
// Reverse (void/refund) a payment by appending a REVERSAL ledger entry. Admin only.

import { NextRequest } from 'next/server';
import { errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { reverseSchema } from '@/lib/validation';
import { reversePayment } from '@/lib/payments/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser(['ADMIN'], 'Only administrators can reverse payments');
    const { id } = await params;
    const { reason } = await parseBody(request, reverseSchema);
    const result = await reversePayment(user, id, reason);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/payments/[id]/reverse');
  }
}
