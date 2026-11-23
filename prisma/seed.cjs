// prisma/seed.cjs
// This file creates initial test data in your database

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  const hashedPassword = await bcrypt.hash('password123', 10);

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

  const baptism = await prisma.appointment.upsert({
    where: { referenceNumber: 'SAC-2026-BAPT01' },
    update: {},
    create: {
      referenceNumber: 'SAC-2026-BAPT01',
      source: 'STAFF',
      sacramentType: 'BAPTISM',
      participantName: 'Baby John Doe',
      participantPhone: '09123456789',
      participantEmail: 'parent@email.com',
      scheduledDate: new Date('2026-12-15T00:00:00.000Z'),
      scheduledTime: '10:00',
      location: 'Immaculate Conception Cathedral Parish',
      notes: 'Parents: John and Jane Doe',
      status: 'CONFIRMED',
      fee: '500.00',
      createdById: admin.id,
      assignedPriestId: priest.id,
    },
  });
  console.log('Created baptism appointment:', baptism.referenceNumber);

  const wedding = await prisma.appointment.upsert({
    where: { referenceNumber: 'SAC-2026-WEDD01' },
    update: {},
    create: {
      referenceNumber: 'SAC-2026-WEDD01',
      source: 'STAFF',
      sacramentType: 'WEDDING',
      participantName: 'Mark & Lisa Garcia',
      participantPhone: '09187654321',
      participantEmail: 'mark@email.com',
      scheduledDate: new Date('2026-12-20T00:00:00.000Z'),
      scheduledTime: '14:00',
      location: 'Immaculate Conception Cathedral Parish',
      notes: 'Wedding ceremony with 100 guests',
      status: 'PENDING',
      fee: '5000.00',
      createdById: admin.id,
      assignedPriestId: priest.id,
    },
  });
  console.log('Created wedding appointment:', wedding.referenceNumber);

  await prisma.payment.upsert({
    where: { receiptNumber: 'RCP-2026-00001' },
    update: {},
    create: {
      kind: 'PAYMENT',
      amount: '500.00',
      paymentMethod: 'CASH',
      receiptNumber: 'RCP-2026-00001',
      appointmentId: baptism.id,
      processedById: cashier.id,
    },
  });
  await prisma.counter.upsert({
    where: { key: 'RCP-2026' },
    update: {},
    create: { key: 'RCP-2026', value: 1 },
  });
  console.log('Created sample payment');

  await prisma.appointment.upsert({
    where: { referenceNumber: 'SAC-2026-CONF01' },
    update: {},
    create: {
      referenceNumber: 'SAC-2026-CONF01',
      source: 'ONLINE',
      sacramentType: 'CONFIRMATION',
      participantName: 'Juan Dela Cruz',
      participantPhone: '09171234567',
      participantEmail: 'juan@email.com',
      barangay: 'Poblacion',
      scheduledDate: new Date('2026-12-18T00:00:00.000Z'),
      scheduledTime: '09:00',
      location: 'Immaculate Conception Cathedral Parish',
      status: 'PENDING',
      fee: '1500.00',
      assignedPriestId: priest.id,
    },
  });

  await prisma.appointment.upsert({
    where: { referenceNumber: 'SAC-2026-COMM01' },
    update: {},
    create: {
      referenceNumber: 'SAC-2026-COMM01',
      source: 'ONLINE',
      sacramentType: 'FIRST_COMMUNION',
      participantName: 'Maria Clara Santos',
      participantPhone: '09171234567',
      participantEmail: 'maria@email.com',
      barangay: 'San Vicente',
      scheduledDate: new Date('2026-12-19T00:00:00.000Z'),
      scheduledTime: '10:00',
      location: 'Immaculate Conception Cathedral Parish',
      status: 'PENDING',
      fee: '800.00',
      assignedPriestId: priest.id,
    },
  });

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
