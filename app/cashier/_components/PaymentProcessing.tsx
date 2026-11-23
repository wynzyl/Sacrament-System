'use client';

import { useState, useEffect } from 'react';
import { usePayments } from '@/lib/hooks/usePayments';
import { useAppointments } from '@/lib/hooks/useAppointments';
import {
  BANK_TRANSFER_CHANNELS,
  ONLINE_WALLET_CHANNELS,
  PAYMENT_METHOD_LABELS,
  PROVIDER_CHANNEL_LABELS,
} from '@/lib/constants';
import { formatCurrency, formatDateTime } from '@/lib/utils';

type CashierMethod = 'CASH' | 'GCASH' | 'ONLINE_WALLET' | 'BANK_TRANSFER';

export function PaymentProcessing() {
  const { payments, summary, fetchTodayPayments, processPayment } = usePayments();
  const { appointments, fetchAppointments } = useAppointments();

  const [selectedAppointment, setSelectedAppointment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CashierMethod>('CASH');
  const [providerChannel, setProviderChannel] = useState<string>('MAYA');
  const [balanceDue, setBalanceDue] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [processing, setProcessing] = useState(false);

  const selectedApt = appointments.find((a) => a.id === selectedAppointment);
  const paymentValue = parseFloat(paymentAmount) || 0;
  // Use centavo arithmetic to avoid float drift
  const paymentCentavos = Math.round(paymentValue * 100);
  const balanceCentavos = Math.round(balanceDue * 100);
  const change = (paymentCentavos - balanceCentavos) / 100;
  const isValidPayment = paymentCentavos >= balanceCentavos && balanceCentavos > 0;
  const needsReference = paymentMethod !== 'CASH';

  useEffect(() => {
    fetchAppointments({ status: 'PENDING,CONFIRMED', unpaid: 'true' });
    fetchTodayPayments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMethodChange = (method: CashierMethod) => {
    setPaymentMethod(method);
    if (method === 'ONLINE_WALLET') setProviderChannel(ONLINE_WALLET_CHANNELS[0].id);
    else if (method === 'BANK_TRANSFER') setProviderChannel(BANK_TRANSFER_CHANNELS[0].id);
    else if (method === 'GCASH') setProviderChannel('GCASH');
    else setProviderChannel('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPayment) {
      alert('Payment amount must be equal to or greater than the balance due.');
      return;
    }

    setProcessing(true);
    try {
      const created = await processPayment({
        appointmentId: selectedAppointment,
        amount: balanceDue,
        paymentMethod,
        gcashRefNumber: needsReference ? referenceNo : null,
        providerChannel: needsReference ? providerChannel : null,
      });

      const changeMessage = change > 0 ? `\nChange: ${formatCurrency(change)}` : '';
      alert(`Payment processed! Receipt: ${created.receiptNumber}${changeMessage}`);

      setSelectedAppointment('');
      setBalanceDue(0);
      setPaymentAmount('');
      setReferenceNo('');
      fetchAppointments({ status: 'PENDING,CONFIRMED', unpaid: 'true' });
      fetchTodayPayments();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Cash (Today, Net)</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.cash)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">GCash (Today, Net)</h3>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary.gcash)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Online Wallet (Net)</h3>
          <p className="text-2xl font-bold text-indigo-600">
            {formatCurrency(summary.onlineWallet ?? 0)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow">
          <h3 className="text-xs font-medium text-gray-500">Bank Transfer (Net)</h3>
          <p className="text-2xl font-bold text-teal-600">
            {formatCurrency(summary.bankTransfer ?? 0)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow col-span-2 md:col-span-1">
          <h3 className="text-xs font-medium text-gray-500">Overall Total (Net)</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary.total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Form */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Process Payment</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Select Unpaid Appointment</label>
              <select
                value={selectedAppointment}
                onChange={(e) => {
                  setSelectedAppointment(e.target.value);
                  const apt = appointments.find((a) => a.id === e.target.value);
                  const bal = apt ? apt.balanceDue ?? apt.fee : 0;
                  setBalanceDue(bal);
                  setPaymentAmount(bal > 0 ? String(bal) : '');
                }}
                required
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Choose an appointment...</option>
                {appointments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.referenceNumber ? `[${apt.referenceNumber}] ` : ''}
                    {apt.participantName} - {apt.sacramentType} (Balance:{' '}
                    {formatCurrency(apt.balanceDue ?? apt.fee)})
                  </option>
                ))}
              </select>
            </div>

            {selectedApt && (
              <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 space-y-1">
                <div className="flex justify-between">
                  <span>Fee:</span>
                  <span className="font-semibold">{formatCurrency(selectedApt.fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Already Paid:</span>
                  <span className="font-semibold text-green-700">
                    {formatCurrency(selectedApt.amountPaid ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1 text-sm font-bold text-gray-900">
                  <span>Balance Due:</span>
                  <span>{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'GCASH', 'ONLINE_WALLET', 'BANK_TRANSFER'] as CashierMethod[]).map(
                  (method) => (
                    <label
                      key={method}
                      className={`flex items-center p-2.5 border rounded-lg cursor-pointer text-sm ${
                        paymentMethod === method
                          ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        value={method}
                        checked={paymentMethod === method}
                        onChange={() => handleMethodChange(method)}
                        className="mr-2"
                      />
                      {PAYMENT_METHOD_LABELS[method]}
                    </label>
                  )
                )}
              </div>
            </div>

            {paymentMethod === 'ONLINE_WALLET' && (
              <div>
                <label className="block text-sm font-medium mb-1">Online Wallet Provider</label>
                <select
                  value={providerChannel}
                  onChange={(e) => setProviderChannel(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {ONLINE_WALLET_CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {paymentMethod === 'BANK_TRANSFER' && (
              <div>
                <label className="block text-sm font-medium mb-1">Bank / Transfer Channel</label>
                <select
                  value={providerChannel}
                  onChange={(e) => setProviderChannel(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {BANK_TRANSFER_CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Balance Due</label>
              <input
                type="text"
                value={balanceDue > 0 ? formatCurrency(balanceDue) : ''}
                readOnly
                className="w-full px-3 py-2 border rounded-lg bg-gray-100 font-semibold text-gray-700"
                placeholder="Select an appointment"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount Tendered</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                step="0.01"
                min={balanceDue}
                className={`w-full px-3 py-2 border rounded-lg ${
                  paymentAmount && !isValidPayment ? 'border-red-500 bg-red-50' : ''
                }`}
                placeholder="Enter amount received"
              />
              {paymentAmount && !isValidPayment && (
                <p className="text-red-500 text-sm mt-1">
                  Amount must be at least {formatCurrency(balanceDue)}
                </p>
              )}
            </div>

            {paymentAmount && isValidPayment && paymentMethod === 'CASH' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-800">Change:</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(change)}
                  </span>
                </div>
              </div>
            )}

            {needsReference && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {paymentMethod === 'GCASH'
                    ? 'GCash Reference Number'
                    : paymentMethod === 'ONLINE_WALLET'
                    ? 'Online Wallet Reference Number'
                    : 'Bank Transfer / InstaPay / PESONet Reference Number'}
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  required
                  minLength={3}
                  className="w-full px-3 py-2 border rounded-lg font-mono"
                  placeholder="Enter transaction reference number"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={processing || !isValidPayment}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {processing ? 'Processing...' : 'Process Payment'}
            </button>
          </form>
        </div>

        {/* Today's Payments */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Today&apos;s Ledger Entries</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {payments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No payments today</p>
            ) : (
              payments.map((payment) => {
                const isReversal = payment.kind === 'REVERSAL' || payment.amount < 0;
                const channelText = payment.providerChannel
                  ? PROVIDER_CHANNEL_LABELS[payment.providerChannel] || payment.providerChannel
                  : null;
                return (
                  <div
                    key={payment.id}
                    className={`border-l-4 p-3 rounded ${
                      isReversal ? 'border-red-500 bg-red-50/60' : 'border-blue-500 bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{payment.appointment.participantName}</p>
                          {isReversal && (
                            <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-semibold">
                              REVERSAL
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
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
