// middleware.ts
// Middleware to protect routes with session authentication

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/', '/api/auth/login'];

// API routes that require authentication
const protectedApiPaths = [
  '/api/users',
  '/api/appointments',
  '/api/payments',
  '/api/auth/logout',
  '/api/auth/session',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session_token')?.value;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check if it's a protected API route
  const isProtectedApi = protectedApiPaths.some(path => pathname.startsWith(path));

  if (isProtectedApi) {
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    // Session validation is done in each API route for more detailed user checks
    return NextResponse.next();
  }

  // Check if it's a protected page route (admin, priest, cashier)
  const protectedPages = ['/admin', '/priest', '/cashier'];
  const isProtectedPage = protectedPages.some(path => pathname.startsWith(path));

  if (isProtectedPage) {
    if (!sessionToken) {
      // Redirect to login page
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Allow all other routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
