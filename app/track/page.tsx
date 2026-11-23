// app/track/page.tsx
// Public booking status lookup & online payment launcher (Constitution I, II & III, PRD R1-8).
// Requires reference number + the mobile number or email used when booking.
// Allows online payment via Online Wallet or Bank Transfer when a balance is due.

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BANK_TRANSFER_CHANNELS,
  CHURCH_NAME,
  ONLINE_WALLET_CHANNELS,
  SACRAMENT_LABELS,
} from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TrackedBooking {
  referenceNumber: string;
  sacramentType: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | string;
  scheduledDate: string;
  scheduledTime: string;
  location: string | null;
  fee: number;
  amountPaid: number;
  balanceDue: number;
  requirements: { label: string; isMet: boolean }[];
}

const STATUS_DESCRIPTIONS: Record<
  string,
  { badgeClass: string; title: string; detail: string }
> = {
  PENDING: {
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    title: 'Pending Review — Not Yet Confirmed',
    detail:
      'Your request has been received and is awaiting review by the parish office. Once the parish office sets the fee, you may pay at the office or online below.',
  },
  CONFIRMED: {
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
    title: 'Confirmed by Parish Office',
    detail: 'Your sacrament schedule has been confirmed.',
  },
  COMPLETED: {
    badgeClass: 'bg-green-100 text-green-900 border-green-300',
    title: 'Completed',
    detail: 'This sacrament ceremony has been completed.',
  },
  CANCELLED: {
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
    title: 'Cancelled',
    detail:
      'This appointment has been cancelled. Please contact the parish office if you have questions.',
  },
};

function TrackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reference, setReference] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedBooking | null>(null);

  // Online payment selection state
  const [onlineMethod, setOnlineMethod] = useState<'ONLINE_WALLET' | 'BANK_TRANSFER'>(
    'ONLINE_WALLET'
  );
  const [providerChannel, setProviderChannel] = useState<string>(
    ONLINE_WALLET_CHANNELS[0].id
  );
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  useEffect(() => {
    const refParam = searchParams.get('ref');
    if (refParam) setReference(refParam);
  }, [searchParams]);

  const handleMethodChange = (method: 'ONLINE_WALLET' | 'BANK_TRANSFER') => {
    setOnlineMethod(method);
    setProviderChannel(
      method === 'ONLINE_WALLET'
        ? ONLINE_WALLET_CHANNELS[0].id
        : BANK_TRANSFER_CHANNELS[0].id
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCheckoutError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/public/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, contact }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not find a booking with those details.');
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOnlinePayment = async () => {
    if (!result) return;
    setCheckoutError('');
    setStartingCheckout(true);
    try {
      const res = await fetch('/api/public/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: result.referenceNumber,
          contact,
          paymentMethod: onlineMethod,
          providerChannel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not start online payment.');
      }
      if (typeof data.checkoutUrl === 'string' && /^https?:\/\//.test(data.checkoutUrl)) {
        window.location.assign(data.checkoutUrl);
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not start online payment.');
    } finally {
      setStartingCheckout(false);
    }
  };

  const statusMeta = result
    ? STATUS_DESCRIPTIONS[result.status] || {
        badgeClass: 'bg-gray-100 text-gray-800 border-gray-300',
        title: result.status,
        detail: '',
      }
    : null;

  const channelOptions =
    onlineMethod === 'ONLINE_WALLET' ? ONLINE_WALLET_CHANNELS : BANK_TRANSFER_CHANNELS;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Check Your Booking Status</h2>
        <p className="text-sm text-gray-600 mb-4">
          Enter your reference number and the mobile number or email address you used when booking.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 bg-red-50 border-l-4 border-red-600 p-3 rounded text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="track-ref" className="block text-sm font-semibold text-gray-800 mb-1">
              Booking Reference Number
            </label>
            <input
              id="track-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              placeholder="SAC-2026-K7M4QX"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="track-contact"
              className="block text-sm font-semibold text-gray-800 mb-1"
            >
              Mobile Number or Email Used
            </label>
            <input
              id="track-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
              placeholder="0917 123 4567 or family@example.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 disabled:bg-gray-400"
          >
            {loading ? 'Looking up...' : 'Check Status'}
          </button>
        </form>
      </div>

      {result && statusMeta && (
        <section
          aria-live="polite"
          className="bg-white rounded-xl shadow p-6 space-y-5 border-t-4 border-blue-700"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Reference</p>
              <p className="text-xl font-mono font-bold text-gray-900">{result.referenceNumber}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}
            >
              {result.status}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="font-bold text-gray-900">{statusMeta.title}</p>
            <p className="text-sm text-gray-700 mt-1">{statusMeta.detail}</p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Sacrament</dt>
              <dd className="font-semibold text-gray-900">
                {SACRAMENT_LABELS[result.sacramentType] || result.sacramentType}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Scheduled Date &amp; Time</dt>
              <dd className="font-semibold text-gray-900">
                {formatDate(result.scheduledDate)} at {result.scheduledTime}
              </dd>
            </div>
            {result.location && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Venue</dt>
                <dd className="font-semibold text-gray-900">{result.location}</dd>
              </div>
            )}
          </dl>

          <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-lg text-sm">
            <div>
              <p className="text-xs text-gray-500">Fee</p>
              <p className="font-bold text-gray-900">
                {result.fee > 0 ? formatCurrency(result.fee) : 'To be set by office'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Amount Paid</p>
              <p className="font-bold text-green-700">{formatCurrency(result.amountPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Balance Due</p>
              <p className="font-bold text-gray-900">{formatCurrency(result.balanceDue)}</p>
            </div>
          </div>

          {/* Online Payment Provider: Online Wallet & Bank Transfer */}
          {result.balanceDue > 0 && result.status !== 'CANCELLED' && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-blue-950">
                  Pay Online ({formatCurrency(result.balanceDue)})
                </h3>
                <p className="text-xs text-blue-800 mt-0.5">
                  Pay securely via Online Wallet or Bank Transfer. Your booking status updates
                  automatically once the payment provider verifies your transaction.
                </p>
              </div>

              {checkoutError && (
                <div
                  role="alert"
                  className="bg-red-50 border-l-4 border-red-600 p-3 rounded text-xs text-red-800"
                >
                  {checkoutError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleMethodChange('ONLINE_WALLET')}
                  aria-pressed={onlineMethod === 'ONLINE_WALLET'}
                  className={`p-3 rounded-lg border text-left text-sm font-semibold transition-colors ${
                    onlineMethod === 'ONLINE_WALLET'
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  Online Wallet
                  <span
                    className={`block text-xs font-normal mt-0.5 ${
                      onlineMethod === 'ONLINE_WALLET' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    Maya, GCash Express, GrabPay, ShopeePay
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMethodChange('BANK_TRANSFER')}
                  aria-pressed={onlineMethod === 'BANK_TRANSFER'}
                  className={`p-3 rounded-lg border text-left text-sm font-semibold transition-colors ${
                    onlineMethod === 'BANK_TRANSFER'
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  Bank Transfer
                  <span
                    className={`block text-xs font-normal mt-0.5 ${
                      onlineMethod === 'BANK_TRANSFER' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    InstaPay, PESONet, BPI, BDO, UnionBank
                  </span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="online-channel-select"
                  className="block text-xs font-semibold text-gray-800 mb-1"
                >
                  {onlineMethod === 'ONLINE_WALLET'
                    ? 'Select Online Wallet Provider'
                    : 'Select Bank Transfer Channel'}
                </label>
                <select
                  id="online-channel-select"
                  value={providerChannel}
                  onChange={(e) => setProviderChannel(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm"
                >
                  {channelOptions.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={startingCheckout}
                onClick={handleStartOnlinePayment}
                className="w-full py-3 px-4 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700 disabled:bg-gray-400"
              >
                {startingCheckout
                  ? 'Opening Secure Checkout...'
                  : `Proceed to ${
                      onlineMethod === 'ONLINE_WALLET' ? 'Online Wallet' : 'Bank Transfer'
                    } Checkout`}
              </button>
            </div>
          )}

          {result.requirements.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Requirements Checklist</h3>
              <ul className="divide-y border rounded-lg text-sm">
                {result.requirements.map((req, idx) => (
                  <li key={idx} className="p-3 flex items-center justify-between gap-3">
                    <span className={req.isMet ? 'line-through text-gray-500' : 'text-gray-800'}>
                      {req.label}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        req.isMet
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {req.isMet ? 'Verified' : 'Required'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function TrackBookingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <header className="bg-blue-700 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-blue-100 uppercase tracking-wider">{CHURCH_NAME}</p>
            <h1 className="text-xl font-bold">Track Sacrament Booking</h1>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/book"
              className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 font-medium"
            >
              Request Booking
            </Link>
            <Link href="/auth" className="text-blue-100 hover:text-white underline">
              Sign In / Sign Up
            </Link>
            <Link href="/" className="text-blue-100 hover:text-white underline">
              Landing Page
            </Link>
          </nav>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="max-w-2xl mx-auto px-4 py-6 text-center text-gray-500">Loading...</div>
        }
      >
        <TrackContent />
      </Suspense>
    </div>
  );
}
