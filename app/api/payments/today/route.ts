// app/api/payments/today/route.ts
// API for fetching today's payments with summary

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiSession } from '@/lib/auth';

export async function GET() {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get today's date range (start and end of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch all payments for today
    const payments = await prisma.payment.findMany({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        appointment: {
          select: {
            participantName: true,
            sacramentType: true,
          },
        },
        processedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate summary
    const summary = payments.reduce(
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

    return NextResponse.json({ payments, summary });
  } catch (error) {
    console.error('Error fetching today\'s payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
