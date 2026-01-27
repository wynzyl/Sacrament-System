// app/admin/page.tsx
// Admin dashboard - main navigation hub with all management features

'use client';

import { useState } from 'react';
import { useAutoLogout } from '@/lib/useAutoLogout';
import { useSession } from '@/lib/hooks/useSession';
import { PageHeader } from '@/components/PageHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { DashboardTab } from './_components/DashboardTab';
import { AppointmentsTab } from './_components/AppointmentsTab';
import { UsersTab } from './_components/UsersTab';
import { PriestsTab } from './_components/PriestsTab';
import { PaymentsTab } from './_components/PaymentsTab';
import { ReportsTab } from './_components/ReportsTab';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { useUsers } from '@/lib/hooks/useUsers';
import { usePayments } from '@/lib/hooks/usePayments';
import { AdminTabType } from '@/types';
import { useEffect } from 'react';

type TabType = AdminTabType;

const TABS: { id: TabType; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '\uD83D\uDCCA' },
  { id: 'appointments', label: 'Appointments', icon: '\uD83D\uDCC5' },
  { id: 'users', label: 'Users', icon: '\uD83D\uDC65' },
  { id: 'priests', label: 'Priests', icon: '\u26EA' },
  { id: 'payments', label: 'Payments', icon: '\uD83D\uDCB0' },
  { id: 'reports', label: 'Reports', icon: '\uD83D\uDCCB' },
];

export default function AdminDashboard() {
  useAutoLogout();
  const { user, loading: sessionLoading } = useSession({ requiredRole: 'ADMIN' });
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const { appointments, fetchAppointments } = useAppointments();
  const { users, fetchUsers } = useUsers();
  const { payments, summary, fetchTodayPayments } = usePayments();

  useEffect(() => {
    if (user) {
      fetchAppointments({ activeOnly: 'true' });
      fetchUsers();
      fetchTodayPayments();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => {
    fetchAppointments({ activeOnly: 'true' });
    fetchUsers();
    fetchTodayPayments();
  };

  if (sessionLoading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Admin Dashboard" user={user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
        {activeTab === 'dashboard' && (
          <DashboardTab
            appointments={appointments}
            allUsers={users}
            paymentSummary={summary}
            onNewAppointment={() => setActiveTab('appointments')}
            onNewUser={() => setActiveTab('users')}
          />
        )}
        {activeTab === 'appointments' && <AppointmentsTab initialAppointments={appointments} onDataChange={refreshAll} />}
        {activeTab === 'users' && <UsersTab currentUser={user} onDataChange={refreshAll} />}
        {activeTab === 'priests' && <PriestsTab onDataChange={refreshAll} />}
        {activeTab === 'payments' && <PaymentsTab initialPayments={payments} initialSummary={summary} />}
        {activeTab === 'reports' && <ReportsTab />}
      </div>
    </div>
  );
}
