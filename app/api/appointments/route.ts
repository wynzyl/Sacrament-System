// app/api/appointments/route.ts
// API for managing appointments (GET, POST)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiSession } from '@/lib/auth';

// GET all appointments with optional filters
export async function GET(request: NextRequest) {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const unpaid = searchParams.get('unpaid');
    const activeOnly = searchParams.get('activeOnly'); // Filter for admin view

    // Get current date at start of day for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Auto-update past appointments to COMPLETED
    // Update appointments where scheduledDate < today AND status is not COMPLETED or CANCELLED
    await prisma.appointment.updateMany({
      where: {
        scheduledDate: {
          lt: today,
        },
        status: {
          notIn: ['COMPLETED', 'CANCELLED'],
        },
        deletedAt: null,
      },
      data: {
        status: 'COMPLETED',
      },
    });

    const where: any = {
      deletedAt: null, // Always filter out soft-deleted records
    };

    // Role-based filtering
    if (user.role === 'PRIEST') {
      // Priests can only see appointments assigned to them
      where.assignedPriestId = user.id;
    }
    // ADMIN and CASHIER see all appointments (CASHIER needs to see pending for payment processing)

    if (status) {
      where.status = status;
    }

    // Filter for active appointments (today or future, not completed)
    if (activeOnly === 'true') {
      where.scheduledDate = {
        gte: today,
      };
      where.status = {
        not: 'COMPLETED',
      };
    }

    // Filter appointments without payments
    if (unpaid === 'true') {
      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          payments: true,
          assignedPriest: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          scheduledDate: 'asc',
        },
      });

      // Filter out appointments that have payments
      const unpaidAppointments = appointments.filter(
        apt => apt.payments.length === 0
      );

      // Remove payments from response
      const cleanAppointments = unpaidAppointments.map(
        ({ payments, ...apt }) => apt
      );

      return NextResponse.json(cleanAppointments);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        assignedPriest: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        scheduledDate: 'asc',
      },
    });

    return NextResponse.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

// POST - Create new appointment
export async function POST(request: NextRequest) {
  try {
    // Validate session
    const { isValid, user } = await validateApiSession();
    if (!isValid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    // Validate required fields
    if (!sacramentType || !participantName || !scheduledDate || !scheduledTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        sacramentType,
        participantName,
        participantPhone,
        participantEmail,
        barangay,
        city: city || 'Urdaneta City',
        province: province || 'Pangasinan',
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        location: location || 'Immaculate Conception Cathedral Parish',
        notes,
        status: 'PENDING', // Always PENDING for new appointments
        fee: fee || 0,
        createdById: user.id, // Use session user's ID
        assignedPriestId: assignedPriestId || null,
      },
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json(
      { error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}
