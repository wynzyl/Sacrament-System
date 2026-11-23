'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePayments } from '@/lib/hooks/usePayments';
import { Modal } from '@/components/Modal';
import { PAYMENT_METHOD_LABELS, PROVIDER_CHANNEL_LABELS } from '@/lib/constants';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Payment, PaymentSummary } from '@/types';

interface PaymentsTabProps {
  initialPayments?: Payment[];
  initialSummary?: PaymentSummary;
  onDataChange?: () => void;
}

export function PaymentsTab({ initialPayments, initialSummary, onDataChange }: PaymentsTabProps) {
  const router = useRouter();
  const { payments, summary, fetchTodayPayments, reversePayment } = usePayments();
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    fetchTodayPayments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = payments.length > 0 ? payments : initialPayments || [];
  const summ =
    payments.length > 0
      ? summary
      : initialSummary || { cash: 0, gcash: 0, onlineWallet: 0, bankTransfer: 0, total: 0 };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const res = await reversePayment(reverseTarget.id, reverseReason);
      const pendingNote = res.appointmentReturnedToPending
        ? '\nAppointment status returned to PENDING.'
        : '';
      alert(`Payment reversed (${res.reversal.receiptNumber}).${pendingNote}`);
      setReverseTarget(null);
      setReverseReason('');
      fetchTodayPayments();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to reverse payment');
    } finally {
      setReversing(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Today&apos;s Payments (Net of Reversals)</h2>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Cash Total (Net)</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summ.cash)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">GCash Total (Net)</h3>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(summ.gcash)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Online Wallet (Net)</h3>
          <p className="text-2xl font-bold text-indigo-600">
            {formatCurrency(summ.onlineWallet ?? 0)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Bank Transfer (Net)</h3>
          <p className="text-2xl font-bold text-teal-600">
            {formatCurrency(summ.bankTransfer ?? 0)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow col-span-2 md:col-span-1">
          <h3 className="text-xs font-medium text-gray-500">Overall Total (Net)</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(summ.total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Today&apos;s Ledger Entries</h3>
          <button
            onClick={() => router.push('/cashier')}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Go to Cashier
          </button>
        </div>
        <div className="space-y-3 max-h-[32rem] overflow-y-auto">
          {data.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No payments today</p>
          ) : (
            data.map((payment) => {
              const isReversal = payment.kind === 'REVERSAL' || payment.amount < 0;
              const alreadyReversed = !!payment.reversal;
              const channelText = payment.providerChannel
                ? PROVIDER_CHANNEL_LABELS[payment.providerChannel] || payment.providerChannel
                : null;
              return (
                <div
                  key={payment.id}
                  className={`border-l-4 p-3 rounded ${
                    isReversal
                      ? 'border-red-500 bg-red-50/60'
                      : alreadyReversed
                      ? 'border-gray-400 bg-gray-100'
                      : 'border-blue-500 bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{payment.appointment.participantName}</p>
                        {isReversal && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-semibold">
                            REVERSAL
                          </span>
                        )}
                        {payment.provider && payment.provider !== 'MANUAL' && (
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                            {payment.provider}
                          </span>
                        )}
                        {alreadyReversed && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                            Reversed by {payment.reversal?.receiptNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {payment.appointment.sacramentType}
                        {payment.appointment.referenceNumber
                          ? ` • ${payment.appointment.referenceNumber}`
                          : ''}
                      </p>
                      <p className="text-xs text-gray-500">{formatDateTime(payment.createdAt)}</p>
                      <p className="text-xs text-gray-500">
                        Processed by: {payment.processedBy?.name || 'Online Payment Gateway'}
                        {payment.gcashRefNumber ? ` • Ref: ${payment.gcashRefNumber}` : ''}
                      </p>
                      {payment.reason && (
                        <p className="text-xs text-red-700 mt-1">Reason: {payment.reason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold ${
                          isReversal ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(payment.amount)}
                      </p>
                      <p className="text-xs text-gray-600">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod}
                        {channelText ? ` (${channelText})` : ''}
                      </p>
                      <p className="text-xs font-mono text-gray-500">{payment.receiptNumber}</p>
                      {!isReversal && !alreadyReversed && (
                        <button
                          type="button"
                          onClick={() => {
                            setReverseTarget(payment);
                            setReverseReason('');
                          }}
                          className="mt-2 text-xs text-red-600 hover:text-red-800 underline font-medium"
                        >
                          Reverse / Void
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reverse Payment Modal (FR-5.4) */}
      <Modal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        title="Reverse / Void Payment"
        maxWidth="max-w-md"
      >
        {reverseTarget && (
          <form onSubmit={handleConfirmReverse} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-amber-900">
                Receipt {reverseTarget.receiptNumber} — {formatCurrency(reverseTarget.amount)} (
                {PAYMENT_METHOD_LABELS[reverseTarget.paymentMethod] || reverseTarget.paymentMethod})
              </p>
              <p className="text-amber-800 text-xs mt-1">
                Participant: {reverseTarget.appointment.participantName}
              </p>
              <p className="text-amber-800 text-xs mt-1">
                This will append a negative REVERSAL entry (RVS-...) to the ledger. The original
                receipt is preserved for audit.
              </p>
            </div>

            <div>
              <label
                htmlFor="reverse-reason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Reason for Reversal (required)
              </label>
              <textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                required
                minLength={3}
                rows={3}
                placeholder="e.g. Duplicate entry or wrong appointment selected..."
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReverseTarget(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reversing || reverseReason.trim().length < 3}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
              >
                {reversing ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
