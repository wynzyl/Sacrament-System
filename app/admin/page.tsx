// app/admin/page.tsx
// Admin dashboard - main navigation hub with all management features

'use client';

import { useState, useEffect } from 'react';
import { useAutoLogout } from '@/lib/useAutoLogout';
import { useSession } from '@/lib/hooks/useSession';
import { PageHeader } from '@/components/PageHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { CalendarView } from '@/components/CalendarView';
import { DashboardTab } from './_components/DashboardTab';
import { AppointmentsTab } from './_components/AppointmentsTab';
import { UsersTab } from './_components/UsersTab';
import { PriestsTab } from './_components/PriestsTab';
import { PaymentsTab } from './_components/PaymentsTab';
import { ReportsTab } from './_components/ReportsTab';
import { NotificationsOutboxTab } from './_components/NotificationsOutboxTab';
import { AuditLogTab } from './_components/AuditLogTab';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { useUsers } from '@/lib/hooks/useUsers';
import { usePayments } from '@/lib/hooks/usePayments';
import { AdminTabType } from '@/types';

type TabType = AdminTabType;

const TABS: { id: TabType; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '\uD83D\uDCCA' },
  { id: 'appointments', label: 'Appointments', icon: '\uD83D\uDCC5' },
  { id: 'calendar', label: 'Calendar', icon: '\uD83D\uDDD3\uFE0F' },
  { id: 'users', label: 'Users', icon: '\uD83D\uDC65' },
  { id: 'priests', label: 'Priests', icon: '\u26EA' },
  { id: 'payments', label: 'Payments', icon: '\uD83D\uDCB0' },
  { id: 'reports', label: 'Reports', icon: '\uD83D\uDCCB' },
  { id: 'notifications', label: 'Email Outbox', icon: '\u2709\uFE0F' },
  { id: 'audit', label: 'Audit Log', icon: '\uD83D\uDEE1\uFE0F' },
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
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
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
        {activeTab === 'appointments' && (
          <AppointmentsTab initialAppointments={appointments} onDataChange={refreshAll} />
        )}
        {activeTab === 'calendar' && (
          <CalendarView showPriest onSelectAppointment={() => setActiveTab('appointments')} />
        )}
        {activeTab === 'users' && <UsersTab currentUser={user} onDataChange={refreshAll} />}
        {activeTab === 'priests' && <PriestsTab onDataChange={refreshAll} />}
        {activeTab === 'payments' && (
          <PaymentsTab
            initialPayments={payments}
            initialSummary={summary}
            onDataChange={refreshAll}
          />
        )}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'notifications' && (
          <NotificationsOutboxTab appointments={appointments} />
        )}
        {activeTab === 'audit' && <AuditLogTab />}
      </div>
    </div>
  );
}
