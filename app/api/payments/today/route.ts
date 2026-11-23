// app/api/payments/today/route.ts
// Today's ledger entries (Manila business day) with a net cash/GCash summary.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { errorResponse, json, requireUser } from '@/lib/http';
import { manilaDateString, manilaDayRange } from '@/lib/dates';
import { summarizePayments } from '@/lib/payments/ledger';

export async function GET() {
  try {
    const user = await requireUser();

    const { start, end } = manilaDayRange(manilaDateString());
    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: start, lt: end },
      deletedAt: null,
    };

    // Cashiers only see the entries they processed; admins see everything.
    if (user.role === 'CASHIER') where.processedById = user.id;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        appointment: { select: { participantName: true, sacramentType: true, referenceNumber: true } },
        processedBy: { select: { name: true } },
        reversal: { select: { id: true, receiptNumber: true } },
        reversesPayment: { select: { id: true, receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Reversal entries are negative, so the summary is net.
    return json({ payments, summary: summarizePayments(payments) });
  } catch (error) {
    return errorResponse(error, 'GET /api/payments/today');
  }
}
