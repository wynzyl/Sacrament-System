// app/auth/verify/page.tsx
// Email Confirmation & OAuth-like Verification Callback Page.
// Validates the one-time token from the confirmation link, marks the parishioner's
// email account as verified, establishes an authenticated session, and redirects
// to /book so the parishioner can book a sacrament appointment.

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHURCH_NAME } from '@/lib/constants';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const nextPath = searchParams.get('next') || '/book';

  const [status, setStatus] = useState<'verifying' | 'verified' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email confirmation link...');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifiedName, setVerifiedName] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing email confirmation token. Please use the full confirmation link sent to your email.');
      return;
    }

    let cancelled = false;
    const runVerify = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Could not verify your email confirmation link.');
          return;
        }
        setStatus('verified');
        setMessage(data.message || 'Your email account has been verified!');
        setVerifiedEmail(data.user?.email || '');
        setVerifiedName(data.user?.name || '');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('An unexpected error occurred while verifying your email link.');
        }
      }
    };

    runVerify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-slate-950 text-gray-900">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: "url('/images/cathedral-hero.jpg')" }}
      />
      <div className="absolute inset-0 bg-slate-950/80" />

      <div className="relative z-10 max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-3xl">
          {status === 'verifying' ? '⏳' : status === 'verified' ? '✅' : '⚠️'}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">{CHURCH_NAME}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {status === 'verifying'
              ? 'Confirming Email Account...'
              : status === 'verified'
              ? 'Email Account Verified!'
              : 'Verification Link Issue'}
          </h1>
        </div>

        <p className="text-sm text-gray-700">{message}</p>

        {status === 'verified' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left text-xs space-y-1 text-emerald-950">
            <p className="font-bold text-emerald-900">✓ Authentic Email Account Confirmed</p>
            {verifiedName && <p>Parishioner: <strong>{verifiedName}</strong></p>}
            {verifiedEmail && <p>Verified Email: <strong>{verifiedEmail}</strong></p>}
            <p className="text-emerald-800 pt-1">
              You are now signed in and authorized to request sacrament appointments online.
            </p>
          </div>
        )}

        <div className="pt-2 space-y-2.5">
          {status === 'verified' ? (
            <button
              type="button"
              onClick={() => router.push(nextPath.startsWith('/') ? nextPath : '/book')}
              className="w-full py-3.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow transition-colors"
            >
              Proceed to Book Sacrament Appointment →
            </button>
          ) : status === 'error' ? (
            <Link
              href="/auth?tab=signin"
              className="block w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow transition-colors"
            >
              Return to Sign In / Request New Link
            </Link>
          ) : null}

          <Link href="/" className="block text-xs text-gray-500 hover:text-gray-800 underline">
            Back to Cathedral Landing Page
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          Verifying confirmation link...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
