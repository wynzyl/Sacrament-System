// app/priest/page.tsx
// Priest dashboard - view scheduled sacraments and mark as completed

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatCurrency } from '@/lib/utils';

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

export default function PriestDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('mine');

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
      default: return '⛪';
    }
  };

  // Get appointments assigned to this priest
  const myAppointments = appointments.filter(apt => apt.assignedPriestId === user?.id);

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'mine') return apt.assignedPriestId === user?.id && apt.status !== 'CANCELLED';
    if (filter === 'all') return apt.status !== 'CANCELLED';
    return apt.status === filter;
  });

  // Get today's appointments (assigned to this priest)
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = myAppointments.filter(apt => {
    const aptDate = new Date(apt.scheduledDate).toISOString().split('T')[0];
    return aptDate === today && apt.status !== 'CANCELLED';
  });

  // Get upcoming confirmed appointments (assigned to this priest)
  const upcomingConfirmed = myAppointments.filter(apt =>
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
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">My Appointments</h3>
            <p className="text-3xl font-bold text-purple-600">
              {myAppointments.filter(a => a.status !== 'CANCELLED').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Today (Assigned)</h3>
            <p className="text-3xl font-bold text-blue-600">{todayAppointments.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Upcoming Confirmed</h3>
            <p className="text-3xl font-bold text-green-600">{upcomingConfirmed.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">All Scheduled</h3>
            <p className="text-3xl font-bold text-gray-600">
              {appointments.filter(a => a.status !== 'CANCELLED').length}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {['mine', 'all', 'PENDING', 'CONFIRMED', 'COMPLETED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {status === 'mine' ? 'My Appointments' : status === 'all' ? 'All Active' : status}
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
      </div>
    </div>
  );
}
