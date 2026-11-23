// lib/emailAuth.ts
// OAuth-like Email Authentication & Confirmation Link service for parishioners.
// Validates email account authenticity (domain MX/syntax check + cryptographic
// one-time verification token) and dispatches confirmation links via SMTP/Resend
// or built-in local email verification preview.

import crypto from 'crypto';
import dns from 'dns/promises';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { hashPassword, createSession } from '@/lib/auth';
import { PUBLIC_ACTOR, SYSTEM_ACTOR, userActor, userSnapshot, writeAudit } from '@/lib/audit';
import { TX_OPTIONS } from '@/lib/appointments/service';
import { CHURCH_NAME } from '@/lib/constants';
import type { ParishionerRegisterInput } from '@/lib/validation';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Known disposable / fake email domains blocked to ensure authentic email accounts
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'fakeinbox.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
]);

// Known reputable email providers that skip DNS latency in local/offline environments
const TRUSTED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.com.ph',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'church.com',
  'email.com',
  'example.com',
]);

/**
 * Validate email format and domain authenticity.
 * Rejects non-email identifiers, disposable domains, and invalid domains.
 */
export async function assertAuthenticEmailAddress(rawEmail: string): Promise<string> {
  const email = rawEmail.trim().toLowerCase();
  const match = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(email);
  if (!match) {
    throw new ApiError(400, 'Please enter a valid email address (email accounts only).');
  }

  const domain = match[1].toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    throw new ApiError(
      400,
      'Disposable or temporary email addresses are not allowed. Please use a valid personal or organization email account.',
      'DISPOSABLE_EMAIL'
    );
  }

  if (TRUSTED_EMAIL_DOMAINS.has(domain) || domain.endsWith('.edu.ph') || domain.endsWith('.gov.ph') || domain.endsWith('.org.ph')) {
    return email;
  }

  // Optional DNS MX / A record check when online; falls back gracefully if offline in local dev
  if (process.env.SKIP_EMAIL_DNS_CHECK !== 'true' && process.env.NODE_ENV !== 'test') {
    try {
      const mx = await Promise.race([
        dns.resolveMx(domain),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (Array.isArray(mx) && mx.length === 0) {
        throw new ApiError(400, `The email domain "${domain}" cannot receive email.`);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network/DNS unavailable in local sandbox — allow syntactically valid non-disposable domain
    }
  }

  return email;
}

export function getAppBaseUrl(originHeader?: string | null): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (originHeader && /^https?:\/\//.test(originHeader)) {
    return originHeader.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

export interface DispatchedConfirmationEmail {
  to: string;
  recipientName: string;
  subject: string;
  confirmationUrl: string;
  token: string;
  expiresAt: string;
  purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN';
  deliveryMode: 'RESEND_API' | 'LOCAL_MAILBOX';
}

/**
 * Send the OAuth-like confirmation / verification link email.
 * Uses Resend HTTP API when RESEND_API_KEY is configured; otherwise logs the
 * full confirmation email and returns the dispatched link for local inbox preview.
 */
export async function dispatchConfirmationEmail(params: {
  to: string;
  recipientName: string;
  token: string;
  purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN';
  expiresAt: Date;
  baseUrl?: string;
}): Promise<DispatchedConfirmationEmail> {
  const baseUrl = getAppBaseUrl(params.baseUrl);
  const confirmationUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(params.token)}`;
  const subject =
    params.purpose === 'MAGIC_SIGNIN'
      ? `Sign in to ${CHURCH_NAME} — Email Verification Link`
      : `Confirm your email account — ${CHURCH_NAME}`;

  let deliveryMode: 'RESEND_API' | 'LOCAL_MAILBOX' = 'LOCAL_MAILBOX';

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || `${CHURCH_NAME} <onboarding@resend.dev>`,
          to: [params.to],
          subject,
          html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #1e3a8a; margin-top: 0;">${CHURCH_NAME}</h2>
              <p>Peace be with you, <strong>${params.recipientName}</strong>,</p>
              <p>Please click the button below to confirm the authenticity of your email account and continue to the Parishioner Sacrament Portal:</p>
              <p style="margin: 24px 0;">
                <a href="${confirmationUrl}" style="background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Confirm Email Account &amp; Sign In
                </a>
              </p>
              <p style="font-size: 12px; color: #64748b;">Or copy and paste this link: <br/>${confirmationUrl}</p>
              <p style="font-size: 12px; color: #64748b;">This link expires in 24 hours.</p>
            </div>
          `,
        }),
      });
      if (res.ok) {
        deliveryMode = 'RESEND_API';
      }
    } catch {
      // Fallback to local mailbox preview
    }
  }

  return {
    to: params.to,
    recipientName: params.recipientName,
    subject,
    confirmationUrl,
    token: params.token,
    expiresAt: params.expiresAt.toISOString(),
    purpose: params.purpose,
    deliveryMode,
  };
}

/**
 * Issue a fresh EmailVerificationToken for a user inside a transaction or standalone.
 */
export async function issueEmailVerificationToken(
  user: { id: string; email: string; name: string },
  purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN' = 'EMAIL_CONFIRMATION',
  baseUrl?: string,
  now: Date = new Date()
): Promise<DispatchedConfirmationEmail> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // Invalidate older unused tokens for the same user and purpose
    await tx.emailVerificationToken.updateMany({
      where: { userId: user.id, purpose, usedAt: null },
      data: { usedAt: now },
    });

    const created = await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        token,
        purpose,
        expiresAt,
      },
    });

    await writeAudit(tx, {
      actor: PUBLIC_ACTOR,
      action:
        purpose === 'MAGIC_SIGNIN'
          ? 'auth.email_magic_link_sent'
          : 'auth.email_confirmation_sent',
      entityType: 'EmailVerificationToken',
      entityId: created.id,
      after: {
        userId: user.id,
        purpose,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }, TX_OPTIONS);

  return dispatchConfirmationEmail({
    to: user.email,
    recipientName: user.name,
    token,
    purpose,
    expiresAt,
    baseUrl,
  });
}

/**
 * Register a new PARISHIONER account with email-only authentication.
 * Account starts unverified (emailVerifiedAt = null) and receives a confirmation link.
 */
export async function registerParishionerAccount(
  input: ParishionerRegisterInput,
  baseUrl?: string,
  now: Date = new Date()
) {
  const email = await assertAuthenticEmailAddress(input.email);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
  });

  if (existing) {
    if (existing.role !== 'PARISHIONER') {
      throw new ApiError(
        409,
        'This email address belongs to a parish staff account. Please sign in using the Staff tab.',
        'STAFF_EMAIL'
      );
    }
    if (existing.emailVerifiedAt) {
      throw new ApiError(
        409,
        'An account with this email already exists and is verified. Please sign in instead.',
        'EMAIL_EXISTS'
      );
    }

    // Account exists but hasn't verified email yet: update details and resend confirmation link
    const hashedPassword = await hashPassword(input.password);
    const updatedUser = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        password: hashedPassword,
        phone: input.phone ?? existing.phone,
        barangay: input.barangay ?? existing.barangay,
      },
      select: { id: true, email: true, name: true, role: true, status: true, emailVerifiedAt: true },
    });

    const dispatched = await issueEmailVerificationToken(
      updatedUser,
      'EMAIL_CONFIRMATION',
      baseUrl,
      now
    );

    return {
      user: updatedUser,
      emailConfirmation: dispatched,
      resent: true,
    };
  }

  const hashedPassword = await hashPassword(input.password);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        name: input.name,
        phone: input.phone ?? null,
        barangay: input.barangay ?? null,
        role: 'PARISHIONER',
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        emailVerifiedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        barangay: true,
        role: true,
        status: true,
        availability: true,
        emailVerifiedAt: true,
      },
    });

    await writeAudit(tx, {
      actor: PUBLIC_ACTOR,
      action: 'parishioner.register',
      entityType: 'User',
      entityId: user.id,
      after: { ...userSnapshot(user), emailVerified: false },
    });

    return user;
  }, TX_OPTIONS);

  const dispatched = await issueEmailVerificationToken(
    createdUser,
    'EMAIL_CONFIRMATION',
    baseUrl,
    now
  );

  return {
    user: createdUser,
    emailConfirmation: dispatched,
    resent: false,
  };
}

/**
 * Request a new email confirmation link or OAuth-like passwordless magic sign-in link.
 */
export async function requestParishionerVerificationLink(
  rawEmail: string,
  purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN' = 'EMAIL_CONFIRMATION',
  baseUrl?: string,
  now: Date = new Date()
) {
  const email = await assertAuthenticEmailAddress(rawEmail);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, email: true, name: true, role: true, status: true, emailVerifiedAt: true },
  });

  if (!user) {
    throw new ApiError(
      404,
      'No account was found for that email address. Please sign up first to create your parishioner account.',
      'USER_NOT_FOUND'
    );
  }

  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'This account has been deactivated. Please contact the parish office.');
  }

  const dispatched = await issueEmailVerificationToken(user, purpose, baseUrl, now);
  return {
    user: { id: user.id, email: user.email, name: user.name, emailVerifiedAt: user.emailVerifiedAt },
    emailConfirmation: dispatched,
  };
}

/**
 * Verify a one-time email confirmation link token.
 * Marks the user's emailVerifiedAt timestamp, consumes the token, writes an audit entry,
 * and creates an authenticated session so the parishioner can immediately book appointments.
 */
export async function verifyEmailConfirmationToken(token: string, now: Date = new Date()) {
  const trimmed = token.trim();
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: trimmed },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          barangay: true,
          role: true,
          status: true,
          availability: true,
          emailVerifiedAt: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!record || !record.user || record.user.deletedAt) {
    throw new ApiError(
      400,
      'This email confirmation link is invalid. Please request a new confirmation link.',
      'INVALID_TOKEN'
    );
  }

  if (record.usedAt) {
    throw new ApiError(
      409,
      'This email confirmation link has already been used. Please sign in to your account.',
      'TOKEN_ALREADY_USED'
    );
  }

  if (record.expiresAt < now) {
    throw new ApiError(
      410,
      'This email confirmation link has expired. Please request a new confirmation link.',
      'TOKEN_EXPIRED'
    );
  }

  if (record.user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Your account has been deactivated. Please contact the parish office.');
  }

  const verifiedUser = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    });

    const updated = await tx.user.update({
      where: { id: record.user.id },
      data: {
        emailVerifiedAt: record.user.emailVerifiedAt ?? now,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        barangay: true,
        role: true,
        status: true,
        availability: true,
        emailVerifiedAt: true,
      },
    });

    await writeAudit(tx, {
      actor: userActor(updated),
      action: 'auth.email_confirmed',
      entityType: 'User',
      entityId: updated.id,
      before: { emailVerified: !!record.user.emailVerifiedAt },
      after: { emailVerified: true, purpose: record.purpose },
    });

    return updated;
  }, TX_OPTIONS);

  const sessionToken = await createSession(verifiedUser.id);

  return {
    user: verifiedUser,
    sessionToken,
    purpose: record.purpose,
  };
}
