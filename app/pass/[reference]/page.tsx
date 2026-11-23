// app/pass/[reference]/page.tsx
// FEAT-P3: Dedicated print-ready (@media print styled) Official Receipt
// (RCP-YYYY-NNNNN) & QR Appointment Confirmation Pass page for
// Immaculate Conception Cathedral Parish (Urdaneta City).

'use client';

import { useState, useEffect, useCallback, use, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CHURCH_NAME } from '@/lib/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { AppointmentPassData, OfficialReceiptData } from '@/lib/receiptPass';

interface PageProps {
  params: Promise<{ reference: string }>;
}

type PrintFilterMode = 'all' | 'pass' | 'receipts';

function PassAndReceiptViewer({ reference }: { reference: string }) {
  const searchParams = useSearchParams();
  const initialContact = searchParams.get('contact') || '';
  const initialView = (searchParams.get('view') as PrintFilterMode) || 'all';

  const [contact, setContact] = useState(initialContact);
  const [pass, setPass] = useState<AppointmentPassData | null>(null);
  const [receipts, setReceipts] = useState<OfficialReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsContact, setNeedsContact] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<PrintFilterMode>(
    ['all', 'pass', 'receipts'].includes(initialView) ? initialView : 'all'
  );

  const fetchPassData = useCallback(
    async (contactOverride?: string, isManualSubmit = false) => {
      setLoading(true);
      setError('');
      try {
        const contactValue = (contactOverride ?? contact).trim();
        const res = isManualSubmit
          ? await fetch('/api/public/pass', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reference,
                contact: contactValue || undefined,
              }),
            })
          : await fetch(
              `/api/public/pass?reference=${encodeURIComponent(reference)}${
                contactValue ? `&contact=${encodeURIComponent(contactValue)}` : ''
              }`
            );

        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'CONTACT_REQUIRED' && !isManualSubmit) {
            setNeedsContact(true);
            return;
          }
          setNeedsContact(true);
          throw new Error(data.error || 'Could not load pass and official receipts.');
        }

        setPass(data.pass);
        setReceipts(data.receipts || []);
        setNeedsContact(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load pass.');
      } finally {
        setLoading(false);
      }
    },
    [reference, contact]
  );

  useEffect(() => {
    fetchPassData(initialContact, false);
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchPassData(contact, true);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const statusBadgeColor: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900 border-amber-300',
    CONFIRMED: 'bg-blue-100 text-blue-900 border-blue-300',
    COMPLETED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    CANCELLED: 'bg-red-100 text-red-900 border-red-300',
  };

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:min-h-0 print:bg-white">
      {/* Print-specific page styling */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-page-break-before {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>

      {/* Screen-only Top Bar */}
      <header className="bg-blue-900 text-white shadow print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-blue-200 uppercase tracking-wider">{CHURCH_NAME}</p>
            <h1 className="text-lg sm:text-xl font-bold">
              Official Receipt &amp; QR Appointment Pass
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/track?ref=${encodeURIComponent(reference)}`}
              className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-700 font-medium"
            >
              ← Track Booking
            </Link>
            <Link href="/book" className="text-blue-100 hover:text-white underline">
              Book Sacrament
            </Link>
            <Link href="/" className="text-blue-100 hover:text-white underline">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 print:max-w-none print:p-0 print:space-y-4">
        {loading && !pass ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-600 print:hidden">
            Loading Official Receipt &amp; QR Appointment Pass for{' '}
            <span className="font-mono font-bold">{reference}</span>...
          </div>
        ) : needsContact || !pass ? (
          <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg p-6 border-t-4 border-blue-800 print:hidden">
            <h2 className="text-lg font-bold text-gray-900">
              Verify Booking Ownership to View Pass &amp; Official Receipts
            </h2>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              For your privacy (RA 10173), please enter the mobile number or email address used when
              booking reference <span className="font-mono font-bold text-blue-900">{reference}</span>.
            </p>

            {error && (
              <div
                role="alert"
                className="mb-4 bg-red-50 border-l-4 border-red-600 p-3 rounded text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="pass-verify-contact"
                  className="block text-sm font-semibold text-gray-800 mb-1"
                >
                  Mobile Number or Email Used for Booking
                </label>
                <input
                  id="pass-verify-contact"
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
                className="w-full py-3 px-4 bg-blue-800 text-white font-bold rounded-lg hover:bg-blue-900 disabled:bg-gray-400"
              >
                {loading ? 'Verifying...' : 'Open Pass & Official Receipts'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Screen-only Action Toolbar */}
            <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-gray-500 mr-1">
                  Document View:
                </span>
                {(
                  [
                    { id: 'all', label: `All (${1 + receipts.length})` },
                    { id: 'pass', label: 'QR Appointment Pass' },
                    { id: 'receipts', label: `Official Receipts (${receipts.length})` },
                  ] as { id: PrintFilterMode; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewMode(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      viewMode === tab.id
                        ? 'bg-blue-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg shadow flex items-center gap-2"
                >
                  <span aria-hidden="true">🖨️</span>
                  <span>Print / Save as PDF</span>
                </button>
              </div>
            </div>

            {/* ============================================================== */}
            {/* 1. QR APPOINTMENT CONFIRMATION PASS (SAC-YYYY-XXXXXX)          */}
            {/* ============================================================== */}
            {(viewMode === 'all' || viewMode === 'pass') && (
              <section
                aria-label="QR Appointment Confirmation Pass"
                className="bg-white rounded-2xl shadow-lg border-2 border-slate-800 overflow-hidden print-break-inside-avoid print:shadow-none print:rounded-lg"
              >
                {/* Cathedral Banner Header */}
                <div className="bg-slate-900 text-white px-6 py-5 border-b-4 border-amber-400 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-amber-300 font-semibold">
                      {pass.dioceseHeader}
                    </p>
                    <h2 className="text-xl sm:text-2xl font-bold mt-0.5">{pass.cathedralHeader}</h2>
                    <p className="text-xs text-slate-300">{pass.cathedralAddress}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 rounded bg-amber-400 text-slate-950 text-xs font-extrabold uppercase tracking-wider">
                      QR Appointment Confirmation Pass
                    </span>
                    <p className="text-xs text-slate-300 mt-1 font-mono">
                      Seal: <strong className="text-white">{pass.verificationSeal}</strong>
                    </p>
                  </div>
                </div>

                {/* Main Body */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                  {/* Left 2 Columns: Booking Details */}
                  <div className="md:col-span-2 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-gray-200">
                      <div>
                        <p className="text-xs uppercase font-semibold text-gray-500">
                          Booking Reference Number
                        </p>
                        <p className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 tracking-tight">
                          {pass.referenceNumber}
                        </p>
                      </div>
                      <span
                        className={`px-3.5 py-1 rounded-full text-xs font-extrabold border ${
                          statusBadgeColor[pass.status] ||
                          'bg-gray-100 text-gray-800 border-gray-300'
                        }`}
                      >
                        {pass.status}
                      </span>
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase font-semibold text-gray-500">
                          Participant / Family
                        </dt>
                        <dd className="font-bold text-gray-900 text-base mt-0.5">
                          {pass.participant.name}
                        </dd>
                        {pass.participant.barangay && (
                          <dd className="text-xs text-gray-600">
                            Brgy. {pass.participant.barangay}, {pass.participant.city}
                          </dd>
                        )}
                      </div>

                      <div>
                        <dt className="text-xs uppercase font-semibold text-gray-500">Sacrament</dt>
                        <dd className="font-bold text-blue-950 text-base mt-0.5">
                          {pass.sacramentLabel}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs uppercase font-semibold text-gray-500">
                          Scheduled Date &amp; Time
                        </dt>
                        <dd className="font-bold text-gray-900 mt-0.5">
                          {formatDate(pass.schedule.date)} at {pass.schedule.time}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs uppercase font-semibold text-gray-500">
                          Assigned Officiating Priest
                        </dt>
                        <dd className="font-semibold text-gray-900 mt-0.5">{pass.priest.name}</dd>
                      </div>

                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase font-semibold text-gray-500">Venue</dt>
                        <dd className="font-semibold text-gray-900 mt-0.5">
                          {pass.schedule.location}
                        </dd>
                      </div>
                    </dl>

                    {/* Payment Summary Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                          Offering &amp; Payment Summary
                        </h3>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            pass.paymentSummary.isFullyPaid
                              ? 'bg-emerald-100 text-emerald-900'
                              : pass.paymentSummary.amountPaid > 0
                              ? 'bg-blue-100 text-blue-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {pass.paymentSummary.isFullyPaid
                            ? 'FULLY PAID'
                            : pass.paymentSummary.amountPaid > 0
                            ? 'PARTIAL PAYMENT'
                            : 'UNPAID / PENDING FEE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Sacrament Fee</p>
                          <p className="font-bold text-gray-900">
                            {pass.paymentSummary.fee > 0
                              ? formatCurrency(pass.paymentSummary.fee)
                              : 'To be set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Net Amount Paid</p>
                          <p className="font-bold text-emerald-700">
                            {formatCurrency(pass.paymentSummary.amountPaid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Balance Due</p>
                          <p className="font-bold text-gray-900">
                            {formatCurrency(pass.paymentSummary.balanceDue)}
                          </p>
                        </div>
                      </div>

                      {pass.paymentSummary.receiptNumbers.length > 0 && (
                        <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-slate-200 font-mono">
                          Official Receipt(s): {pass.paymentSummary.receiptNumbers.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Requirements Readiness */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                          Canonical &amp; Documentary Requirements
                        </h3>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            pass.requirementReadiness.isComplete
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {pass.requirementReadiness.metCount}/
                          {pass.requirementReadiness.totalCount} Verified
                        </span>
                      </div>

                      {pass.requirementReadiness.items.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          Standard parish requirements apply.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {pass.requirementReadiness.items.map((item) => (
                            <li key={item.key} className="flex items-start gap-1.5">
                              <span
                                className={
                                  item.isMet
                                    ? 'text-emerald-700 font-bold'
                                    : 'text-amber-600 font-bold'
                                }
                              >
                                {item.isMet ? '✓' : '○'}
                              </span>
                              <span className={item.isMet ? 'text-gray-700' : 'text-gray-900'}>
                                {item.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Right Column: QR Verification Matrix & Tamper-Evident Seal */}
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center text-center space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Parish Verification QR
                    </p>
                    <div
                      className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"
                      dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
                    />
                    <div className="w-full pt-2 border-t border-slate-200">
                      <p className="text-[11px] uppercase text-gray-500 font-semibold">
                        Tamper-Evident Seal
                      </p>
                      <p className="font-mono font-extrabold text-sm text-slate-900 tracking-wider">
                        {pass.verificationSeal}
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-snug">
                      Present this pass at the Immaculate Conception Cathedral Parish Office on your
                      scheduled date.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ============================================================== */}
            {/* 2. DIOCESAN OFFICIAL RECEIPTS (RCP-YYYY-NNNNN)                 */}
            {/* ============================================================== */}
            {(viewMode === 'all' || viewMode === 'receipts') && (
              <section aria-label="Diocesan Official Receipts" className="space-y-4">
                <h2 className="text-base font-bold text-gray-800 uppercase tracking-wider print:hidden">
                  Diocesan Official Receipts ({receipts.length})
                </h2>

                {receipts.length === 0 ? (
                  <div className="bg-white rounded-xl shadow p-6 border-l-4 border-amber-500 print-break-inside-avoid">
                    <h3 className="text-base font-bold text-gray-900">
                      No Official Receipt Issued Yet
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      An Official Receipt (<span className="font-mono">RCP-YYYY-NNNNN</span>) is
                      automatically generated as soon as a payment is processed at the Parish
                      Cashier Office or verified via Online Wallet / Bank Transfer.
                    </p>
                    <div className="mt-3 print:hidden">
                      <Link
                        href={`/track?ref=${encodeURIComponent(pass.referenceNumber)}`}
                        className="inline-block px-4 py-2 bg-blue-700 text-white text-xs font-bold rounded-lg hover:bg-blue-800"
                      >
                        Go to Online Payment / Tracking →
                      </Link>
                    </div>
                  </div>
                ) : (
                  receipts.map((rcp) => (
                    <article
                      key={rcp.receiptNumber}
                      aria-label={`Official Receipt ${rcp.receiptNumber}`}
                      className={`bg-white rounded-2xl shadow-lg border-2 overflow-hidden print-break-inside-avoid print:shadow-none print:rounded-lg ${
                        rcp.isReversalEntry
                          ? 'border-red-700'
                          : rcp.isReversed
                          ? 'border-amber-600'
                          : 'border-emerald-800'
                      }`}
                    >
                      {/* Receipt Header */}
                      <div
                        className={`px-6 py-4 text-white flex flex-wrap items-center justify-between gap-4 ${
                          rcp.isReversalEntry
                            ? 'bg-red-900'
                            : rcp.isReversed
                            ? 'bg-amber-900'
                            : 'bg-emerald-900'
                        }`}
                      >
                        <div>
                          <p className="text-xs uppercase tracking-widest text-emerald-200 font-semibold">
                            {rcp.dioceseHeader} • Official Parish Receipt
                          </p>
                          <h3 className="text-lg sm:text-xl font-bold">{rcp.cathedralHeader}</h3>
                          <p className="text-xs text-emerald-100">{rcp.cathedralAddress}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs uppercase text-emerald-200 font-semibold">
                            Receipt No.
                          </p>
                          <p className="text-xl sm:text-2xl font-mono font-extrabold tracking-tight">
                            {rcp.receiptNumber}
                          </p>
                          <span
                            className={`inline-block mt-1 px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase ${
                              rcp.reversalStatus === 'ACTIVE'
                                ? 'bg-emerald-300 text-emerald-950'
                                : rcp.reversalStatus === 'REVERSED'
                                ? 'bg-amber-300 text-amber-950'
                                : 'bg-red-200 text-red-950'
                            }`}
                          >
                            {rcp.reversalStatus === 'ACTIVE'
                              ? 'VALID OFFICIAL RECEIPT'
                              : rcp.reversalStatus === 'REVERSED'
                              ? `VOID / REVERSED BY ${rcp.reversedByReceiptNumber}`
                              : `REVERSAL OF ${rcp.reversesReceiptNumber || 'PAYMENT'}`}
                          </span>
                        </div>
                      </div>

                      {/* Receipt Body */}
                      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <div className="md:col-span-2 space-y-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase text-gray-500 font-semibold">
                                Amount {rcp.isReversalEntry ? 'Reversed' : 'Received'}
                              </p>
                              <p
                                className={`text-2xl sm:text-3xl font-extrabold ${
                                  rcp.isReversalEntry ? 'text-red-700' : 'text-emerald-800'
                                }`}
                              >
                                {formatCurrency(rcp.amount)}
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-600">
                              <p className="font-semibold text-gray-900">
                                Date Issued: {formatDateTime(rcp.dateIssued)}
                              </p>
                              <p>Processed by: {rcp.processedByName}</p>
                            </div>
                          </div>

                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div>
                              <dt className="text-xs uppercase font-semibold text-gray-500">
                                Received From (Participant)
                              </dt>
                              <dd className="font-bold text-gray-900">{rcp.participantName}</dd>
                            </div>

                            <div>
                              <dt className="text-xs uppercase font-semibold text-gray-500">
                                Booking Reference
                              </dt>
                              <dd className="font-mono font-bold text-gray-900">
                                {rcp.appointmentReference}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-xs uppercase font-semibold text-gray-500">
                                Sacrament &amp; Schedule
                              </dt>
                              <dd className="font-semibold text-gray-900">
                                {rcp.sacramentLabel} ({formatDate(rcp.scheduledDate)}{' '}
                                {rcp.scheduledTime})
                              </dd>
                            </div>

                            <div>
                              <dt className="text-xs uppercase font-semibold text-gray-500">
                                Payment Method &amp; Channel
                              </dt>
                              <dd className="font-semibold text-gray-900">
                                {rcp.paymentMethodLabel}
                                {rcp.providerChannelLabel ? ` — ${rcp.providerChannelLabel}` : ''}
                              </dd>
                            </div>

                            {rcp.providerRef && (
                              <div className="sm:col-span-2">
                                <dt className="text-xs uppercase font-semibold text-gray-500">
                                  External / Gateway Reference No.
                                </dt>
                                <dd className="font-mono text-gray-900">{rcp.providerRef}</dd>
                              </div>
                            )}

                            {rcp.reversalReason && (
                              <div className="sm:col-span-2 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-900">
                                <strong>Reversal Reason:</strong> {rcp.reversalReason}
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Right Column: Receipt QR & Cryptographic Seal */}
                        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center text-center space-y-2.5">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Receipt Verification QR
                          </p>
                          <div
                            className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"
                            dangerouslySetInnerHTML={{ __html: rcp.qrSvg }}
                          />
                          <div className="w-full pt-2 border-t border-slate-200">
                            <p className="text-[11px] uppercase text-gray-500 font-semibold">
                              Official Receipt Seal
                            </p>
                            <p className="font-mono font-extrabold text-sm text-slate-900 tracking-wider">
                              {rcp.verificationSeal}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function PassAndReceiptPage({ params }: PageProps) {
  const { reference } = use(params);
  const decodedReference = decodeURIComponent(reference);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 p-8 text-center text-gray-600">
          Loading Official Receipt &amp; QR Appointment Pass...
        </div>
      }
    >
      <PassAndReceiptViewer reference={decodedReference} />
    </Suspense>
  );
}
