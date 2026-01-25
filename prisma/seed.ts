// prisma/seed.ts
// This file creates initial test data in your database

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@church.com' },
    update: {},
    create: {
      email: 'admin@church.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });
  console.log('Created admin user:', admin.email);

  // Create Priest user
  const priest = await prisma.user.upsert({
    where: { email: 'priest@church.com' },
    update: {},
    create: {
      email: 'priest@church.com',
      password: hashedPassword,
      name: 'Fr. John Smith',
      role: 'PRIEST',
    },
  });
  console.log('Created priest user:', priest.email);

  // Create Cashier user
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@church.com' },
    update: {},
    create: {
      email: 'cashier@church.com',
      password: hashedPassword,
      name: 'Maria Santos',
      role: 'CASHIER',
    },
  });
  console.log('Created cashier user:', cashier.email);

  // Create sample appointments
  const baptism = await prisma.appointment.create({
    data: {
      sacramentType: 'BAPTISM',
      participantName: 'Baby John Doe',
      participantPhone: '09123456789',
      participantEmail: 'parent@email.com',
      scheduledDate: new Date('2026-02-15'),
      scheduledTime: '10:00 AM',
      location: 'Main Church',
      notes: 'Parents: John and Jane Doe',
      status: 'CONFIRMED',
      fee: 500,
      createdById: admin.id,
    },
  });
  console.log('Created baptism appointment');

  const wedding = await prisma.appointment.create({
    data: {
      sacramentType: 'WEDDING',
      participantName: 'Mark & Lisa Garcia',
      participantPhone: '09187654321',
      participantEmail: 'mark@email.com',
      scheduledDate: new Date('2026-03-20'),
      scheduledTime: '2:00 PM',
      location: 'Main Church',
      notes: 'Wedding ceremony with 100 guests',
      status: 'CONFIRMED',
      fee: 5000,
      createdById: admin.id,
    },
  });
  console.log('Created wedding appointment');

  // Create sample payment for baptism
  const payment = await prisma.payment.create({
    data: {
      amount: 500,
      paymentMethod: 'CASH',
      receiptNumber: 'RCP-2026-0001',
      appointmentId: baptism.id,
      processedById: cashier.id,
    },
  });
  console.log('Created sample payment');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });