'use client';

import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { Appointment, User, PaymentSummary } from '@/types';

interface DashboardTabProps {
  appointments: Appointment[];
  allUsers: User[];
  paymentSummary: PaymentSummary;
  onNewAppointment: () => void;
  onNewUser: () => void;
}

export function DashboardTab({ appointments, allUsers, paymentSummary, onNewAppointment, onNewUser }: DashboardTabProps) {
  const router = useRouter();
  const pendingCount = appointments.filter(a => a.status === 'PENDING').length;
  const confirmedCount = appointments.filter(a => a.status === 'CONFIRMED').length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Overview</h2>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Today&apos;s Cash</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(paymentSummary.cash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Today&apos;s GCash</h3>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(paymentSummary.gcash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Today&apos;s Total</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(paymentSummary.total)}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-4">
          <button onClick={onNewAppointment} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            + New Appointment
          </button>
          <button onClick={onNewUser} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
            + Add User
          </button>
          <button onClick={() => router.push('/cashier')} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Go to Cashier
          </button>
        </div>
      </div>
    </div>
  );
}
