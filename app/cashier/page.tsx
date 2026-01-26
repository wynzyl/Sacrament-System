// app/cashier/page.tsx
// Cashier dashboard - process payments and view summary

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import { useAutoLogout } from '@/lib/useAutoLogout';

type TabType = 'payments' | 'reports';

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

interface ReportPayment {
  id: string;
  amount: number;
  paymentMethod: string;
  receiptNumber: string;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: string;
    scheduledDate: string;
  };
}

export default function CashierDashboard() {
  const router = useRouter();
  useAutoLogout(); // Auto logout after 2 minutes of inactivity
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('payments');
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

  // Reports state
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [collectionsData, setCollectionsData] = useState<ReportPayment[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

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
      // Fetch pending appointments without payment
      const appointmentsRes = await fetch('/api/appointments?status=PENDING&unpaid=true');
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

  // Fetch collections report
  const fetchReport = async () => {
    if (!reportFromDate || !reportToDate) {
      alert('Please select both From and To dates');
      return;
    }

    setReportLoading(true);
    try {
      const params = new URLSearchParams({
        from: reportFromDate,
        to: reportToDate,
      });

      const response = await fetch(`/api/reports/collections?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCollectionsData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setReportLoading(false);
    }
  };

  // Export collections to PDF
  const exportToPDF = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    await import('jspdf-autotable');

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Daily Collection Report', 14, 22);

    doc.setFontSize(11);
    doc.text(`Date Range: ${reportFromDate} to ${reportToDate}`, 14, 32);
    doc.text(`Generated by: ${user?.name}`, 14, 40);

    // Sort by sacrament type then by date
    const sortedData = [...collectionsData].sort((a, b) => {
      const sacramentCompare = a.appointment.sacramentType.localeCompare(b.appointment.sacramentType);
      if (sacramentCompare !== 0) return sacramentCompare;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Group by date
    const groupedByDate: { [key: string]: ReportPayment[] } = {};
    sortedData.forEach((payment) => {
      const date = new Date(payment.createdAt).toISOString().split('T')[0];
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(payment);
    });

    let yPos = 50;
    let grandTotal = 0;

    Object.entries(groupedByDate).forEach(([date, datePayments]) => {
      // Date header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(formatDate(date), 14, yPos);
      yPos += 6;

      // Table for this date
      const tableData = datePayments.map((payment) => [
        payment.appointment.participantName,
        payment.appointment.sacramentType,
        payment.paymentMethod,
        payment.receiptNumber,
        Math.abs(payment.amount).toFixed(2),
      ]);

      const dateTotal = datePayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
      grandTotal += dateTotal;

      (doc as any).autoTable({
        startY: yPos,
        head: [['Participant', 'Sacrament', 'Method', 'Receipt #', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        columnStyles: {
          4: { halign: 'right' }
        },
        margin: { left: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 5;

      // Date subtotal
      doc.setFont('helvetica', 'bold');
      doc.text(`Subtotal: PHP ${dateTotal.toFixed(2)}`, 150, yPos, { align: 'right' });
      yPos += 10;

      // Check for page break
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
    });

    // Grand total
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: PHP ${grandTotal.toFixed(2)}`, 150, yPos + 5, { align: 'right' });

    doc.save(`daily-collection-report-${reportFromDate}-to-${reportToDate}.pdf`);
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
        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('payments')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'payments'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Process Payments
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'reports'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Reports
            </button>
          </nav>
        </div>

        {/* Payments Tab Content */}
        {activeTab === 'payments' && (
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
          </>
        )}

        {/* Reports Tab Content */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Date Range Picker */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Daily Collection Report</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                  <input
                    type="date"
                    value={reportFromDate}
                    onChange={(e) => setReportFromDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    value={reportToDate}
                    onChange={(e) => setReportToDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={fetchReport}
                  disabled={reportLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {reportLoading ? 'Loading...' : 'Generate Report'}
                </button>
                {collectionsData.length > 0 && (
                  <button
                    onClick={exportToPDF}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Export to PDF
                  </button>
                )}
              </div>
            </div>

            {/* Collections Report Display */}
            {collectionsData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-bold mb-4">Collection Results</h3>
                {(() => {
                  // Sort by sacrament type then by date
                  const sortedData = [...collectionsData].sort((a, b) => {
                    const sacramentCompare = a.appointment.sacramentType.localeCompare(b.appointment.sacramentType);
                    if (sacramentCompare !== 0) return sacramentCompare;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                  });

                  // Group by date
                  const groupedByDate: { [key: string]: ReportPayment[] } = {};
                  sortedData.forEach((payment) => {
                    const date = new Date(payment.createdAt).toISOString().split('T')[0];
                    if (!groupedByDate[date]) {
                      groupedByDate[date] = [];
                    }
                    groupedByDate[date].push(payment);
                  });

                  let grandTotal = 0;
                  Object.values(groupedByDate).forEach((payments) => {
                    grandTotal += payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
                  });

                  return (
                    <>
                      {Object.entries(groupedByDate).map(([date, datePayments]) => {
                        const dateTotal = datePayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
                        return (
                          <div key={date} className="mb-6">
                            <h4 className="font-semibold text-gray-800 mb-2 bg-gray-100 p-2 rounded">
                              {formatDate(date)}
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receipt #</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {datePayments.map((payment) => (
                                    <tr key={payment.id}>
                                      <td className="px-4 py-2 text-sm">{payment.appointment.participantName}</td>
                                      <td className="px-4 py-2 text-sm">{payment.appointment.sacramentType}</td>
                                      <td className="px-4 py-2 text-sm">{payment.paymentMethod}</td>
                                      <td className="px-4 py-2 text-sm">{payment.receiptNumber}</td>
                                      <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(Math.abs(payment.amount))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-gray-50">
                                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-right">Subtotal:</td>
                                    <td className="px-4 py-2 text-sm font-semibold text-right">{formatCurrency(dateTotal)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                      <div className="border-t-2 border-gray-300 pt-4 mt-4">
                        <div className="flex justify-end">
                          <span className="text-lg font-bold">Grand Total: {formatCurrency(grandTotal)}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {collectionsData.length === 0 && reportFromDate && reportToDate && !reportLoading && (
              <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
                No collection data found for the selected date range.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
