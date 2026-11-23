// app/auth/page.tsx
// Unified Authentication Page (Sign In & Sign Up) with OAuth-like Email Verification.
// Enforces email-only accounts and sends an email confirmation link before a
// parishioner can book an appointment.

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHURCH_NAME, URDANETA_BARANGAYS } from '@/lib/constants';

type AuthTab = 'signin' | 'signup' | 'staff';
type SignInMethod = 'password' | 'email_link';

interface DispatchedEmailPreview {
  to: string;
  recipientName: string;
  subject: string;
  confirmationUrl: string;
  token: string;
  expiresAt: string;
  purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN';
  deliveryMode: 'RESEND_API' | 'LOCAL_MAILBOX';
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as AuthTab) || 'signin';
  const nextPath = searchParams.get('next') || '/book';

  const [activeTab, setActiveTab] = useState<AuthTab>(
    initialTab === 'signup' || initialTab === 'staff' ? initialTab : 'signin'
  );
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('password');
  const [checkingSession, setCheckingSession] = useState(true);

  // Shared form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [barangay, setBarangay] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [dispatchedEmail, setDispatchedEmail] = useState<DispatchedEmailPreview | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'signup' || tabParam === 'staff' || tabParam === 'signin') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Redirect if already authenticated & verified
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          const user = data.user;
          if (user.role === 'ADMIN') router.push('/admin');
          else if (user.role === 'PRIEST') router.push('/priest');
          else if (user.role === 'CASHIER') router.push('/cashier');
          else if (user.role === 'PARISHIONER' && user.emailVerifiedAt) {
            router.push(nextPath.startsWith('/') ? nextPath : '/book');
          }
        }
      } catch {
        // Not logged in
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, [router, nextPath]);

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError('');
    setInfoMessage('');
    setUnverifiedEmail(null);
  };

  // Handle Parishioner or Staff Email + Password Sign In
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setUnverifiedEmail(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(data.email || email);
        }
        throw new Error(data.error || 'Sign in failed');
      }

      switch (data.user.role) {
        case 'ADMIN':
          router.push('/admin');
          break;
        case 'PRIEST':
          router.push('/priest');
          break;
        case 'CASHIER':
          router.push('/cashier');
          break;
        case 'PARISHIONER':
          router.push(nextPath.startsWith('/') ? nextPath : '/book');
          break;
        default:
          router.push('/book');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Handle OAuth-like Email Verification Link Request (Magic Sign-In or Resend Confirmation)
  const handleSendEmailLink = async (
    targetEmail: string,
    purpose: 'EMAIL_CONFIRMATION' | 'MAGIC_SIGNIN'
  ) => {
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not send confirmation link.');
      }
      setInfoMessage(data.message);
      setDispatchedEmail(data.emailConfirmation);
      setUnverifiedEmail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send email confirmation link.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Parishioner Sign Up (Email Account Only)
  const handleParishionerSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setDispatchedEmail(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: phone || null,
          barangay: barangay || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not register account.');
      }
      setInfoMessage(data.message);
      setDispatchedEmail(data.emailConfirmation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        Loading authentication portal...
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex flex-col justify-between bg-slate-950 text-gray-900 overflow-hidden">
      {/* Background image of Immaculate Conception Cathedral Urdaneta */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: "url('/images/cathedral-hero.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/95" />

      {/* Top Navigation */}
      <header className="relative z-20 max-w-6xl w-full mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-3 text-white">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-xl">
            ✝️
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-amber-300 font-semibold">
              ← Back to Cathedral Landing Page
            </p>
            <h1 className="text-base sm:text-lg font-bold group-hover:text-amber-300 transition-colors">
              {CHURCH_NAME}
            </h1>
          </div>
        </Link>

        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/track"
            className="px-3.5 py-1.5 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white font-medium"
          >
            Track Booking
          </Link>
        </div>
      </header>

      {/* Main Auth Container */}
      <main className="relative z-20 max-w-xl w-full mx-auto px-4 py-6 my-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950">
                  Email Account Verification
                </span>
                <h2 className="text-2xl font-bold mt-1.5">
                  {activeTab === 'signup'
                    ? 'Create Parishioner Email Account'
                    : activeTab === 'staff'
                    ? 'Cathedral Staff Sign In'
                    : 'Parishioner Email Sign In'}
                </h2>
              </div>
              <span className="text-3xl">⛪</span>
            </div>
            <p className="text-xs text-blue-100 mt-1">
              {activeTab === 'staff'
                ? 'Sign in as Administrator, Priest, or Cashier.'
                : 'A verified email account is required before booking a sacrament appointment.'}
            </p>
          </div>

          {/* Role / Mode Tabs */}
          <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50 text-xs sm:text-sm font-semibold">
            <button
              type="button"
              onClick={() => switchTab('signin')}
              className={`py-3.5 text-center border-b-2 transition-colors ${
                activeTab === 'signin'
                  ? 'border-blue-700 text-blue-700 bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Parishioner Sign In
            </button>
            <button
              type="button"
              onClick={() => switchTab('signup')}
              className={`py-3.5 text-center border-b-2 transition-colors ${
                activeTab === 'signup'
                  ? 'border-blue-700 text-blue-700 bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Parishioner Sign Up
            </button>
            <button
              type="button"
              onClick={() => switchTab('staff')}
              className={`py-3.5 text-center border-b-2 transition-colors ${
                activeTab === 'staff'
                  ? 'border-blue-700 text-blue-700 bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Staff Sign In
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="bg-red-50 border-l-4 border-red-600 p-4 rounded-lg text-sm text-red-800 space-y-2"
              >
                <p className="font-bold">Authentication Notice</p>
                <p>{error}</p>
                {unverifiedEmail && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleSendEmailLink(unverifiedEmail, 'EMAIL_CONFIRMATION')}
                    className="mt-2 inline-flex items-center px-3.5 py-2 rounded-lg bg-red-700 text-white text-xs font-bold hover:bg-red-800"
                  >
                    Resend Confirmation Link to {unverifiedEmail}
                  </button>
                )}
              </div>
            )}

            {/* Confirmation Email Sent & Instant Inbox Verification Card */}
            {dispatchedEmail && (
              <div
                role="status"
                aria-live="polite"
                className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-5 space-y-3 text-sm text-emerald-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-emerald-200 text-emerald-900">
                      ✉️ Confirmation Link Dispatched
                    </span>
                    <h3 className="text-base font-bold text-emerald-950 mt-1">
                      Check your email to confirm account authenticity
                    </h3>
                  </div>
                </div>

                <p className="text-xs text-emerald-900">
                  {infoMessage ||
                    `We sent a one-time confirmation link to ${dispatchedEmail.to}. Click the confirmation link in your email to verify your account and proceed to booking.`}
                </p>

                <div className="bg-white border border-emerald-200 rounded-lg p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>To: <strong className="text-gray-900">{dispatchedEmail.to}</strong></span>
                    <span>Mode: {dispatchedEmail.deliveryMode}</span>
                  </div>
                  <p className="font-semibold text-gray-800">Subject: {dispatchedEmail.subject}</p>
                  <p className="text-gray-600">
                    Click the verification link below to confirm your email address and sign in:
                  </p>
                  <div className="pt-1">
                    <Link
                      href={`/auth/verify?token=${encodeURIComponent(dispatchedEmail.token)}&next=${encodeURIComponent(nextPath)}`}
                      className="inline-block w-full text-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition-colors"
                    >
                      ✓ Click Here to Confirm Email &amp; Continue
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 1: PARISHIONER SIGN IN */}
            {activeTab === 'signin' && (
              <div className="space-y-5">
                {/* Method Switcher: Password vs OAuth-like Email Magic Link */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMethod('password');
                      setError('');
                    }}
                    className={`py-2 px-3 rounded-lg transition-colors ${
                      signInMethod === 'password'
                        ? 'bg-white text-blue-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Email &amp; Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMethod('email_link');
                      setError('');
                    }}
                    className={`py-2 px-3 rounded-lg transition-colors ${
                      signInMethod === 'email_link'
                        ? 'bg-white text-blue-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    One-Click Email Link (OAuth)
                  </button>
                </div>

                {signInMethod === 'password' ? (
                  <form onSubmit={handlePasswordSignIn} className="space-y-4">
                    <div>
                      <label
                        htmlFor="signin-email"
                        className="block text-sm font-semibold text-gray-800 mb-1"
                      >
                        Verified Email Address <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="signin-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="parishioner@gmail.com"
                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="signin-password"
                        className="block text-sm font-semibold text-gray-800 mb-1"
                      >
                        Password <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="signin-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow transition-colors disabled:bg-gray-400"
                    >
                      {loading ? 'Signing In...' : 'Sign In with Email'}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendEmailLink(email, 'MAGIC_SIGNIN');
                    }}
                    className="space-y-4"
                  >
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900">
                      Enter your registered email address. We will send a one-time OAuth-style
                      verification link to your email that signs you in and confirms your account
                      authenticity.
                    </div>

                    <div>
                      <label
                        htmlFor="magic-email"
                        className="block text-sm font-semibold text-gray-800 mb-1"
                      >
                        Email Address <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="magic-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="parishioner@gmail.com"
                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-xl shadow transition-colors disabled:bg-gray-400"
                    >
                      {loading ? 'Sending Confirmation Link...' : 'Send Email Confirmation Link'}
                    </button>
                  </form>
                )}

                <p className="text-center text-xs text-gray-600 pt-2 border-t">
                  Don&apos;t have a parishioner email account yet?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('signup')}
                    className="text-blue-700 font-bold hover:underline"
                  >
                    Sign Up with Email →
                  </button>
                </p>
              </div>
            )}

            {/* TAB 2: PARISHIONER SIGN UP (EMAIL ONLY) */}
            {activeTab === 'signup' && (
              <form onSubmit={handleParishionerSignUp} className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-950">
                  <strong>Email Account Verification:</strong> Only valid email accounts are
                  accepted. After submitting, click the confirmation link sent to your email to
                  activate sacrament booking.
                </div>

                <div>
                  <label
                    htmlFor="signup-name"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="e.g. Maria Clara Santos"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Email Address (Email Accounts Only) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="maria.santos@gmail.com"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    A confirmation link will be sent to this email address to verify authenticity.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Password (at least 8 characters) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="signup-phone"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Mobile Number (optional)
                    </label>
                    <input
                      id="signup-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0917 123 4567"
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="signup-barangay"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Barangay (Urdaneta City)
                    </label>
                    <select
                      id="signup-barangay"
                      value={barangay}
                      onChange={(e) => setBarangay(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Select barangay...</option>
                      {URDANETA_BARANGAYS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow transition-colors disabled:bg-gray-400"
                >
                  {loading
                    ? 'Creating Account & Sending Email Link...'
                    : 'Sign Up & Send Email Confirmation Link'}
                </button>

                <p className="text-center text-xs text-gray-600 pt-2 border-t">
                  Already have a verified email account?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('signin')}
                    className="text-blue-700 font-bold hover:underline"
                  >
                    Sign In →
                  </button>
                </p>
              </form>
            )}

            {/* TAB 3: STAFF SIGN IN */}
            {activeTab === 'staff' && (
              <div className="space-y-5">
                <form onSubmit={handlePasswordSignIn} className="space-y-4">
                  <div>
                    <label
                      htmlFor="staff-email"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Staff Email Address
                    </label>
                    <input
                      id="staff-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="admin@church.com"
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="staff-password"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Password
                    </label>
                    <input
                      id="staff-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow transition-colors disabled:bg-gray-400"
                  >
                    {loading ? 'Signing In...' : 'Staff Sign In'}
                  </button>
                </form>

                {/* Staff Demo Credentials */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Staff Demo Accounts (Click to Autofill)
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('admin@church.com');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-left border border-blue-200"
                    >
                      <span className="font-bold text-blue-950 block">ADMIN</span>
                      <span className="text-blue-700 text-[11px]">admin@church.com</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('priest@church.com');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-left border border-purple-200"
                    >
                      <span className="font-bold text-purple-950 block">PRIEST</span>
                      <span className="text-purple-700 text-[11px]">priest@church.com</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('cashier@church.com');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg bg-green-50 hover:bg-green-100 text-left border border-green-200"
                    >
                      <span className="font-bold text-green-950 block">CASHIER</span>
                      <span className="text-green-700 text-[11px]">cashier@church.com</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 text-center text-xs text-slate-400 py-4">
        © 2026 {CHURCH_NAME} • Urdaneta City, Pangasinan
      </footer>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          Loading...
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
