// app/api/users/[id]/route.ts
// API for a single user (GET, PUT). DELETE intentionally absent: deactivate instead.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { ApiError, errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { userUpdateSchema } from '@/lib/validation';
import { userActor, userSnapshot, writeAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

// GET single user
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser(['ADMIN', 'CASHIER', 'PRIEST']);
    const { id } = await params;

    const target = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT });
    if (!target) throw new ApiError(404, 'User not found');
    return json(target);
  } catch (error) {
    return errorResponse(error, 'GET /api/users/[id]');
  }
}

// PUT - Update user (admin only). Role, status and password changes are audited.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const actor = await requireUser(['ADMIN'], 'Only administrators can update users');
    const { id } = await params;
    const input = await parseBody(request, userUpdateSchema);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT });
      if (!existing) throw new ApiError(404, 'User not found');

      const data: Prisma.UserUpdateInput = {};
      if (input.email !== undefined) data.email = input.email;
      if (input.name !== undefined) data.name = input.name;
      if (input.role !== undefined) data.role = input.role;
      if (input.status !== undefined) data.status = input.status;
      if (input.availability !== undefined) data.availability = input.availability;
      if (input.password) data.password = await hashPassword(input.password);

      const user = await tx.user.update({ where: { id }, data, select: USER_SELECT });

      await writeAudit(tx, {
        actor: userActor(actor),
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        before: userSnapshot(existing),
        // Never record the password or its hash - only that it was changed.
        after: { ...userSnapshot(user), ...(input.password ? { passwordChanged: true } : {}) },
      });
      return user;
    });

    return json(updated);
  } catch (error) {
    return errorResponse(error, 'PUT /api/users/[id]');
  }
}
