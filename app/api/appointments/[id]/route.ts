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

    const appointment = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: {
        payments: {
          where: { deletedAt: null },
        },
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

    // Role-based access control
    if (user.role !== 'ADMIN') {
      // Priests can only access their assigned appointments
      if (user.role === 'PRIEST' && appointment.assignedPriestId !== user.id) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
      // Cashiers should not access individual appointments via this endpoint
      if (user.role === 'CASHIER') {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(appointment);
  } catch (error) {
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

    // Check if appointment exists and is not soft-deleted
    const existingAppointment = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Role-based access control for updates
    if (user.role !== 'ADMIN') {
      // Priests can only update their assigned appointments (limited to status changes only)
      if (user.role === 'PRIEST') {
        if (existingAppointment.assignedPriestId !== user.id) {
          return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
          );
        }

        // Validate that priest is only updating the status field
        const allowedFields = ['status'];
        const providedFields = Object.keys(data).filter(key => data[key] !== undefined);
        const disallowedFields = providedFields.filter(field => !allowedFields.includes(field));

        if (disallowedFields.length > 0) {
          return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
          );
        }
      } else if (user.role === 'CASHIER') {
        // Cashiers cannot update appointments
        return NextResponse.json(
          { error: 'Only administrators can update appointments' },
          { status: 403 }
        );
      }
    }

    // Build update data object with only provided fields
    const updateData: any = {};

    if (data.sacramentType !== undefined) updateData.sacramentType = data.sacramentType;
    if (data.participantName !== undefined) updateData.participantName = data.participantName;
    if (data.participantPhone !== undefined) updateData.participantPhone = data.participantPhone;
    if (data.participantEmail !== undefined) updateData.participantEmail = data.participantEmail;
    if (data.barangay !== undefined) updateData.barangay = data.barangay;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.province !== undefined) updateData.province = data.province;
    if (data.scheduledDate !== undefined) updateData.scheduledDate = new Date(data.scheduledDate);
    if (data.scheduledTime !== undefined) updateData.scheduledTime = data.scheduledTime;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.fee !== undefined) updateData.fee = data.fee;
    if (data.assignedPriestId !== undefined) updateData.assignedPriestId = data.assignedPriestId;

    const appointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(appointment);
  } catch (error: any) {
    console.error('Update appointment error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to update appointment', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE appointment (Admin only) - Changes status to CANCELLED instead of hard delete
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

    // Only ADMIN can cancel appointments
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can cancel appointments' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if appointment exists and is not already soft-deleted
    const existingAppointment = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Change status to CANCELLED instead of deleting
    await prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ message: 'Appointment cancelled successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to cancel appointment' },
      { status: 500 }
    );
  }
}
