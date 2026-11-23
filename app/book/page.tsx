// app/book/page.tsx
// Authenticated Parishioner Booking Request Page (Constitution I, PRD R1-8).
// Requires a valid, email-verified parishioner (or staff) account before booking.
// Mobile-first (360px), WCAG 2.1 AA labelled inputs, shows sacrament requirements
// before booking, and clearly states "Request received — not yet confirmed".

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CHURCH_NAME,
  SACRAMENT_ICONS,
  SACRAMENT_LABELS,
  URDANETA_BARANGAYS,
} from '@/lib/constants';
import { SACRAMENT_REQUIREMENTS, type RequirementDef } from '@/lib/requirements';
import { BOOKING_CONFIG, type SacramentKey, type SlotAvailability } from '@/lib/scheduling';
import { formatCurrency, formatDate } from '@/lib/utils';

interface PublicConfig {
  enabled: boolean;
  earliestDate: string;
  latestDate: string;
  openWeekdays: number[];
  onlineSacraments: string[];
}

interface SubmittedBooking {
  referenceNumber: string;
  sacramentType: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  requirements: RequirementDef[];
}

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  barangay?: string | null;
  role: string;
  emailVerifiedAt?: string | null;
}

interface ParishionerBookingSummary {
  id: string;
  referenceNumber: string;
  sacramentType: string;
  participantName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  fee: number;
  amountPaid: number;
  balanceDue: number;
}

export default function PublicBookingPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthenticatedUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [myBookings, setMyBookings] = useState<ParishionerBookingSummary[]>([]);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [sacramentType, setSacramentType] = useState<SacramentKey>('BAPTISM');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const [participantName, setParticipantName] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [barangay, setBarangay] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot field
  const [website, setWebsite] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedBooking | null>(null);

  const loadMyBookings = async () => {
    try {
      const res = await fetch('/api/public/bookings');
      if (res.ok) {
        const data = await res.json();
        setMyBookings(data.bookings || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    const checkAuthAndConfig = async () => {
      try {
        const [sessionRes, configRes] = await Promise.all([
          fetch('/api/auth/session'),
          fetch('/api/public/config'),
        ]);

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          const u: AuthenticatedUser = sessionData.user;
          setAuthUser(u);
          setParticipantEmail(u.email || '');
          if (u.name) setParticipantName(u.name);
          if (u.phone) setParticipantPhone(u.phone);
          if (u.barangay) setBarangay(u.barangay);
        }

        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData);
          if (configData.earliestDate) {
            setScheduledDate(configData.earliestDate);
          }
        }
      } catch {
        setError('Unable to load booking configuration. Please try again later.');
      } finally {
        setAuthChecking(false);
        setConfigLoading(false);
      }
    };
    checkAuthAndConfig();
  }, []);

  const isEmailVerified =
    !!authUser && (authUser.role !== 'PARISHIONER' || !!authUser.emailVerifiedAt);

  useEffect(() => {
    if (isEmailVerified) {
      loadMyBookings();
    }
  }, [isEmailVerified]);

  useEffect(() => {
    if (!isEmailVerified || !config?.enabled || !scheduledDate || !sacramentType) return;
    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError('');
      setScheduledTime('');
      try {
        const params = new URLSearchParams({ sacramentType, date: scheduledDate });
        const res = await fetch(`/api/public/availability?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setSlots([]);
          setSlotsError(data.error || 'That date is not available.');
        } else {
          const list: SlotAvailability[] = data.slots || [];
          setSlots(list);
          const firstOpen = list.find((s) => s.available);
          if (firstOpen) setScheduledTime(firstOpen.time);
        }
      } catch {
        setSlotsError('Could not check available times.');
      } finally {
        setSlotsLoading(false);
      }
    };
    loadSlots();
  }, [isEmailVerified, config?.enabled, sacramentType, scheduledDate]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUser(null);
    router.push('/');
  };

  const requirements = SACRAMENT_REQUIREMENTS[sacramentType] ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sacramentType,
          scheduledDate,
          scheduledTime,
          participantName,
          participantPhone,
          participantEmail: authUser?.email || participantEmail || null,
          barangay: barangay || null,
          notes: notes || null,
          consent,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not submit your booking request.');
      }
      setSubmitted(data);
      loadMyBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {/* Header */}
      <header className="bg-blue-800 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-xl hover:bg-white/25 transition-colors"
              title="Back to Cathedral Landing Page"
            >
              ✝️
            </Link>
            <div>
              <p className="text-xs text-blue-100 uppercase tracking-wider">{CHURCH_NAME}</p>
              <h1 className="text-xl font-bold">Request a Sacrament Appointment</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {authUser && (
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 text-xs font-semibold">
                ✓ {authUser.email}
              </span>
            )}
            <Link
              href="/track"
              className="px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 font-medium"
            >
              Track Request
            </Link>
            <Link href="/" className="text-blue-100 hover:text-white underline">
              Landing Page
            </Link>
            {authUser ? (
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
              >
                Sign Out
              </button>
            ) : (
              <Link
                href="/auth?tab=signin&next=/book"
                className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {authChecking || configLoading ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
            Checking account authentication and booking schedule...
          </div>
        ) : !isEmailVerified ? (
          /* Gate: Require Verified Email Account Before Booking */
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-blue-200">
            <div
              className="h-44 bg-cover bg-center relative flex items-end p-6"
              style={{ backgroundImage: "url('/images/cathedral-hero.jpg')" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent" />
              <div className="relative z-10 text-white">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-400 text-slate-950">
                  Verified Email Account Required
                </span>
                <h2 className="text-2xl font-bold mt-2">
                  Sign In with Your Confirmed Email to Book an Appointment
                </h2>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                Before a parishioner can book a sacrament appointment at{' '}
                <strong>{CHURCH_NAME}</strong>, you must have a valid, confirmed{' '}
                <strong>email account</strong>. When you sign up or request an OAuth-style email
                sign-in link, the system sends a confirmation link to your email inbox to validate
                your account authenticity.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 space-y-1">
                <p className="font-bold">How to proceed:</p>
                <p>1. Create your account using your email address (email accounts only).</p>
                <p>2. Click the confirmation link sent to your email account.</p>
                <p>3. You will be automatically signed in and redirected back here to complete your booking.</p>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/auth?tab=signup&next=/book"
                  className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow"
                >
                  Create Email Account &amp; Verify →
                </Link>
                <Link
                  href="/auth?tab=signin&next=/book"
                  className="px-5 py-3 rounded-xl border border-blue-700 text-blue-800 hover:bg-blue-50 font-bold text-sm"
                >
                  Sign In with Existing Verified Email
                </Link>
                <Link
                  href="/"
                  className="px-4 py-3 rounded-xl text-gray-600 hover:text-gray-900 text-sm font-medium"
                >
                  ← Back to Cathedral Landing Page
                </Link>
              </div>
            </div>
          </div>
        ) : !config?.enabled ? (
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-amber-500">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              Online booking is currently closed
            </h2>
            <p className="text-sm text-gray-700">
              Please visit or call the {CHURCH_NAME} office in Urdaneta City to schedule a sacrament.
            </p>
          </div>
        ) : submitted ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-white rounded-xl shadow-lg p-6 space-y-6 border-t-4 border-amber-500"
          >
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900">
                Status: Pending Review
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mt-2">
                Request received — not yet confirmed
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                The parish office will review your request, confirm priest availability, and set the
                applicable offering/fee. Your schedule is not final until confirmed by parish staff.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs uppercase font-semibold text-blue-800">
                Your Booking Reference Number
              </p>
              <p className="text-2xl sm:text-3xl font-mono font-bold text-blue-950 mt-1 select-all">
                {submitted.referenceNumber}
              </p>
              <p className="text-xs text-blue-800 mt-1">
                Linked to your verified email account ({authUser?.email}) and mobile number (
                {participantPhone}).
              </p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-gray-50 p-4 rounded-lg">
              <div>
                <dt className="text-gray-500">Sacrament</dt>
                <dd className="font-semibold text-gray-900">
                  {SACRAMENT_LABELS[submitted.sacramentType] || submitted.sacramentType}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Requested Date &amp; Time</dt>
                <dd className="font-semibold text-gray-900">
                  {formatDate(submitted.scheduledDate)} at {submitted.scheduledTime}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">
                Documents &amp; Requirements to Prepare
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                {submitted.requirements.map((r) => (
                  <li key={r.key}>{r.label}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`/track?ref=${encodeURIComponent(submitted.referenceNumber)}`}
                className="px-4 py-2.5 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 text-sm"
              >
                Track This Request
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(null);
                  setNotes('');
                  setConsent(false);
                }}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Submit Another Request
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Verified Parishioner Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-bold text-emerald-950">
                  ✓ Signed in as {authUser?.name} ({authUser?.email})
                </p>
                <p className="text-xs text-emerald-800">
                  Your email account authenticity is verified. Any booking you submit is linked to
                  your email account.
                </p>
              </div>
              {myBookings.length > 0 && (
                <a
                  href="#my-bookings"
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                >
                  View My Bookings ({myBookings.length})
                </a>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Important notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-950">
                <p className="font-semibold">How online requests work</p>
                <p className="mt-1 text-amber-900">
                  Submitting this form creates a <strong>pending request</strong>. Parish staff will
                  review the requirements, assign a priest, and confirm your schedule. For urgent{' '}
                  <strong>Funerals</strong> or <strong>Anointing of the Sick</strong>, please visit
                  or call the parish office directly.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="bg-red-50 border-l-4 border-red-600 p-4 rounded-lg text-sm text-red-800"
                >
                  <p className="font-bold">Could not submit request</p>
                  <p>{error}</p>
                </div>
              )}

              {/* Step 1: Choose Sacrament */}
              <section className="bg-white rounded-xl shadow p-5 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">1. Choose a Sacrament</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BOOKING_CONFIG.onlineSacraments.map((type) => {
                    const selected = sacramentType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSacramentType(type)}
                        aria-pressed={selected}
                        className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-500/30'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl" aria-hidden="true">
                          {SACRAMENT_ICONS[type] || '✝️'}
                        </span>
                        <span className="font-semibold text-sm">{SACRAMENT_LABELS[type]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Requirements Checklist shown BEFORE booking (Constitution I, FR-7.2) */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">
                    Requirements for {SACRAMENT_LABELS[sacramentType]}
                  </h3>
                  <p className="text-xs text-gray-600 mb-2">
                    Please prepare these documents and requirements for verification at the parish
                    office:
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-800">
                    {requirements.map((req) => (
                      <li key={req.key} className="flex items-start gap-2">
                        <span className="text-blue-700 font-bold" aria-hidden="true">
                          •
                        </span>
                        <span>{req.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Step 2: Choose Date & Time */}
              <section className="bg-white rounded-xl shadow p-5 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">
                  2. Choose Preferred Date &amp; Time
                </h2>
                <div>
                  <label
                    htmlFor="book-date"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Preferred Date (Monday–Saturday)
                  </label>
                  <input
                    id="book-date"
                    type="date"
                    value={scheduledDate}
                    min={config.earliestDate}
                    max={config.latestDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    required
                    className="w-full sm:w-64 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Requests require at least {BOOKING_CONFIG.minLeadDays} days notice.
                  </p>
                </div>

                <div>
                  <span className="block text-sm font-semibold text-gray-800 mb-2">
                    Available Time Slots
                  </span>
                  {slotsLoading ? (
                    <p className="text-sm text-gray-500">Checking available times...</p>
                  ) : slotsError ? (
                    <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{slotsError}</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {slots.map((slot) => {
                        const isChosen = scheduledTime === slot.time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            disabled={!slot.available}
                            onClick={() => setScheduledTime(slot.time)}
                            aria-pressed={isChosen}
                            className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                              !slot.available
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                                : isChosen
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'bg-white text-gray-800 border-gray-300 hover:bg-blue-50'
                            }`}
                          >
                            {slot.time}
                            {!slot.available && (
                              <span className="block text-[10px]">Unavailable</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* Step 3: Contact Details */}
              <section className="bg-white rounded-xl shadow p-5 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">
                  3. Participant &amp; Contact Details
                </h2>

                <div>
                  <label
                    htmlFor="book-name"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Participant Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="book-name"
                    type="text"
                    value={participantName}
                    onChange={(e) => setParticipantName(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="e.g. Baby Juan Dela Cruz / Mark & Lisa Garcia"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="book-phone"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Mobile Number <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="book-phone"
                      type="tel"
                      value={participantPhone}
                      onChange={(e) => setParticipantPhone(e.target.value)}
                      required
                      placeholder="0917 123 4567"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Used together with your email to verify identity when tracking your request.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="book-email"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Verified Account Email
                    </label>
                    <input
                      id="book-email"
                      type="email"
                      value={authUser?.email || participantEmail}
                      readOnly
                      className="w-full px-3 py-2.5 border border-gray-200 bg-gray-100 text-gray-700 rounded-lg cursor-not-allowed"
                    />
                    <p className="text-xs text-emerald-700 mt-1">
                      ✓ Confirmed via email verification link
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="book-barangay"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Barangay (Urdaneta City)
                  </label>
                  <select
                    id="book-barangay"
                    value={barangay}
                    onChange={(e) => setBarangay(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Select barangay (or leave blank if outside Urdaneta)</option>
                    {URDANETA_BARANGAYS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="book-notes"
                    className="block text-sm font-semibold text-gray-800 mb-1"
                  >
                    Additional Notes (optional)
                  </label>
                  <textarea
                    id="book-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Parents' names, mass intention details, or questions for the parish office..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Honeypot field: hidden from human users */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="book-website">Website</label>
                  <input
                    id="book-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div className="pt-2 border-t">
                  <label
                    htmlFor="book-consent"
                    className="flex items-start gap-3 text-sm cursor-pointer"
                  >
                    <input
                      id="book-consent"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      required
                      className="mt-1 h-4 w-4 text-blue-700 rounded border-gray-300"
                    />
                    <span className="text-gray-700">
                      I agree that {CHURCH_NAME} may collect and process the information above
                      solely to schedule and administer this sacrament, in accordance with the Data
                      Privacy Act of 2012 (RA 10173).
                    </span>
                  </label>
                </div>
              </section>

              <button
                type="submit"
                disabled={submitting || !scheduledTime || !consent}
                className="w-full py-3.5 px-6 bg-blue-700 text-white font-bold rounded-xl shadow hover:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting Request...' : 'Submit Booking Request'}
              </button>
            </form>

            {/* Parishioner's Existing Bookings List */}
            {myBookings.length > 0 && (
              <section id="my-bookings" className="bg-white rounded-xl shadow p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    My Sacrament Bookings ({myBookings.length})
                  </h2>
                  <span className="text-xs text-gray-500">Linked to {authUser?.email}</span>
                </div>
                <div className="divide-y border rounded-lg">
                  {myBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-900">
                            {b.referenceNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                            {b.status}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900 mt-0.5">
                          {SACRAMENT_LABELS[b.sacramentType] || b.sacramentType} —{' '}
                          {b.participantName}
                        </p>
                        <p className="text-xs text-gray-600">
                          {formatDate(b.scheduledDate)} at {b.scheduledTime}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {b.balanceDue > 0 && b.status !== 'CANCELLED' && (
                          <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                            Balance: {formatCurrency(b.balanceDue)}
                          </span>
                        )}
                        <Link
                          href={`/track?ref=${encodeURIComponent(b.referenceNumber)}`}
                          className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800"
                        >
                          Track / Pay Online
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
