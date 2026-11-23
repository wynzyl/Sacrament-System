// app/api/auth/register/route.ts
// Register a new Parishioner account (email-only) and send an email confirmation link.

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { parishionerRegisterSchema } from '@/lib/validation';
import { registerParishionerAccount } from '@/lib/emailAuth';

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`register:${clientIp(request)}`, 8, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many sign-up attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }

    const input = await parseBody(request, parishionerRegisterSchema);
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const result = await registerParishionerAccount(input, origin);

    return json(
      {
        message: result.resent
          ? 'Confirmation link re-sent to your email address. Please confirm your email to activate booking.'
          : 'Account created! A confirmation link has been sent to your email address.',
        user: result.user,
        emailConfirmation: result.emailConfirmation,
      },
      201
    );
  } catch (error) {
    return errorResponse(error, 'POST /api/auth/register');
  }
}
