// app/api/reports/collections/route.ts
// Collections report for a date range (Manila business days), net of reversals.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, errorResponse, json, requireUser } from '@/lib/http';
import { dateOnly } from '@/lib/validation';
import { manilaDayRange } from '@/lib/dates';
import { summarizePayments } from '@/lib/payments/ledger';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(['ADMIN', 'CASHIER']);

    const params = request.nextUrl.searchParams;
    const fromParam = params.get('from');
    const toParam = params.get('to');
    const cashierId = params.get('cashierId');
    if (!fromParam || !toParam) throw new ApiError(400, 'From and To dates are required');

    const from = dateOnly.parse(fromParam);
    const to = dateOnly.parse(toParam);

    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: manilaDayRange(from).start, lt: manilaDayRange(to).end },
      deletedAt: null,
    };

    // Cashiers only see their own entries; admins may filter by cashier.
    if (user.role === 'CASHIER') where.processedById = user.id;
    else if (cashierId) where.processedById = cashierId;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        appointment: { select: { participantName: true, sacramentType: true, scheduledDate: true, referenceNumber: true } },
        processedBy: { select: { name: true } },
        reversal: { select: { id: true, receiptNumber: true } },
        reversesPayment: { select: { id: true, receiptNumber: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return json({ payments, totals: summarizePayments(payments) });
  } catch (error) {
    return errorResponse(error, 'GET /api/reports/collections');
  }
}
