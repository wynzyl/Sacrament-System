// lib/http.ts
// Shared API helpers: typed errors, JSON responses, body parsing, auth guard.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodType } from 'zod';
import { validateApiSession } from '@/lib/auth';
import { serialize } from '@/lib/serialize';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  availability: string;
};

export function json(data: unknown, status = 200): NextResponse {
  return new NextResponse(serialize(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Require a valid session, optionally restricted to roles. Throws ApiError. */
export async function requireUser(
  roles?: string[],
  forbiddenMessage = 'Access denied'
): Promise<SessionUser> {
  const { isValid, user } = await validateApiSession();
  if (!isValid || !user) throw new ApiError(401, 'Unauthorized');
  if (roles && !roles.includes(user.role)) throw new ApiError(403, forbiddenMessage);
  return user;
}

/** Parse and validate a JSON body with a Zod schema. */
export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
  return schema.parse(raw);
}

export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function firstIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Convert any thrown value into a JSON error response. Server errors are logged
 * as one structured line without request bodies or personal data (Constitution VII).
 */
export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: firstIssueMessage(error),
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return json({ error: 'A record with the same value already exists', code: 'DUPLICATE' }, 409);
  }

  const requestId = crypto.randomUUID();
  const entry: Record<string, unknown> = { level: 'error', context, requestId };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma messages can echo query arguments (personal data): log code/target only.
    entry.name = error.name;
    entry.code = error.code;
    entry.target = error.meta?.target;
  } else if (error instanceof Error) {
    entry.name = error.name;
    if (!error.name.startsWith('PrismaClient')) entry.message = error.message.slice(0, 200);
  }
  console.error(JSON.stringify(entry));
  return json({ error: 'Internal server error', requestId }, 500);
}
