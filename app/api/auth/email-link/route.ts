// app/api/auth/email-link/route.ts
// Request a new email confirmation link or passwordless OAuth-like email magic sign-in link.

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { parishionerEmailRequestSchema } from '@/lib/validation';
import { requestParishionerVerificationLink } from '@/lib/emailAuth';

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`email-link:${clientIp(request)}`, 8, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many email requests. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }

    const input = await parseBody(request, parishionerEmailRequestSchema);
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const result = await requestParishionerVerificationLink(input.email, input.purpose, origin);

    return json({
      message:
        input.purpose === 'MAGIC_SIGNIN'
          ? 'A one-click sign-in confirmation link has been sent to your email.'
          : 'A new email confirmation link has been sent to your email.',
      user: result.user,
      emailConfirmation: result.emailConfirmation,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/auth/email-link');
  }
}
