// app/api/reports/collections/route.ts
// API for fetching collections/payments report data

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only Admin and Cashier can access collections report
    if (user.role !== 'ADMIN' && user.role !== 'CASHIER') {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const cashierId = searchParams.get('cashierId');

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'From and To dates are required' },
        { status: 400 }
      );
    }

    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const where: any = {
      createdAt: {
        gte: from,
        lte: to,
      },
      deletedAt: null,
    };

    // Cashiers can only see their own processed payments
    if (user.role === 'CASHIER') {
      where.processedById = user.id;
    } else if (user.role === 'ADMIN' && cashierId) {
      // Admin can filter by specific cashier
      where.processedById = cashierId;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        appointment: {
          select: {
            participantName: true,
            sacramentType: true,
            scheduledDate: true,
          },
        },
        processedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
    });

    // Calculate totals
    const totals = payments.reduce(
      (acc, payment) => {
        if (payment.paymentMethod === 'CASH') {
          acc.cash += payment.amount;
        } else if (payment.paymentMethod === 'GCASH') {
          acc.gcash += payment.amount;
        }
        acc.total += payment.amount;
        return acc;
      },
      { cash: 0, gcash: 0, total: 0 }
    );

    return NextResponse.json({ payments, totals });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch collections report' },
      { status: 500 }
    );
  }
}
