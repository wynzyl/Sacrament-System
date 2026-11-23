// app/api/appointments/route.ts
// API for listing (GET) and creating (POST) appointments.

import { NextRequest } from 'next/server';
import { Prisma, type AppointmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { appointmentCreateSchema, dateOnly } from '@/lib/validation';
import { autoCompletePastAppointments, createAppointment } from '@/lib/appointments/service';
import { dateOnlyToUtc, manilaDateString } from '@/lib/dates';
import { balanceDueCentavos, fromCentavos, sumCentavos, toCentavos } from '@/lib/money';

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

// GET appointments with optional filters:
//   status=PENDING or status=PENDING,CONFIRMED   unpaid=true   activeOnly=true
//   from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, scheduled date)
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(['ADMIN', 'PRIEST', 'CASHIER']);

    const params = request.nextUrl.searchParams;
    const statusParam = params.get('status');
    const unpaid = params.get('unpaid') === 'true';
    const activeOnly = params.get('activeOnly') === 'true';
    const fromParam = params.get('from');
    const toParam = params.get('to');

    // Past appointments are completed (audited as a system action).
    await autoCompletePastAppointments();

    const where: Prisma.AppointmentWhereInput = { deletedAt: null };

    // Role-based filtering: priests only ever see their own assignments.
    if (user.role === 'PRIEST') where.assignedPriestId = user.id;

    if (statusParam) {
      const statuses = statusParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is AppointmentStatus => VALID_STATUSES.includes(s));
      if (statuses.length > 0) where.status = { in: statuses };
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromParam) dateFilter.gte = dateOnlyToUtc(dateOnly.parse(fromParam));
    if (toParam) dateFilter.lte = dateOnlyToUtc(dateOnly.parse(toParam));

    // Active = today (Manila) or later and not completed.
    if (activeOnly) {
      dateFilter.gte = dateOnlyToUtc(manilaDateString());
      where.status = { not: 'COMPLETED' };
    }
    if (Object.keys(dateFilter).length > 0) where.scheduledDate = dateFilter;

    const rows = await prisma.appointment.findMany({
      where,
      include: {
        assignedPriest: { select: { id: true, name: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
        requirements: { select: { isMet: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    const appointments = rows.map(({ payments, requirements, ...apt }) => {
      const paid = sumCentavos(payments.map((p) => p.amount));
      return {
        ...apt,
        amountPaid: fromCentavos(paid),
        balanceDue: fromCentavos(balanceDueCentavos(apt.fee, paid)),
        requirementsMet: requirements.filter((r) => r.isMet).length,
        requirementsTotal: requirements.length,
      };
    });

    // Outstanding balance only (replaces "has no payments at all").
    const result = unpaid
      ? appointments.filter((a) => toCentavos(a.fee) > 0 && a.balanceDue > 0)
      : appointments;

    return json(result);
  } catch (error) {
    return errorResponse(error, 'GET /api/appointments');
  }
}

// POST - Create a new appointment (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(['ADMIN'], 'Only administrators can create appointments');
    const input = await parseBody(request, appointmentCreateSchema);
    const appointment = await createAppointment(user, input);
    return json(appointment, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/appointments');
  }
}
