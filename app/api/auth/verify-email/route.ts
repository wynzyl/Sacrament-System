// app/api/auth/verify-email/route.ts
// Verify an email confirmation link token, mark the user's emailVerifiedAt,
// and establish an authenticated session cookie.

import { NextRequest } from 'next/server';
import { errorResponse, json, parseBody } from '@/lib/http';
import { emailTokenVerifySchema } from '@/lib/validation';
import { verifyEmailConfirmationToken } from '@/lib/emailAuth';
import { setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { token } = await parseBody(request, emailTokenVerifySchema);
    const result = await verifyEmailConfirmationToken(token);

    await setSessionCookie(result.sessionToken);

    return json({
      message: 'Your email account has been verified and you are now signed in.',
      user: result.user,
      purpose: result.purpose,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/auth/verify-email');
  }
}
