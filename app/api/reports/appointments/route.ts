// app/api/reports/appointments/route.ts
// API for fetching confirmed appointments report data

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

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

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

    const priestId = searchParams.get('priestId');

    const where: any = {
      status: 'CONFIRMED',
      scheduledDate: {
        gte: from,
        lte: to,
      },
      deletedAt: null,
    };

    // Role-based filtering: Priests can only see their own appointments
    if (user.role === 'PRIEST') {
      where.assignedPriestId = user.id;
    } else if (user.role === 'ADMIN' && priestId) {
      // Admin can filter by specific priest
      where.assignedPriestId = priestId;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        assignedPriest: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { scheduledTime: 'asc' },
      ],
    });

    return NextResponse.json(appointments);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch appointments report' },
      { status: 500 }
    );
  }
}
