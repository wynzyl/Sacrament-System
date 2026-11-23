// app/api/appointments/[id]/route.ts
// API for a single appointment: GET, PUT (update), DELETE (cancel with reason).

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { appointmentUpdateSchema, cancelSchema } from '@/lib/validation';
import { cancelAppointment, updateAppointment } from '@/lib/appointments/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single appointment
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: {
        payments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        createdBy: { select: { name: true, email: true } },
        assignedPriest: { select: { id: true, name: true } },
        requirements: { orderBy: { label: 'asc' } },
      },
    });
    if (!appointment) throw new ApiError(404, 'Appointment not found');

    // Role-based access control
    if (user.role === 'CASHIER') throw new ApiError(403, 'Access denied');
    if (user.role === 'PRIEST' && appointment.assignedPriestId !== user.id) {
      throw new ApiError(403, 'Access denied');
    }
    if (user.role === 'PARISHIONER' && appointment.createdById !== user.id) {
      throw new ApiError(403, 'Access denied');
    }

    return json(appointment);
  } catch (error) {
    return errorResponse(error, 'GET /api/appointments/[id]');
  }
}

// PUT - Update appointment (admin: any field; priest: status of own appointment only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(request, appointmentUpdateSchema);
    const appointment = await updateAppointment(user, id, input);
    return json(appointment);
  } catch (error) {
    return errorResponse(error, 'PUT /api/appointments/[id]');
  }
}

// DELETE - Cancel an appointment (admin only). Requires a reason; if money was
// received, also requires { paymentDisposition: 'REFUND' | 'FORFEIT' }.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser(['ADMIN'], 'Only administrators can cancel appointments');
    const { id } = await params;
    const input = await parseBody(request, cancelSchema);
    const { appointment, refundedCentavos } = await cancelAppointment(user, id, input);
    return json({
      message: 'Appointment cancelled successfully',
      status: appointment.status,
      refunded: refundedCentavos / 100,
    });
  } catch (error) {
    return errorResponse(error, 'DELETE /api/appointments/[id]');
  }
}
