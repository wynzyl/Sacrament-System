// lib/auth.ts
// Helper functions for authentication and session management

import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_EXPIRY_DAYS = 7;

/**
 * Hash a password for storage
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with its hash
 * @param password - Plain text password
 * @param hashedPassword - Hashed password from database
 * @returns True if passwords match
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate a receipt number
 * Format: RCP-YYYY-XXXXX
 */
export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, '0');
  return `RCP-${year}-${random}`;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Generate a secure random session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session for a user
 * @param userId - User ID to create session for
 * @returns Session token
 */
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  // Clean up expired sessions for this user
  await prisma.session.deleteMany({
    where: {
      userId,
      expiresAt: { lt: new Date() },
    },
  });

  // Create new session
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Set session cookie with httpOnly flag
 * @param token - Session token to set
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60, // 7 days in seconds
    path: '/',
  });
}

/**
 * Get current session from cookie and validate
 * @returns User data if session is valid, null otherwise
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          availability: true,
        },
      },
    },
  });

  // Check if session exists and is not expired
  if (!session || session.expiresAt < new Date()) {
    // Clean up expired session
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  // Check if user is still ACTIVE
  if (session.user.status !== 'ACTIVE') {
    // Destroy session if user is inactive
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

/**
 * Destroy current session (logout)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Delete session from database
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  // Clear the cookie
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Validate session for API routes
 * @returns Object with user data and isValid flag
 */
export async function validateApiSession(): Promise<{
  isValid: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    availability: string;
  } | null;
}> {
  const user = await getSession();
  return {
    isValid: !!user,
    user,
  };
}