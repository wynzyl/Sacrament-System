// app/api/payments/route.ts
// API for creating payments

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateReceiptNumber, validateApiSession } from '@/lib/auth';

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

    // Only CASHIER and ADMIN can process payments
    if (user.role !== 'CASHIER' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only cashiers can process payments' },
        { status: 403 }
      );
    }

    const { appointmentId, amount, paymentMethod, gcashRefNumber } = await request.json();

    // Validate required fields
    if (!appointmentId || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if appointment exists and is not soft-deleted
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Create payment using session user's ID
    const payment = await prisma.payment.create({
      data: {
        amount,
        paymentMethod,
        gcashRefNumber,
        receiptNumber: generateReceiptNumber(),
        appointmentId,
        processedById: user.id, // Use session user's ID
      },
      include: {
        appointment: true,
        processedBy: true,
      },
    });

    // Update appointment status to CONFIRMED after payment
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED' },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
