// app/api/audit-logs/route.ts
// Read-only audit trail viewer (admin only). There is deliberately no write
// endpoint: entries are created only by the services, inside the transaction of
// the change they record.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { errorResponse, json, requireUser } from '@/lib/http';
import { auditQuerySchema } from '@/lib/validation';
import { manilaDayRange } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    await requireUser(['ADMIN'], 'Only administrators can view the audit log');

    const q = auditQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const where: Prisma.AuditLogWhereInput = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: manilaDayRange(q.from).start } : {}),
        ...(q.to ? { lt: manilaDayRange(q.to).end } : {}),
      };
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (error) {
    return errorResponse(error, 'GET /api/audit-logs');
  }
}
