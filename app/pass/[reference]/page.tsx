// app/pass/[reference]/page.tsx
// FEAT-P3: Dedicated Print-Ready (@media print styled) Official Receipt & QR
// Appointment Confirmation Pass for Immaculate Conception Cathedral Parish (Urdaneta City).

'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CHURCH_NAME } from '@/lib/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { AppointmentPassData, OfficialReceiptData } from '@/lib/receiptPass';

interface PageProps {
  params: Promise<{ reference: string }>;
}

interface PassApiResponse {
  pass: AppointmentPassData;
  receipts: OfficialReceiptData[];
}

type PrintFilter = 'ALL' | 'PASS_ONLY' | 'RECEIPTS_ONLY';

const STATUS_BADGE_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900 border-amber-300',
  CONFIRMED: 'bg-blue-100 text-blue-900 border-blue-300',
  COMPLETED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  CANCELLED: 'bg-red-100 text-red-900 border-red-300',
};

export default function ReceiptAndAppointmentPassPage({ params }: PageProps) {
  const { reference: rawReference } = use(params);
  const reference = decodeURIComponent(rawReference);
  const searchParams = useSearchParams();

  const [data, setData] = useState<PassApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsContact, setNeedsContact] = useState(false);
  const [contactInput, setContactInput] = useState('');
  const [error, setError] = useState('');
  const [printFilter, setPrintFilter] = useState<PrintFilter>('ALL');

  const fetchPassData = useCallback(
    async (contact?: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/public/pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference,
            ...(contact ? { contact } : {}),
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          if (!contact) {
            // An unauthenticated visitor without contact query param must verify contact
            setNeedsContact(true);
          } else {
            setError(body.error || 'Could not verify booking with those details.');
          }
          setData(null);
          return;
        }
        setData(body);
        setNeedsContact(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load pass and official receipts.');
      } finally {
        setLoading(false);
      }
    },
    [reference]
  );

  useEffect(() => {
    const queryContact = searchParams.get('contact');
    const queryView = searchParams.get('view');
    if (queryView === 'receipts') setPrintFilter('RECEIPTS_ONLY');
    else if (queryView === 'pass') setPrintFilter('PASS_ONLY');

    if (queryContact) {
      setContactInput(queryContact);
      fetchPassData(queryContact);
    } else {
      fetchPassData();
    }
  }, [fetchPassData, searchParams]);

  const handleContactVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactInput.trim()) return;
    await fetchPassData(contactInput.trim());
  };

  const handlePrint = (filter?: PrintFilter) => {
    if (filter && filter !== printFilter) {
      setPrintFilter(filter);
      setTimeout(() => window.print(), 80);
    } else {
      window.print();
    }
  };

  const pass = data?.pass;
  const receipts = data?.receipts ?? [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white print:min-h-0">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-sheet {
            box-shadow: none !important;
            border-color: #334155 !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-page-break {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>

      {/* Top Action Bar (Hidden when printing) */}
      <header className="no-print bg-slate-900 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-amber-300 font-semibold uppercase tracking-wider">
              {CHURCH_NAME} • Urdaneta City
            </p>
            <h1 className="text-lg font-bold">
              Official Receipt &amp; QR Appointment Confirmation Pass
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/track?ref=${encodeURIComponent(reference)}`}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
            >
              ← Track Booking
            </Link>
            <Link
              href="/book"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
            >
              My Bookings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 print:max-w-none print:p-0 print:space-y-6">
        {loading ? (
          <div className="no-print bg-white rounded-xl shadow p-8 text-center text-gray-600">
            Generating verifiable QR Appointment Pass &amp; Diocesan Official Receipts...
          </div>
        ) : needsContact || !pass ? (
          <div className="no-print bg-white rounded-2xl shadow-lg p-6 max-w-lg mx-auto border-t-4 border-blue-700 space-y-4">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900">
                Verification Required
              </span>
              <h2 className="text-xl font-bold text-gray-900 mt-2">
                View Official Receipt &amp; QR Appointment Pass
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                To protect parishioner privacy under RA 10173, enter the mobile number or email
                address used for booking <strong className="font-mono">{reference}</strong> (or sign
                in with your parishioner/staff account).
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border-l-4 border-red-600 p-3 rounded text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleContactVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  Booking Reference
                </label>
                <input
                  type="text"
                  value={reference}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 font-mono font-bold text-gray-800"
                />
              </div>

              <div>
                <label
                  htmlFor="pass-contact-input"
                  className="block text-sm font-semibold text-gray-800 mb-1"
                >
                  Mobile Number or Email Used When Booking
                </label>
                <input
                  id="pass-contact-input"
                  type="text"
                  value={contactInput}
                  onChange={(e) => setContactInput(e.target.value)}
                  required
                  placeholder="0917 123 4567 or family@example.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg shadow"
              >
                Unlock QR Pass &amp; Official Receipts
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Interactive Print / Save-as-PDF Toolbar */}
            <div className="no-print bg-white rounded-xl shadow p-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase text-slate-500 mr-1">Document View:</span>
                <button
                  type="button"
                  onClick={() => setPrintFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    printFilter === 'ALL'
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Pass + Official Receipts ({receipts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFilter('PASS_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    printFilter === 'PASS_ONLY'
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  QR Appointment Pass Only
                </button>
                {receipts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPrintFilter('RECEIPTS_ONLY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      printFilter === 'RECEIPTS_ONLY'
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Official Receipts Only ({receipts.length})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrint()}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow flex items-center gap-1.5"
                >
                  🖨️ Print / Save as PDF
                </button>
              </div>
            </div>

            {/* ==============================================================
                SECTION 1: QR APPOINTMENT CONFIRMATION PASS
               ============================================================== */}
            {(printFilter === 'ALL' || printFilter === 'PASS_ONLY') && (
              <section
                aria-label="QR Appointment Confirmation Pass"
                className="print-sheet bg-white rounded-2xl shadow-lg border-2 border-slate-800 overflow-hidden"
              >
                {/* Cathedral Banner */}
                <div className="bg-slate-900 text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4 border-b-4 border-amber-400">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-amber-300 font-semibold">
                      {pass.header.diocese}
                    </p>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                      {pass.header.churchName}
                    </h2>
                    <p className="text-xs text-slate-300">{pass.header.address}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 rounded bg-amber-400 text-slate-950 text-xs font-extrabold uppercase tracking-wider">
                      QR Appointment Confirmation Pass
                    </span>
                    <p className="text-xs font-mono text-slate-300 mt-1">
                      Seal: <strong className="text-white">{pass.verificationSeal}</strong>
                    </p>
                  </div>
                </div>

                {/* Main Body */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                  {/* Left 2 Columns: Schedule, Participant, Priest, Payment & Requirements */}
                  <div className="md:col-span-2 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-500">
                          Booking Reference Number
                        </p>
                        <p className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 tracking-wide">
                          {pass.referenceNumber}
                        </p>
                      </div>
                      <span
                        className={`px-3.5 py-1 rounded-full text-xs font-extrabold border uppercase ${
                          STATUS_BADGE_STYLES[pass.status] ||
                          'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {pass.status}
                      </span>
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase font-semibold text-slate-500">
                          Sacrament
                        </dt>
                        <dd className="text-base font-bold text-slate-900 mt-0.5">
                          {pass.sacramentLabel}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase font-semibold text-slate-500">
                          Participant
                        </dt>
                        <dd className="text-base font-bold text-slate-900 mt-0.5">
                          {pass.participantName}
                        </dd>
                        {pass.participantAddress && (
                          <dd className="text-xs text-slate-600">{pass.participantAddress}</dd>
                        )}
                      </div>
                      <div>
                        <dt className="text-xs uppercase font-semibold text-slate-500">
                          Scheduled Date &amp; Time
                        </dt>
                        <dd className="font-bold text-slate-900 mt-0.5">
                          {formatDate(pass.scheduledDate)} • {pass.scheduledTime}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase font-semibold text-slate-500">
                          Assigned Officiating Priest
                        </dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">{pass.priestName}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase font-semibold text-slate-500">
                          Ceremony Venue
                        </dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">{pass.location}</dd>
                      </div>
                    </dl>

                    {/* Payment Summary Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Offering / Payment Summary
                        </h3>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            pass.paymentSummary.isFullyPaid
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {pass.paymentSummary.isFullyPaid
                            ? 'FULLY PAID'
                            : pass.paymentSummary.fee === 0
                            ? 'FEE TO BE SET BY OFFICE'
                            : 'BALANCE DUE'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm pt-1">
                        <div>
                          <p className="text-xs text-slate-500">Fee</p>
                          <p className="font-bold text-slate-900">
                            {pass.paymentSummary.fee > 0
                              ? formatCurrency(pass.paymentSummary.fee)
                              : 'Pending'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Net Paid</p>
                          <p className="font-bold text-emerald-700">
                            {formatCurrency(pass.paymentSummary.amountPaid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Balance Due</p>
                          <p className="font-bold text-slate-900">
                            {formatCurrency(pass.paymentSummary.balanceDue)}
                          </p>
                        </div>
                      </div>
                      {pass.paymentSummary.receiptNumbers.length > 0 && (
                        <p className="text-xs text-slate-600 pt-1 border-t border-slate-200 font-mono">
                          Official Receipt(s): {pass.paymentSummary.receiptNumbers.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Requirement Readiness */}
                    <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Document &amp; Requirement Readiness
                        </h3>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            pass.requirementReadiness.isComplete
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {pass.requirementReadiness.metCount}/
                          {pass.requirementReadiness.totalCount} Verified
                        </span>
                      </div>
                      {pass.requirementReadiness.items.length > 0 ? (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs pt-1">
                          {pass.requirementReadiness.items.map((item, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <span
                                className={`font-bold ${
                                  item.isMet ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {item.isMet ? '✓' : '○'}
                              </span>
                              <span
                                className={
                                  item.isMet ? 'text-slate-700' : 'text-slate-900 font-medium'
                                }
                              >
                                {item.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">
                          No additional document checklist items configured.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: QR Matrix & Tamper-Evident Verification Seal */}
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center text-center space-y-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Parish Verification Matrix
                    </p>
                    <div
                      className="bg-white p-2.5 rounded-lg border border-slate-300 shadow-sm"
                      dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
                    />
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase font-semibold text-slate-500">
                        Cryptographic Seal
                      </p>
                      <p className="font-mono text-sm font-extrabold px-2.5 py-1 rounded bg-slate-900 text-amber-300 inline-block">
                        {pass.verificationSeal}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Present this pass (printed or on your phone) at the {CHURCH_NAME} office upon
                      arrival for document and schedule verification.
                    </p>
                  </div>
                </div>

                {/* Pass Footer */}
                <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Payload: {pass.qrPayload}</span>
                  <span>Issued: {formatDateTime(pass.issuedAt)}</span>
                </div>
              </section>
            )}

            {/* ==============================================================
                SECTION 2: OFFICIAL RECEIPTS (RCP-YYYY-NNNNN)
               ============================================================== */}
            {(printFilter === 'ALL' || printFilter === 'RECEIPTS_ONLY') && (
              <div className="space-y-6">
                {receipts.length === 0 ? (
                  <div className="no-print bg-white rounded-xl shadow p-6 text-center text-sm text-slate-600 border border-slate-200">
                    No Official Receipts have been issued for this booking yet. Once a payment is
                    processed at the parish cashier or via PayMongo online checkout, the sequential
                    Official Receipt (<code className="font-mono font-bold">RCP-YYYY-NNNNN</code>)
                    will appear here automatically.
                  </div>
                ) : (
                  receipts.map((rcp, index) => {
                    const isReversed = rcp.reversalStatus === 'REVERSED';
                    const isReversalEntry = rcp.reversalStatus === 'REVERSAL_ENTRY';
                    return (
                      <section
                        key={rcp.receiptNumber}
                        aria-label={`Official Receipt ${rcp.receiptNumber}`}
                        className={`print-sheet bg-white rounded-2xl shadow-lg border-2 border-slate-800 overflow-hidden ${
                          printFilter === 'ALL' || index > 0 ? 'print-page-break' : ''
                        }`}
                      >
                        {/* Diocesan Official Receipt Header */}
                        <div className="bg-emerald-950 text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4 border-b-4 border-emerald-400">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">
                              {rcp.header.diocese} • Parish Accounting Office
                            </p>
                            <h2 className="text-xl sm:text-2xl font-bold">
                              {rcp.header.churchName}
                            </h2>
                            <p className="text-xs text-emerald-100">{rcp.header.address}</p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`inline-block px-3 py-1 rounded text-xs font-extrabold uppercase tracking-wider ${
                                isReversalEntry
                                  ? 'bg-red-500 text-white'
                                  : isReversed
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-emerald-400 text-slate-950'
                              }`}
                            >
                              {isReversalEntry
                                ? 'Reversal Voucher'
                                : 'Diocesan Official Receipt'}
                            </span>
                            <p className="text-lg font-mono font-extrabold text-white mt-1">
                              {rcp.receiptNumber}
                            </p>
                          </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                          <div className="md:col-span-2 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                              <div>
                                <p className="text-xs uppercase font-bold text-slate-500">
                                  Official Receipt No.
                                </p>
                                <p className="text-2xl font-mono font-extrabold text-slate-900">
                                  {rcp.receiptNumber}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs uppercase font-bold text-slate-500">
                                  Amount {isReversalEntry ? 'Reversed' : 'Received'}
                                </p>
                                <p
                                  className={`text-2xl font-extrabold ${
                                    isReversalEntry
                                      ? 'text-red-700'
                                      : isReversed
                                      ? 'line-through text-slate-500'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {formatCurrency(rcp.amount)}
                                </p>
                              </div>
                            </div>

                            {rcp.reversalStatus !== 'VALID' && (
                              <div
                                className={`p-3 rounded-lg border text-xs font-semibold ${
                                  isReversalEntry
                                    ? 'bg-red-50 border-red-300 text-red-900'
                                    : 'bg-amber-50 border-amber-300 text-amber-900'
                                }`}
                              >
                                {isReversalEntry ? (
                                  <>
                                    REVERSAL ENTRY — Cancels Official Receipt{' '}
                                    <span className="font-mono font-bold">
                                      {rcp.reversesReceiptNumber || 'N/A'}
                                    </span>
                                    {rcp.reversalReason ? ` (Reason: ${rcp.reversalReason})` : ''}
                                  </>
                                ) : (
                                  <>
                                    VOIDED / REVERSED by voucher{' '}
                                    <span className="font-mono font-bold">
                                      {rcp.reversedByReceiptNumber}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Received From (Participant)
                                </dt>
                                <dd className="font-bold text-slate-900 mt-0.5">
                                  {rcp.participantName}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Booking Reference
                                </dt>
                                <dd className="font-mono font-bold text-slate-900 mt-0.5">
                                  {rcp.appointmentReference}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Sacrament &amp; Schedule
                                </dt>
                                <dd className="font-semibold text-slate-900 mt-0.5">
                                  {rcp.sacramentLabel} ({formatDate(rcp.scheduledDate)}{' '}
                                  {rcp.scheduledTime})
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Date &amp; Time Issued
                                </dt>
                                <dd className="font-semibold text-slate-900 mt-0.5">
                                  {formatDateTime(rcp.dateIssued)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Payment Method &amp; Channel
                                </dt>
                                <dd className="font-semibold text-slate-900 mt-0.5">
                                  {rcp.paymentMethodLabel}
                                  {rcp.providerChannelLabel ? ` — ${rcp.providerChannelLabel}` : ''}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Provider / External Ref
                                </dt>
                                <dd className="font-mono text-xs text-slate-800 mt-0.5">
                                  {rcp.provider}
                                  {rcp.externalReference ? ` • ${rcp.externalReference}` : ''}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs uppercase font-semibold text-slate-500">
                                  Processed / Verified By
                                </dt>
                                <dd className="font-semibold text-slate-900 mt-0.5">
                                  {rcp.processedByName}
                                </dd>
                              </div>
                            </dl>
                          </div>

                          {/* Receipt QR Matrix & Seal */}
                          <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center text-center space-y-2.5">
                            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                              Official Receipt QR Seal
                            </p>
                            <div
                              className="bg-white p-2 rounded-lg border border-slate-300 shadow-sm"
                              dangerouslySetInnerHTML={{ __html: rcp.qrSvg }}
                            />
                            <div>
                              <p className="text-[11px] uppercase font-semibold text-slate-500">
                                Receipt Digest Seal
                              </p>
                              <p className="font-mono text-xs font-extrabold px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 inline-block mt-0.5">
                                {rcp.verificationSeal}
                              </p>
                            </div>
                            <p className="text-[11px] text-slate-600">
                              Status: <strong>{rcp.reversalStatus}</strong>
                            </p>
                          </div>
                        </div>

                        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span>QR Payload: {rcp.qrPayload}</span>
                          <span>Tamper-Evident Seal: {rcp.verificationSeal}</span>
                        </div>
                      </section>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
