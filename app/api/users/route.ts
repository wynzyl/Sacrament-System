// app/api/users/route.ts
// API for managing users (GET all, POST new)

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { ApiError, errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { userCreateSchema } from '@/lib/validation';
import { userActor, userSnapshot, writeAudit } from '@/lib/audit';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  availability: true,
  createdAt: true,
  updatedAt: true,
} as const;

// GET all users with optional role filter
export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const role = request.nextUrl.searchParams.get('role');
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (role === 'ADMIN' || role === 'PRIEST' || role === 'CASHIER') where.role = role;

    const users = await prisma.user.findMany({ where, select: USER_SELECT, orderBy: { name: 'asc' } });
    return json(users);
  } catch (error) {
    return errorResponse(error, 'GET /api/users');
  }
}

// POST - Create user (admin only)
export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(['ADMIN'], 'Only administrators can create users');
    const input = await parseBody(request, userCreateSchema);

    const existing = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
    if (existing) throw new ApiError(400, 'Email already exists');

    const password = await hashPassword(input.password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          password,
          name: input.name,
          role: input.role,
          status: input.status ?? 'ACTIVE',
          availability: input.availability ?? 'AVAILABLE',
        },
        select: USER_SELECT,
      });
      await writeAudit(tx, {
        actor: userActor(actor),
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        after: userSnapshot(user),
      });
      return user;
    });

    return json(created, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/users');
  }
}
