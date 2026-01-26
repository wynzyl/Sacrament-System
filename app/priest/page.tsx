// app/priest/page.tsx
// Priest dashboard - view scheduled sacraments and mark as completed

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useAutoLogout } from '@/lib/useAutoLogout';

type TabType = 'appointments' | 'reports';

interface User {
  id: string;
  name: string;
  role: string;
}

interface Appointment {
  id: string;
  sacramentType: string;
  participantName: string;
  participantPhone: string | null;
  participantEmail: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  scheduledDate: string;
  scheduledTime: string;
  location: string | null;
  notes: string | null;
  status: string;
  fee: number;
  assignedPriestId: string | null;
  assignedPriest?: {
    id: string;
    name: string;
  } | null;
}

interface ReportAppointment {
  id: string;
  sacramentType: string;
  participantName: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string | null;
  notes: string | null;
  status: string;
  assignedPriest?: {
    name: string;
  } | null;
}

export default function PriestDashboard() {
  const router = useRouter();
  useAutoLogout(); // Auto logout after 2 minutes of inactivity
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Reports state
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportData, setReportData] = useState<ReportAppointment[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

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
        if (data.user.role !== 'PRIEST' && data.user.role !== 'ADMIN') {
          router.push('/');
          return;
        }

        setUser(data.user);
        fetchAppointments();
      } catch (error) {
        router.push('/');
      }
    };

    checkSession();
  }, [router]);

  const fetchAppointments = async () => {
    try {
      const response = await fetch('/api/appointments');
      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async (id: string) => {
    if (!confirm('Mark this sacrament as completed?')) return;

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      if (!response.ok) throw new Error('Failed to update');

      alert('Sacrament marked as completed!');
      fetchAppointments();
    } catch (error) {
      alert('Error updating appointment');
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

  // Fetch confirmed appointments report
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
        status: 'CONFIRMED',
      });

      const response = await fetch(`/api/reports/appointments?${params}`);
      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setReportLoading(false);
    }
  };

  // Export appointments to PDF
  const exportToPDF = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    await import('jspdf-autotable');

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Confirmed Appointments Report', 14, 22);

    doc.setFontSize(11);
    doc.text(`Date Range: ${reportFromDate} to ${reportToDate}`, 14, 32);
    doc.text(`Priest: Father ${user?.name}`, 14, 40);

    // Group by date
    const groupedByDate: { [key: string]: ReportAppointment[] } = {};
    reportData.forEach((apt) => {
      const date = new Date(apt.scheduledDate).toISOString().split('T')[0];
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(apt);
    });

    let yPos = 50;

    Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, dateAppointments]) => {
      // Date header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(formatDate(date), 14, yPos);
      yPos += 6;

      // Table for this date
      const tableData = dateAppointments.map((apt) => [
        apt.participantName,
        apt.sacramentType.replace('_', ' '),
        apt.scheduledTime,
        apt.location || '-',
        apt.notes || '-',
      ]);

      (doc as any).autoTable({
        startY: yPos,
        head: [['Participant', 'Sacrament', 'Time', 'Location', 'Notes']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        margin: { left: 14 },
        columnStyles: {
          4: { cellWidth: 50 }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Check for page break
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
    });

    doc.save(`priest-appointments-report-${reportFromDate}-to-${reportToDate}.pdf`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'CONFIRMED': return 'bg-blue-100 text-blue-800';
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSacramentIcon = (type: string) => {
    switch (type) {
      case 'BAPTISM': return '💧';
      case 'WEDDING': return '💒';
      case 'CONFIRMATION': return '✋';
      case 'FUNERAL': return '🕯️';
      case 'FIRST_COMMUNION': return '🍞';
      case 'ANOINTING_OF_SICK': return '🙏';
      case 'MASS_INTENTION': return '✝️';
      default: return '⛪';
    }
  };

  // API now returns only appointments assigned to this priest (server-side filtering)
  // Filter appointments based on status selection
  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return apt.status !== 'CANCELLED';
    return apt.status === filter;
  });

  // Get today's appointments
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.scheduledDate).toISOString().split('T')[0];
    return aptDate === today && apt.status !== 'CANCELLED';
  });

  // Get upcoming confirmed appointments
  const upcomingConfirmed = appointments.filter(apt =>
    apt.status === 'CONFIRMED' && new Date(apt.scheduledDate) >= new Date()
  );

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Priest Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, Father {user?.name}</p>
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
              onClick={() => setActiveTab('appointments')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'appointments'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Appointments
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

        {/* Appointments Tab Content */}
        {activeTab === 'appointments' && (
          <>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">My Appointments</h3>
            <p className="text-3xl font-bold text-purple-600">
              {appointments.filter(a => a.status !== 'CANCELLED').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Today</h3>
            <p className="text-3xl font-bold text-blue-600">{todayAppointments.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Upcoming Confirmed</h3>
            <p className="text-3xl font-bold text-green-600">{upcomingConfirmed.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Cancelled</h3>
            <p className="text-3xl font-bold text-red-600">
              {appointments.filter(a => a.status === 'CANCELLED').length}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {['all', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {status === 'all' ? 'All Active' : status}
            </button>
          ))}
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-bold">Scheduled Sacraments</h2>
          </div>

          {filteredAppointments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No appointments found
            </div>
          ) : (
            <div className="divide-y">
              {filteredAppointments.map((apt) => (
                <div key={apt.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{getSacramentIcon(apt.sacramentType)}</div>
                      <div>
                        <h3 className="font-semibold text-lg">{apt.participantName}</h3>
                        <p className="text-gray-600">{apt.sacramentType.replace('_', ' ')}</p>
                        <div className="mt-2 text-sm text-gray-500 space-y-1">
                          <p>📅 {formatDate(apt.scheduledDate)} at {apt.scheduledTime}</p>
                          {apt.location && <p>📍 {apt.location}</p>}
                          {apt.barangay && (
                            <p>🏠 {apt.barangay}, {apt.city}, {apt.province}</p>
                          )}
                          {apt.participantPhone && <p>📞 {apt.participantPhone}</p>}
                          {apt.notes && <p className="italic">Note: {apt.notes}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 text-sm rounded-full ${getStatusColor(apt.status)}`}>
                        {apt.status}
                      </span>
                      <p className="mt-2 text-sm text-gray-500">{formatCurrency(apt.fee)}</p>
                      {apt.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleMarkCompleted(apt.id)}
                          className="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {/* Reports Tab Content */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Date Range Picker */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Confirmed Appointments Report</h2>
              {/* Quick Date Presets */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quick Select</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const today = new Date();
                      const dateStr = today.toISOString().split('T')[0];
                      setReportFromDate(dateStr);
                      setReportToDate(dateStr);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const dayOfWeek = today.getDay();
                      const startOfWeek = new Date(today);
                      startOfWeek.setDate(today.getDate() - dayOfWeek);
                      const endOfWeek = new Date(startOfWeek);
                      endOfWeek.setDate(startOfWeek.getDate() + 6);
                      setReportFromDate(startOfWeek.toISOString().split('T')[0]);
                      setReportToDate(endOfWeek.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                      setReportFromDate(startOfMonth.toISOString().split('T')[0]);
                      setReportToDate(endOfMonth.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                      setReportFromDate(startOfLastMonth.toISOString().split('T')[0]);
                      setReportToDate(endOfLastMonth.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    Last Month
                  </button>
                </div>
              </div>
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
                {reportData.length > 0 && (
                  <button
                    onClick={exportToPDF}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Export to PDF
                  </button>
                )}
              </div>
            </div>

            {/* Appointments Report Display */}
            {reportData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-bold mb-4">Appointments Results</h3>
                {(() => {
                  // Group by date
                  const groupedByDate: { [key: string]: ReportAppointment[] } = {};
                  reportData.forEach((apt) => {
                    const date = new Date(apt.scheduledDate).toISOString().split('T')[0];
                    if (!groupedByDate[date]) {
                      groupedByDate[date] = [];
                    }
                    groupedByDate[date].push(apt);
                  });

                  return (
                    <>
                      {Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateAppointments]) => (
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
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {dateAppointments.map((apt) => (
                                  <tr key={apt.id}>
                                    <td className="px-4 py-2 text-sm">{apt.participantName}</td>
                                    <td className="px-4 py-2 text-sm">{apt.sacramentType.replace('_', ' ')}</td>
                                    <td className="px-4 py-2 text-sm">{apt.scheduledTime}</td>
                                    <td className="px-4 py-2 text-sm">{apt.location || '-'}</td>
                                    <td className="px-4 py-2 text-sm">{apt.notes || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      <div className="border-t-2 border-gray-300 pt-4 mt-4">
                        <div className="flex justify-end">
                          <span className="text-lg font-bold">Total Appointments: {reportData.length}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {reportData.length === 0 && reportFromDate && reportToDate && !reportLoading && (
              <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
                No confirmed appointments found for the selected date range.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
