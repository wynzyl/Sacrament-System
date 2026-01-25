// app/api/appointments/[id]/route.ts
// API for single appointment (GET, PUT, DELETE)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// GET single appointment
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        payments: true,
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(appointment);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment' },
      { status: 500 }
    );
  }
}

// PUT - Update appointment
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const data = await request.json();

    const {
      sacramentType,
      participantName,
      participantPhone,
      participantEmail,
      barangay,
      city,
      province,
      scheduledDate,
      scheduledTime,
      location,
      notes,
      status,
      fee,
      assignedPriestId,
    } = data;

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        sacramentType,
        participantName,
        participantPhone,
        participantEmail,
        barangay,
        city,
        province,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        scheduledTime,
        location,
        notes,
        status,
        fee,
        assignedPriestId: assignedPriestId !== undefined ? assignedPriestId : undefined,
      },
    });

    return NextResponse.json(appointment);
  } catch (error) {
    console.error('Error updating appointment:', error);
    return NextResponse.json(
      { error: 'Failed to update appointment' },
      { status: 500 }
    );
  }
}

// DELETE appointment (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only ADMIN can delete appointments
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete appointments' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // First delete related payments
    await prisma.payment.deleteMany({
      where: { appointmentId: id },
    });

    // Then delete the appointment
    await prisma.appointment.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json(
      { error: 'Failed to delete appointment' },
      { status: 500 }
    );
  }
}
