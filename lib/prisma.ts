// lib/prisma.ts
// This creates a single Prisma client instance for your app

import { PrismaClient } from '@prisma/client';

// Prevent multiple Prisma instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'error', 'warn'], // Logs database queries (helpful for learning)
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;