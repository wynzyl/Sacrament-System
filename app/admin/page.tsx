// app/admin/page.tsx
// Admin dashboard - main navigation hub with all management features

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils';
import { useAutoLogout } from '@/lib/useAutoLogout';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  availability?: string;
  createdAt?: string;
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

// All barangays in Urdaneta City, Pangasinan
const URDANETA_BARANGAYS = [
  'Anonas',
  'Bactad East',
  'Bayaoas',
  'Bolaoen',
  'Cabaruan',
  'Cabuloan',
  'Camanang',
  'Camantiles',
  'Casantaan',
  'Catablan',
  'Cayambanan',
  'Consolacion',
  'Dilan Paurido',
  'Dr. Pedro T. Orata (Bactad Proper)',
  'Labit Proper',
  'Labit West',
  'Mabanogbog',
  'Macalong',
  'Nancalobasaan',
  'Nancamaliran East',
  'Nancamaliran West',
  'Nancayasan',
  'Oltama',
  'Palina East',
  'Palina West',
  'Pinmaludpod',
  'Poblacion',
  'San Jose',
  'San Vicente',
  'Santa Lucia',
  'Santo Domingo',
  'Sugcong',
  'Tipuso',
  'Tulong',
];

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
  processedBy: {
    name: string;
  };
}

type TabType = 'dashboard' | 'appointments' | 'users' | 'priests' | 'payments' | 'reports';

interface ReportAppointment {
  id: string;
  sacramentType: string;
  participantName: string;
  scheduledDate: string;
  scheduledTime: string;
  notes: string | null;
  assignedPriest?: { name: string } | null;
}

interface ReportPayment {
  id: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: string;
    scheduledDate: string;
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  useAutoLogout(); // Auto logout after 5 minutes of inactivity
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);

  // Appointments state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    sacramentType: 'BAPTISM',
    participantName: '',
    participantPhone: '',
    participantEmail: '',
    barangay: '',
    city: 'Urdaneta City',
    province: 'Pangasinan',
    scheduledDate: '',
    scheduledTime: '',
    location: 'Immaculate Conception Cathedral Parish',
    notes: '',
    fee: '',
    status: 'PENDING',
    assignedPriestId: '',
  });

  // Users state (all users)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
  });

  // Priests state (filtered from users)
  const [priests, setPriests] = useState<User[]>([]);
  const [showPriestModal, setShowPriestModal] = useState(false);
  const [editingPriestId, setEditingPriestId] = useState<string | null>(null);
  const [priestForm, setPriestForm] = useState({
    name: '',
    email: '',
    password: '',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
  });

  // Payments state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState({ cash: 0, gcash: 0, total: 0 });

  // Reports state
  const [reportType, setReportType] = useState<'appointments' | 'collections'>('appointments');
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportData, setReportData] = useState<ReportAppointment[] | null>(null);
  const [collectionsData, setCollectionsData] = useState<{ payments: ReportPayment[], totals: { cash: number, gcash: number, total: number } } | null>(null);
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
        if (data.user.role !== 'ADMIN') {
          router.push('/');
          return;
        }

        setUser(data.user);
        fetchAllData();
      } catch (error) {
        router.push('/');
      }
    };

    checkSession();
  }, [router]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchAppointments(),
      fetchAllUsers(),
      fetchPriests(),
      fetchPayments(),
    ]);
    setLoading(false);
  };

  const fetchAppointments = async () => {
    try {
      // Fetch only active appointments (today or earlier, not completed)
      const response = await fetch('/api/appointments?activeOnly=true');
      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      setAllUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchPriests = async () => {
    try {
      const response = await fetch('/api/users?role=PRIEST');
      const data = await response.json();
      setPriests(data);
    } catch (error) {
      console.error('Error fetching priests:', error);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/payments/today');
      const data = await response.json();
      setPayments(data.payments || []);
      setPaymentSummary(data.summary || { cash: 0, gcash: 0, total: 0 });
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  // Appointment handlers
  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingAppointmentId
      ? `/api/appointments/${editingAppointmentId}`
      : '/api/appointments';

    const method = editingAppointmentId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...appointmentForm,
          fee: parseFloat(appointmentForm.fee),
        }),
      });

      if (!response.ok) throw new Error('Failed to save appointment');

      alert(editingAppointmentId ? 'Appointment updated!' : 'Appointment created!');
      setShowAppointmentModal(false);
      resetAppointmentForm();
      fetchAppointments();
    } catch (error) {
      alert('Error saving appointment');
    }
  };

  const handleEditAppointment = (appointment: Appointment) => {
    setEditingAppointmentId(appointment.id);
    setAppointmentForm({
      sacramentType: appointment.sacramentType,
      participantName: appointment.participantName,
      participantPhone: appointment.participantPhone || '',
      participantEmail: appointment.participantEmail || '',
      barangay: appointment.barangay || '',
      city: appointment.city || 'Urdaneta City',
      province: appointment.province || 'Pangasinan',
      scheduledDate: new Date(appointment.scheduledDate).toISOString().split('T')[0],
      scheduledTime: appointment.scheduledTime,
      location: appointment.location || '',
      notes: appointment.notes || '',
      fee: appointment.fee.toString(),
      status: appointment.status,
      assignedPriestId: appointment.assignedPriestId || '',
    });
    setShowAppointmentModal(true);
  };

  const handleCancelAppointment = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      const response = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to cancel');
      alert('Appointment cancelled!');
      fetchAppointments();
    } catch (error) {
      alert('Error cancelling appointment');
    }
  };

  const resetAppointmentForm = () => {
    setEditingAppointmentId(null);
    setAppointmentForm({
      sacramentType: 'BAPTISM',
      participantName: '',
      participantPhone: '',
      participantEmail: '',
      barangay: '',
      city: 'Urdaneta City',
      province: 'Pangasinan',
      scheduledDate: '',
      scheduledTime: '',
      location: 'Immaculate Conception Cathedral Parish',
      notes: '',
      fee: '',
      status: 'PENDING',
      assignedPriestId: '',
    });
  };

  // User handlers (all users)
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingUserId
      ? `/api/users/${editingUserId}`
      : '/api/users';

    const method = editingUserId ? 'PUT' : 'POST';

    const body: any = {
      name: userForm.name,
      email: userForm.email,
      role: userForm.role,
      status: userForm.status,
      availability: userForm.availability,
    };

    if (userForm.password) {
      body.password = userForm.password;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      alert(editingUserId ? 'User updated!' : 'User created!');
      setShowUserModal(false);
      resetUserForm();
      fetchAllUsers();
      fetchPriests();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error saving user');
    }
  };

  const handleEditUser = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setUserForm({
      name: targetUser.name,
      email: targetUser.email,
      password: '',
      role: targetUser.role,
      status: targetUser.status || 'ACTIVE',
      availability: targetUser.availability || 'AVAILABLE',
    });
    setShowUserModal(true);
  };

  const handleToggleUserStatus = async (targetUser: User) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = newStatus === 'ACTIVE' ? 'activate' : 'deactivate';

    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const response = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${action} user`);
      }

      alert(`User ${action}d successfully!`);
      fetchAllUsers();
      fetchPriests();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Error ${action}ing user`);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({
      name: '',
      email: '',
      password: '',
      role: 'CASHIER',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    });
  };

  // Priest handlers
  const handlePriestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingPriestId
      ? `/api/users/${editingPriestId}`
      : '/api/users';

    const method = editingPriestId ? 'PUT' : 'POST';

    const body: any = {
      name: priestForm.name,
      email: priestForm.email,
      role: 'PRIEST',
      status: priestForm.status,
      availability: priestForm.availability,
    };

    if (priestForm.password) {
      body.password = priestForm.password;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save priest');
      }

      alert(editingPriestId ? 'Priest updated!' : 'Priest added!');
      setShowPriestModal(false);
      resetPriestForm();
      fetchPriests();
      fetchAllUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error saving priest');
    }
  };

  const handleEditPriest = (priest: User) => {
    setEditingPriestId(priest.id);
    setPriestForm({
      name: priest.name,
      email: priest.email,
      password: '',
      status: priest.status || 'ACTIVE',
      availability: priest.availability || 'AVAILABLE',
    });
    setShowPriestModal(true);
  };

  const handleTogglePriestStatus = async (priest: User) => {
    const newStatus = priest.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = newStatus === 'ACTIVE' ? 'activate' : 'deactivate';

    if (!confirm(`Are you sure you want to ${action} this priest?`)) return;

    try {
      const response = await fetch(`/api/users/${priest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${action} priest`);
      }

      alert(`Priest ${action}d successfully!`);
      fetchPriests();
      fetchAllUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Error ${action}ing priest`);
    }
  };

  const resetPriestForm = () => {
    setEditingPriestId(null);
    setPriestForm({
      name: '',
      email: '',
      password: '',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    });
  };

  // Get available priests for assignment (Active and Available only)
  const availablePriests = priests.filter(
    p => p.status === 'ACTIVE' && p.availability === 'AVAILABLE'
  );

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    router.push('/');
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800';
      case 'PRIEST': return 'bg-purple-100 text-purple-800';
      case 'CASHIER': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Report functions
  const fetchReport = async () => {
    if (!reportFromDate || !reportToDate) {
      alert('Please select both From and To dates');
      return;
    }

    setReportLoading(true);
    try {
      if (reportType === 'appointments') {
        const response = await fetch(`/api/reports/appointments?from=${reportFromDate}&to=${reportToDate}`);
        const data = await response.json();
        setReportData(data);
        setCollectionsData(null);
      } else {
        const response = await fetch(`/api/reports/collections?from=${reportFromDate}&to=${reportToDate}`);
        const data = await response.json();
        setCollectionsData(data);
        setReportData(null);
      }
    } catch (error) {
      alert('Failed to fetch report data');
    } finally {
      setReportLoading(false);
    }
  };

  const exportToPDF = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(16);
    doc.text('Immaculate Conception Cathedral Parish', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(reportType === 'appointments' ? 'Confirmed Appointments Report' : 'Collections Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Date Range: ${formatDate(reportFromDate)} - ${formatDate(reportToDate)}`, pageWidth / 2, 29, { align: 'center' });

    if (reportType === 'appointments' && reportData) {
      // Group by date
      const grouped = reportData.reduce((acc, apt) => {
        const date = formatDate(apt.scheduledDate);
        if (!acc[date]) acc[date] = [];
        acc[date].push(apt);
        return acc;
      }, {} as Record<string, ReportAppointment[]>);

      let startY = 38;
      Object.entries(grouped).forEach(([date, apts]) => {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(date, 14, startY);
        startY += 2;

        autoTable(doc, {
          startY: startY,
          head: [['Participant', 'Sacrament', 'Time', 'Priest', 'Notes']],
          body: apts.map(apt => [
            apt.participantName,
            apt.sacramentType.replace('_', ' '),
            apt.scheduledTime,
            apt.assignedPriest?.name || 'Not assigned',
            apt.notes || '-'
          ]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9 },
        });

        startY = (doc as any).lastAutoTable.finalY + 10;
      });
    } else if (reportType === 'collections' && collectionsData) {
      // Format amount without currency symbol
      const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-PH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      };

      // Group by date
      const grouped = collectionsData.payments.reduce((acc, payment) => {
        const date = formatDate(payment.createdAt);
        if (!acc[date]) acc[date] = [];
        acc[date].push(payment);
        return acc;
      }, {} as Record<string, ReportPayment[]>);

      // Sort each group by sacrament type
      Object.keys(grouped).forEach(date => {
        grouped[date].sort((a, b) =>
          a.appointment.sacramentType.localeCompare(b.appointment.sacramentType)
        );
      });

      let startY = 38;
      Object.entries(grouped).forEach(([date, payments]) => {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(date, 14, startY);
        startY += 2;

        autoTable(doc, {
          startY: startY,
          head: [['Participant', 'Sacrament', 'Amount', 'Method']],
          body: payments.map(p => [
            p.appointment.participantName,
            p.appointment.sacramentType.replace('_', ' '),
            formatAmount(p.amount),
            p.paymentMethod
          ]),
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9 },
          columnStyles: {
            2: { halign: 'right' },
          },
        });

        startY = (doc as any).lastAutoTable.finalY + 10;
      });

      // Totals
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', 14, startY);
      autoTable(doc, {
        startY: startY + 2,
        head: [['Cash', 'GCash', 'Total']],
        body: [[
          formatAmount(collectionsData.totals.cash),
          formatAmount(collectionsData.totals.gcash),
          formatAmount(collectionsData.totals.total)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [107, 114, 128] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 10, halign: 'right' },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 10);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }

    doc.save(`${reportType}-report-${reportFromDate}-to-${reportToDate}.pdf`);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  // Dashboard stats
  const pendingCount = appointments.filter(a => a.status === 'PENDING').length;
  const confirmedCount = appointments.filter(a => a.status === 'CONFIRMED').length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
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

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'appointments', label: 'Appointments', icon: '📅' },
              { id: 'users', label: 'Users', icon: '👥' },
              { id: 'priests', label: 'Priests', icon: '⛪' },
              { id: 'payments', label: 'Payments', icon: '💰' },
              { id: 'reports', label: 'Reports', icon: '📋' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h2 className="text-xl font-bold mb-6">Overview</h2>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Pending</h3>
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Confirmed</h3>
                <p className="text-3xl font-bold text-blue-600">{confirmedCount}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Completed</h3>
                <p className="text-3xl font-bold text-green-600">{completedCount}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
                <p className="text-3xl font-bold text-purple-600">{allUsers.length}</p>
              </div>
            </div>

            {/* Today's Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Today's Cash</h3>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(paymentSummary.cash)}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Today's GCash</h3>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(paymentSummary.gcash)}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Today's Total</h3>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(paymentSummary.total)}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => { setActiveTab('appointments'); resetAppointmentForm(); setShowAppointmentModal(true); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  + New Appointment
                </button>
                <button
                  onClick={() => { setActiveTab('users'); resetUserForm(); setShowUserModal(true); }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                >
                  + Add User
                </button>
                <button
                  onClick={() => router.push('/cashier')}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Go to Cashier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appointments Tab */}
        {activeTab === 'appointments' && (
          <div>
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">All Appointments</h2>
              <button
                onClick={() => { resetAppointmentForm(); setShowAppointmentModal(true); }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + New Appointment
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No appointments found
              </div>
            ) : (
              // Group appointments by sacrament type and sort by scheduled date
              (() => {
                const sacramentOrder = ['BAPTISM', 'WEDDING', 'CONFIRMATION', 'FUNERAL', 'FIRST_COMMUNION', 'ANOINTING_OF_SICK', 'MASS_INTENTION'];
                const sacramentLabels: Record<string, string> = {
                  'BAPTISM': 'Baptism',
                  'WEDDING': 'Wedding',
                  'CONFIRMATION': 'Confirmation',
                  'FUNERAL': 'Funeral',
                  'FIRST_COMMUNION': 'First Communion',
                  'ANOINTING_OF_SICK': 'Anointing of Sick',
                  'MASS_INTENTION': 'Mass Intention'
                };
                const grouped = appointments.reduce((acc, apt) => {
                  if (!acc[apt.sacramentType]) acc[apt.sacramentType] = [];
                  acc[apt.sacramentType].push(apt);
                  return acc;
                }, {} as Record<string, Appointment[]>);

                // Sort each group by scheduled date
                Object.keys(grouped).forEach(key => {
                  grouped[key].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
                });

                return sacramentOrder
                  .filter(type => grouped[type] && grouped[type].length > 0)
                  .map(sacramentType => (
                    <div key={sacramentType} className="mb-8">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                          {sacramentLabels[sacramentType]} ({grouped[sacramentType].length})
                        </span>
                      </h3>
                      <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned Priest</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {grouped[sacramentType].map((apt) => (
                              <tr key={apt.id}>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-gray-900">{apt.participantName}</div>
                                  <div className="text-sm text-gray-500">{apt.participantPhone}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm text-gray-900">{formatDate(apt.scheduledDate)}</div>
                                  <div className="text-sm text-gray-500">{apt.scheduledTime}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {apt.assignedPriest?.name || <span className="text-gray-400">Not assigned</span>}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(apt.fee)}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(apt.status)}`}>
                                    {apt.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm space-x-2">
                                  <button onClick={() => handleEditAppointment(apt)} className="text-blue-600 hover:text-blue-900">Edit</button>
                                  <button onClick={() => handleCancelAppointment(apt.id)} className="text-red-600 hover:text-red-900">Cancel</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ));
              })()
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">Manage Users</h2>
              <button
                onClick={() => { resetUserForm(); setShowUserModal(true); }}
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
              >
                + Add User
              </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allUsers.map((targetUser) => (
                    <tr key={targetUser.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{targetUser.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{targetUser.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded ${getRoleBadgeColor(targetUser.role)}`}>
                          {targetUser.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded ${
                          targetUser.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {targetUser.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        <button onClick={() => handleEditUser(targetUser)} className="text-blue-600 hover:text-blue-900">Edit</button>
                        {targetUser.id !== user?.id && (
                          <button
                            onClick={() => handleToggleUserStatus(targetUser)}
                            className={targetUser.status === 'ACTIVE' ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                          >
                            {targetUser.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allUsers.length === 0 && (
                <div className="text-center py-8 text-gray-500">No users found</div>
              )}
            </div>
          </div>
        )}

        {/* Priests Tab */}
        {activeTab === 'priests' && (
          <div>
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">Manage Priests</h2>
              <button
                onClick={() => { resetPriestForm(); setShowPriestModal(true); }}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
              >
                + Add Priest
              </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {priests.map((priest) => (
                    <tr key={priest.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{priest.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{priest.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded ${
                          priest.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {priest.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded ${
                          priest.availability === 'AVAILABLE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {priest.availability || 'AVAILABLE'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        <button onClick={() => handleEditPriest(priest)} className="text-blue-600 hover:text-blue-900">Edit</button>
                        <button
                          onClick={() => handleTogglePriestStatus(priest)}
                          className={priest.status === 'ACTIVE' ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {priest.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {priests.length === 0 && (
                <div className="text-center py-8 text-gray-500">No priests found</div>
              )}
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div>
            <h2 className="text-xl font-bold mb-6">Today's Payments</h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Cash Total</h3>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(paymentSummary.cash)}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">GCash Total</h3>
                <p className="text-3xl font-bold text-blue-600">{formatCurrency(paymentSummary.gcash)}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Overall Total</h3>
                <p className="text-3xl font-bold text-purple-600">{formatCurrency(paymentSummary.total)}</p>
              </div>
            </div>

            {/* Payments List */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Recent Payments</h3>
                <button
                  onClick={() => router.push('/cashier')}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Go to Cashier
                </button>
              </div>
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
                          <p className="text-xs text-gray-500">Processed by: {payment.processedBy.name}</p>
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
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            <h2 className="text-xl font-bold mb-6">Reports</h2>

            {/* Report Controls */}
            <div className="bg-white p-6 rounded-lg shadow mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium mb-1">Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => {
                      setReportType(e.target.value as 'appointments' | 'collections');
                      setReportData(null);
                      setCollectionsData(null);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="appointments">Confirmed Appointments</option>
                    <option value="collections">Collections</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">From Date</label>
                  <input
                    type="date"
                    value={reportFromDate}
                    onChange={(e) => setReportFromDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">To Date</label>
                  <input
                    type="date"
                    value={reportToDate}
                    onChange={(e) => setReportToDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fetchReport}
                    disabled={reportLoading}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {reportLoading ? 'Loading...' : 'Generate'}
                  </button>
                  {(reportData || collectionsData) && (
                    <button
                      onClick={exportToPDF}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                      Export PDF
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Appointments Report Preview */}
            {reportType === 'appointments' && reportData && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h3 className="text-lg font-bold">Confirmed Appointments Report</h3>
                  <p className="text-sm text-gray-600">{reportData.length} appointment(s) found</p>
                </div>
                {reportData.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No appointments found for the selected date range</div>
                ) : (
                  (() => {
                    const grouped = reportData.reduce((acc, apt) => {
                      const date = formatDate(apt.scheduledDate);
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(apt);
                      return acc;
                    }, {} as Record<string, ReportAppointment[]>);

                    return Object.entries(grouped).map(([date, apts]) => (
                      <div key={date} className="border-b last:border-b-0">
                        <div className="bg-blue-50 px-6 py-2 font-semibold text-blue-800">{date}</div>
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priest</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {apts.map((apt) => (
                              <tr key={apt.id}>
                                <td className="px-6 py-3 text-sm">{apt.participantName}</td>
                                <td className="px-6 py-3 text-sm">{apt.sacramentType.replace('_', ' ')}</td>
                                <td className="px-6 py-3 text-sm">{apt.scheduledTime}</td>
                                <td className="px-6 py-3 text-sm">{apt.assignedPriest?.name || 'Not assigned'}</td>
                                <td className="px-6 py-3 text-sm text-gray-500">{apt.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()
                )}
              </div>
            )}

            {/* Collections Report Preview */}
            {reportType === 'collections' && collectionsData && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h3 className="text-lg font-bold">Collections Report</h3>
                  <p className="text-sm text-gray-600">{collectionsData.payments.length} payment(s) found</p>
                </div>

                {/* Totals Summary */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-100 border-b">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Cash</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(collectionsData.totals.cash)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">GCash</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(collectionsData.totals.gcash)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="text-xl font-bold text-purple-600">{formatCurrency(collectionsData.totals.total)}</p>
                  </div>
                </div>

                {collectionsData.payments.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No payments found for the selected date range</div>
                ) : (
                  (() => {
                    const grouped = collectionsData.payments.reduce((acc, payment) => {
                      const date = formatDate(payment.createdAt);
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(payment);
                      return acc;
                    }, {} as Record<string, ReportPayment[]>);

                    // Sort each group by sacrament type
                    Object.keys(grouped).forEach(date => {
                      grouped[date].sort((a, b) =>
                        a.appointment.sacramentType.localeCompare(b.appointment.sacramentType)
                      );
                    });

                    return Object.entries(grouped).map(([date, payments]) => (
                      <div key={date} className="border-b last:border-b-0">
                        <div className="bg-green-50 px-6 py-2 font-semibold text-green-800">{date}</div>
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                              <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {payments.map((p) => (
                              <tr key={p.id}>
                                <td className="px-6 py-3 text-sm">{p.appointment.participantName}</td>
                                <td className="px-6 py-3 text-sm">{p.appointment.sacramentType.replace('_', ' ')}</td>
                                <td className="px-6 py-3 text-sm font-semibold text-green-600 text-right">{formatCurrency(p.amount)}</td>
                                <td className="px-6 py-3 text-sm">{p.paymentMethod}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingAppointmentId ? 'Edit Appointment' : 'New Appointment'}
            </h2>
            <form onSubmit={handleAppointmentSubmit} className="space-y-4">
              <div className={editingAppointmentId ? "grid grid-cols-2 gap-4" : ""}>
                <div>
                  <label className="block text-sm font-medium mb-1">Sacrament Type</label>
                  <select
                    value={appointmentForm.sacramentType}
                    onChange={(e) => setAppointmentForm({...appointmentForm, sacramentType: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="BAPTISM">Baptism</option>
                    <option value="WEDDING">Wedding</option>
                    <option value="CONFIRMATION">Confirmation</option>
                    <option value="FUNERAL">Funeral</option>
                    <option value="FIRST_COMMUNION">First Communion</option>
                    <option value="ANOINTING_OF_SICK">Anointing of Sick</option>
                    <option value="MASS_INTENTION">Mass Intention</option>
                  </select>
                </div>
                {editingAppointmentId && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={appointmentForm.status}
                      onChange={(e) => setAppointmentForm({...appointmentForm, status: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Assigned Priest */}
              <div>
                <label className="block text-sm font-medium mb-1">Assign Priest</label>
                <select
                  value={appointmentForm.assignedPriestId}
                  onChange={(e) => setAppointmentForm({...appointmentForm, assignedPriestId: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select a Priest (Optional)</option>
                  {availablePriests.map((priest) => (
                    <option key={priest.id} value={priest.id}>
                      {priest.name}
                    </option>
                  ))}
                </select>
                {availablePriests.length === 0 && (
                  <p className="text-sm text-orange-600 mt-1">No priests currently available</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Participant Name</label>
                <input
                  type="text"
                  value={appointmentForm.participantName}
                  onChange={(e) => setAppointmentForm({...appointmentForm, participantName: e.target.value})}
                  required
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={appointmentForm.participantPhone}
                    onChange={(e) => setAppointmentForm({...appointmentForm, participantPhone: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={appointmentForm.participantEmail}
                    onChange={(e) => setAppointmentForm({...appointmentForm, participantEmail: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              {/* Address Fields */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Barangay</label>
                  <select
                    value={appointmentForm.barangay}
                    onChange={(e) => setAppointmentForm({...appointmentForm, barangay: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select Barangay</option>
                    {URDANETA_BARANGAYS.map((brgy) => (
                      <option key={brgy} value={brgy}>{brgy}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">City/Municipality</label>
                  <input
                    type="text"
                    value={appointmentForm.city}
                    onChange={(e) => setAppointmentForm({...appointmentForm, city: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-100"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Province</label>
                  <input
                    type="text"
                    value={appointmentForm.province}
                    onChange={(e) => setAppointmentForm({...appointmentForm, province: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-100"
                    readOnly
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={appointmentForm.scheduledDate}
                    onChange={(e) => setAppointmentForm({...appointmentForm, scheduledDate: e.target.value})}
                    required
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time</label>
                  <input
                    type="time"
                    value={appointmentForm.scheduledTime}
                    onChange={(e) => setAppointmentForm({...appointmentForm, scheduledTime: e.target.value})}
                    required
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input
                  type="text"
                  value={appointmentForm.location}
                  onChange={(e) => setAppointmentForm({...appointmentForm, location: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fee (PHP)</label>
                <input
                  type="number"
                  value={appointmentForm.fee}
                  onChange={(e) => setAppointmentForm({...appointmentForm, fee: e.target.value})}
                  required
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowAppointmentModal(false); resetAppointmentForm(); }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingAppointmentId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingUserId ? 'Edit User' : 'Add User'}
            </h2>
            <form onSubmit={handleUserSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  required
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  required
                  placeholder="user@church.com"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Password {editingUserId && <span className="text-gray-500">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  required={!editingUserId}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="PRIEST">Priest</option>
                  <option value="CASHIER">Cashier</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={userForm.status}
                    onChange={(e) => setUserForm({...userForm, status: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                {userForm.role === 'PRIEST' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Availability</label>
                    <select
                      value={userForm.availability}
                      onChange={(e) => setUserForm({...userForm, availability: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="DAYOFF">Day Off</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowUserModal(false); resetUserForm(); }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  {editingUserId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Priest Modal */}
      {showPriestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingPriestId ? 'Edit Priest' : 'Add Priest'}
            </h2>
            <form onSubmit={handlePriestSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={priestForm.name}
                  onChange={(e) => setPriestForm({...priestForm, name: e.target.value})}
                  required
                  placeholder="Fr. John Smith"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={priestForm.email}
                  onChange={(e) => setPriestForm({...priestForm, email: e.target.value})}
                  required
                  placeholder="priest@church.com"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Password {editingPriestId && <span className="text-gray-500">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={priestForm.password}
                  onChange={(e) => setPriestForm({...priestForm, password: e.target.value})}
                  required={!editingPriestId}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={priestForm.status}
                    onChange={(e) => setPriestForm({...priestForm, status: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Availability</label>
                  <select
                    value={priestForm.availability}
                    onChange={(e) => setPriestForm({...priestForm, availability: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="DAYOFF">Day Off</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowPriestModal(false); resetPriestForm(); }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  {editingPriestId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
