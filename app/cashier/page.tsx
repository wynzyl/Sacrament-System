// app/cashier/page.tsx
// Cashier dashboard - process payments and view summary

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  role: string;
}

interface Appointment {
  id: string;
  sacramentType: string;
  participantName: string;
  scheduledDate: string;
  fee: number;
  status: string;
}

interface Payment {
  id: string;
  amount: number;
  paymentMethod: string;
  receiptNumber: string;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: string;
  };
}

export default function CashierDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState({ cash: 0, gcash: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Payment form state
  const [selectedAppointment, setSelectedAppointment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
  const [fee, setFee] = useState<number>(0);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [gcashRef, setGcashRef] = useState('');
  const [processing, setProcessing] = useState(false);

  // Calculate change/balance
  const paymentValue = parseFloat(paymentAmount) || 0;
  const change = paymentValue - fee;
  const isValidPayment = paymentValue >= fee && fee > 0;

  useEffect(() => {
    // Check session via API
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (!response.ok) {
          router.push('/');
          return;
        }

        const data = await response.json();
        if (data.user.role !== 'CASHIER' && data.user.role !== 'ADMIN') {
          router.push('/');
          return;
        }

        setUser(data.user);
        fetchData();
      } catch (error) {
        router.push('/');
      }
    };

    checkSession();
  }, [router]);

  const fetchData = async () => {
    try {
      // Fetch confirmed appointments without payment
      const appointmentsRes = await fetch('/api/appointments?status=CONFIRMED&unpaid=true');
      const appointmentsData = await appointmentsRes.json();
      setAppointments(appointmentsData);

      // Fetch today's payments
      const paymentsRes = await fetch('/api/payments/today');
      const paymentsData = await paymentsRes.json();
      setPayments(paymentsData.payments);
      setSummary(paymentsData.summary);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidPayment) {
      alert('Payment amount must be equal to or greater than the fee.');
      return;
    }

    setProcessing(true);

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppointment,
          amount: fee, // Record the fee amount as payment
          paymentMethod,
          gcashRefNumber: paymentMethod === 'GCASH' ? gcashRef : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment failed');
      }

      const changeMessage = change > 0 ? `\nChange: ${formatCurrency(change)}` : '';
      alert(`Payment processed successfully!${changeMessage}`);

      // Reset form
      setSelectedAppointment('');
      setFee(0);
      setPaymentAmount('');
      setGcashRef('');

      // Refresh data
      fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    router.push('/');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cashier Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user?.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
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
            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Appointment</label>
                <select
                  value={selectedAppointment}
                  onChange={(e) => {
                    setSelectedAppointment(e.target.value);
                    const apt = appointments.find(a => a.id === e.target.value);
                    if (apt) {
                      setFee(apt.fee);
                      setPaymentAmount('');
                    } else {
                      setFee(0);
                      setPaymentAmount('');
                    }
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
                    <input
                      type="radio"
                      value="CASH"
                      checked={paymentMethod === 'CASH'}
                      onChange={(e) => setPaymentMethod(e.target.value as 'CASH')}
                      className="mr-2"
                    />
                    Cash
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="GCASH"
                      checked={paymentMethod === 'GCASH'}
                      onChange={(e) => setPaymentMethod(e.target.value as 'GCASH')}
                      className="mr-2"
                    />
                    GCash
                  </label>
                </div>
              </div>

              {/* Fee Display */}
              <div>
                <label className="block text-sm font-medium mb-1">Fee Amount</label>
                <input
                  type="text"
                  value={fee > 0 ? formatCurrency(fee) : ''}
                  readOnly
                  className="w-full px-3 py-2 border rounded-lg bg-gray-100 font-semibold text-gray-700"
                  placeholder="Select an appointment"
                />
              </div>

              {/* Payment Amount Input */}
              <div>
                <label className="block text-sm font-medium mb-1">Payment Amount</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  step="0.01"
                  min={fee}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    paymentAmount && !isValidPayment ? 'border-red-500 bg-red-50' : ''
                  }`}
                  placeholder="Enter payment amount"
                />
                {paymentAmount && !isValidPayment && (
                  <p className="text-red-500 text-sm mt-1">
                    Payment must be at least {formatCurrency(fee)}
                  </p>
                )}
              </div>

              {/* Change/Balance Display */}
              {paymentAmount && isValidPayment && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-800">Change:</span>
                    <span className="text-2xl font-bold text-green-600">
                      {formatCurrency(change)}
                    </span>
                  </div>
                </div>
              )}

              {paymentMethod === 'GCASH' && (
                <div>
                  <label className="block text-sm font-medium mb-1">GCash Reference Number</label>
                  <input
                    type="text"
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    required={paymentMethod === 'GCASH'}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Enter reference number"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={processing || !isValidPayment}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Process Payment'}
              </button>
            </form>
          </div>

          {/* Today's Payments */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Today's Payments</h2>
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
      </div>
    </div>
  );
}
