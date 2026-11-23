// app/pay/[id]/page.tsx
// PayMongo Hosted Online Payment Checkout & Return Verification Page
// (Constitution I, II, III).
// Supports Online Wallet (Maya, GCash Express, GrabPay, ShopeePay) and
// Bank Transfer (InstaPay, PESONet, BPI, BDO, UnionBank, Metrobank, Landbank).
// Never collects card numbers, bank passwords, or wallet PINs.

'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  CHURCH_NAME,
  PAYMENT_METHOD_LABELS,
  PROVIDER_CHANNEL_LABELS,
  SACRAMENT_LABELS,
} from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { OnlinePaymentIntentPublic } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function HostedCheckoutPage({ params }: PageProps) {
  const { id } = use(params);
  const [session, setSession] = useState<OnlinePaymentIntentPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [referenceInput, setReferenceInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    try {
      // Pass ?verify=1 so the server verifies directly with PayMongo API if PAYMONGO_SECRET_KEY is active
      const res = await fetch(`/api/public/payments/${id}?verify=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment session not found');
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment session');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleSettle = async (outcome: 'PAID' | 'FAILED') => {
    setError('');
    setProcessing(true);
    try {
      const res = await fetch(`/api/public/payments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceNumber: referenceInput.trim() || null,
          outcome,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment authorization failed');
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment authorization failed');
    } finally {
      setProcessing(false);
    }
  };

  const isWallet = session?.paymentMethod === 'ONLINE_WALLET';
  const channelLabel = session
    ? PROVIDER_CHANNEL_LABELS[session.providerChannel] || session.providerChannel
    : '';

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900">
      <header className="bg-slate-900 text-white shadow">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
              PayMongo Checkout API v1 • {session?.provider || 'PAYMONGO'}
            </p>
            <h1 className="text-lg font-bold">{CHURCH_NAME}</h1>
          </div>
          <Link href="/track" className="text-xs text-slate-300 hover:text-white underline">
            Back to Tracking
          </Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {loading ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
            Loading PayMongo checkout session...
          </div>
        ) : !session ? (
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-red-600">
            <h2 className="text-lg font-bold text-gray-900">Payment Session Unavailable</h2>
            <p className="text-sm text-gray-700 mt-1">{error}</p>
            <Link
              href="/track"
              className="inline-block mt-4 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg"
            >
              Return to Track Request
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Top summary banner */}
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-6">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-emerald-200">
                <span>
                  PayMongo • {PAYMENT_METHOD_LABELS[session.paymentMethod] || session.paymentMethod}
                </span>
                <span className="font-mono">{session.providerIntentId}</span>
              </div>
              <p className="text-3xl font-bold mt-2">{formatCurrency(session.amount)}</p>
              <p className="text-sm text-emerald-100 mt-1">
                Channel: <strong>{channelLabel}</strong>
              </p>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="bg-red-50 border-l-4 border-red-600 p-3 rounded text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              {/* Appointment details */}
              <dl className="grid grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <dt className="text-xs text-gray-500">Booking Reference</dt>
                  <dd className="font-mono font-bold text-gray-900">
                    {session.appointment.referenceNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Sacrament</dt>
                  <dd className="font-semibold text-gray-900">
                    {SACRAMENT_LABELS[session.appointment.sacramentType] ||
                      session.appointment.sacramentType}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Schedule</dt>
                  <dd className="font-semibold text-gray-900">
                    {formatDate(session.appointment.scheduledDate)} at{' '}
                    {session.appointment.scheduledTime}
                  </dd>
                </div>
              </dl>

              {session.status === 'SUCCEEDED' ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3"
                >
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-200 text-emerald-950">
                    CONFIRMED VIA PAYMONGO WEBHOOK
                  </span>
                  <h2 className="text-xl font-bold text-emerald-950">
                    Thank you! Your payment has been recorded.
                  </h2>
                  <dl className="text-sm space-y-1 text-emerald-900">
                    <div className="flex justify-between">
                      <dt>Official Parish Receipt #:</dt>
                      <dd className="font-mono font-bold">{session.receiptNumber}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Gateway / Channel:</dt>
                      <dd className="font-semibold">PayMongo — {channelLabel}</dd>
                    </div>
                    {session.referenceNumber && (
                      <div className="flex justify-between">
                        <dt>Provider Reference:</dt>
                        <dd className="font-mono">{session.referenceNumber}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="pt-3 space-y-2">
                    <Link
                      href={`/pass/${encodeURIComponent(session.appointment.referenceNumber)}`}
                      className="block w-full text-center py-3 px-4 bg-slate-900 text-amber-300 font-bold rounded-lg hover:bg-slate-800"
                    >
                      🖨️ Download Official Receipt ({session.receiptNumber}) &amp; QR Pass
                    </Link>
                    <Link
                      href={`/track?ref=${encodeURIComponent(session.appointment.referenceNumber)}`}
                      className="block w-full text-center py-3 px-4 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800"
                    >
                      View Updated Booking Status
                    </Link>
                  </div>
                </div>
              ) : session.status === 'FAILED' ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-lg font-bold text-red-900">Payment Failed or Cancelled</h2>
                  <p className="text-sm text-red-800">
                    No charge was recorded for your appointment. You may start a new payment session
                    from the tracking page.
                  </p>
                  <Link
                    href={`/track?ref=${encodeURIComponent(session.appointment.referenceNumber)}`}
                    className="inline-block px-4 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg"
                  >
                    Return to Tracking Page
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-950">
                    <p className="font-semibold">
                      {isWallet
                        ? `PayMongo ${channelLabel} Wallet Checkout`
                        : `PayMongo ${channelLabel} Bank Transfer / QR Ph`}
                    </p>
                    <p className="text-xs text-emerald-800 mt-1">
                      {session.provider === 'PAYMONGO'
                        ? 'Checking payment status with PayMongo API v1...'
                        : 'Local Sandbox Mode: Set PAYMONGO_SECRET_KEY (sk_test_... or sk_live_...) in .env to redirect directly to checkout.paymongo.com. Below you can simulate PayMongo’s signed Paymongo-Signature webhook callback.'}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="provider-ref-input"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      {isWallet
                        ? `${channelLabel} Transaction / Reference No. (optional in sandbox)`
                        : `${channelLabel} Transfer Reference / Trace No. (optional in sandbox)`}
                    </label>
                    <input
                      id="provider-ref-input"
                      type="text"
                      value={referenceInput}
                      onChange={(e) => setReferenceInput(e.target.value)}
                      maxLength={64}
                      placeholder={
                        isWallet ? 'e.g. MAYA-98431204' : 'e.g. INSTAPAY-2026112301'
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleSettle('PAID')}
                      className="w-full py-3 px-4 bg-emerald-600 text-white font-bold rounded-xl shadow hover:bg-emerald-700 disabled:bg-gray-400"
                    >
                      {processing ? 'Verifying PayMongo Webhook...' : 'Authorize & Complete Payment'}
                    </button>
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleSettle('FAILED')}
                      className="w-full py-3 px-4 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      Simulate Failed Payment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
