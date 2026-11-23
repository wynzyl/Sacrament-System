// app/api/reports/appointments/route.ts
// Confirmed appointments report for a date range.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, errorResponse, json, requireUser } from '@/lib/http';
import { dateOnly } from '@/lib/validation';
import { dateOnlyToUtc } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(['ADMIN', 'PRIEST', 'CASHIER']);

    const params = request.nextUrl.searchParams;
    const fromParam = params.get('from');
    const toParam = params.get('to');
    const priestId = params.get('priestId');
    if (!fromParam || !toParam) throw new ApiError(400, 'From and To dates are required');

    const where: Prisma.AppointmentWhereInput = {
      status: 'CONFIRMED',
      // Appointment dates are stored as UTC-midnight calendar dates.
      scheduledDate: { gte: dateOnlyToUtc(dateOnly.parse(fromParam)), lte: dateOnlyToUtc(dateOnly.parse(toParam)) },
      deletedAt: null,
    };

    // Role-based filtering: priests only see their own; admins may filter by priest.
    if (user.role === 'PRIEST') where.assignedPriestId = user.id;
    else if (user.role === 'ADMIN' && priestId) where.assignedPriestId = priestId;

    const appointments = await prisma.appointment.findMany({
      where,
      include: { assignedPriest: { select: { name: true } } },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    return json(appointments);
  } catch (error) {
    return errorResponse(error, 'GET /api/reports/appointments');
  }
}
