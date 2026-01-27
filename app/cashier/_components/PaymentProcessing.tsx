'use client';

import { useState, useEffect } from 'react';
import { usePayments } from '@/lib/hooks/usePayments';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export function PaymentProcessing() {
  const { payments, summary, fetchTodayPayments, processPayment } = usePayments();
  const { appointments, fetchAppointments } = useAppointments();

  const [selectedAppointment, setSelectedAppointment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
  const [fee, setFee] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [gcashRef, setGcashRef] = useState('');
  const [processing, setProcessing] = useState(false);

  const paymentValue = parseFloat(paymentAmount) || 0;
  const change = paymentValue - fee;
  const isValidPayment = paymentValue >= fee && fee > 0;

  useEffect(() => {
    fetchAppointments({ status: 'PENDING', unpaid: 'true' });
    fetchTodayPayments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPayment) { alert('Payment amount must be equal to or greater than the fee.'); return; }

    setProcessing(true);
    try {
      await processPayment({
        appointmentId: selectedAppointment,
        amount: fee,
        paymentMethod,
        gcashRefNumber: paymentMethod === 'GCASH' ? gcashRef : null,
      });

      const changeMessage = change > 0 ? `\nChange: ${formatCurrency(change)}` : '';
      alert(`Payment processed successfully!${changeMessage}`);

      setSelectedAppointment(''); setFee(0); setPaymentAmount(''); setGcashRef('');
      fetchAppointments({ status: 'PENDING', unpaid: 'true' });
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Cash Total (Today)</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(summary.cash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">GCash Total (Today)</h3>
          <p className="text-3xl font-bold text-blue-600">{formatCurrency(summary.gcash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Overall Total (Today)</h3>
          <p className="text-3xl font-bold text-purple-600">{formatCurrency(summary.total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Form */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Process Payment</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Select Appointment</label>
              <select
                value={selectedAppointment}
                onChange={(e) => {
                  setSelectedAppointment(e.target.value);
                  const apt = appointments.find(a => a.id === e.target.value);
                  setFee(apt ? apt.fee : 0);
                  setPaymentAmount('');
                }}
                required
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Choose an appointment...</option>
                {appointments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.participantName} - {apt.sacramentType} ({formatCurrency(apt.fee)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input type="radio" value="CASH" checked={paymentMethod === 'CASH'} onChange={(e) => setPaymentMethod(e.target.value as 'CASH')} className="mr-2" />
                  Cash
                </label>
                <label className="flex items-center">
                  <input type="radio" value="GCASH" checked={paymentMethod === 'GCASH'} onChange={(e) => setPaymentMethod(e.target.value as 'GCASH')} className="mr-2" />
                  GCash
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Fee Amount</label>
              <input type="text" value={fee > 0 ? formatCurrency(fee) : ''} readOnly className="w-full px-3 py-2 border rounded-lg bg-gray-100 font-semibold text-gray-700" placeholder="Select an appointment" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Amount</label>
              <input
                type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                required step="0.01" min={fee}
                className={`w-full px-3 py-2 border rounded-lg ${paymentAmount && !isValidPayment ? 'border-red-500 bg-red-50' : ''}`}
                placeholder="Enter payment amount"
              />
              {paymentAmount && !isValidPayment && (
                <p className="text-red-500 text-sm mt-1">Payment must be at least {formatCurrency(fee)}</p>
              )}
            </div>

            {paymentAmount && isValidPayment && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-800">Change:</span>
                  <span className="text-2xl font-bold text-green-600">{formatCurrency(change)}</span>
                </div>
              </div>
            )}

            {paymentMethod === 'GCASH' && (
              <div>
                <label className="block text-sm font-medium mb-1">GCash Reference Number</label>
                <input type="text" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} required className="w-full px-3 py-2 border rounded-lg" placeholder="Enter reference number" />
              </div>
            )}

            <button type="submit" disabled={processing || !isValidPayment} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              {processing ? 'Processing...' : 'Process Payment'}
            </button>
          </form>
        </div>

        {/* Today's Payments */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Today&apos;s Payments</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {payments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No payments today</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="border-l-4 border-blue-500 bg-gray-50 p-3 rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{payment.appointment.participantName}</p>
                      <p className="text-sm text-gray-600">{payment.appointment.sacramentType}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(payment.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                      <p className="text-xs text-gray-600">{payment.paymentMethod}</p>
                      <p className="text-xs text-gray-500">{payment.receiptNumber}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
