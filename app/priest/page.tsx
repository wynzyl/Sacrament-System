// app/priest/page.tsx
// Priest dashboard - view scheduled sacraments and mark as completed

'use client';

import { useState } from 'react';
import { useAutoLogout } from '@/lib/useAutoLogout';
import { useSession } from '@/lib/hooks/useSession';
import { PageHeader } from '@/components/PageHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AppointmentsList } from './_components/AppointmentsList';
import { PriestReports } from './_components/PriestReports';
import { PriestTabType } from '@/types';

type TabType = PriestTabType;

export default function PriestDashboard() {
  useAutoLogout();
  const { user, loading } = useSession({ requiredRole: ['PRIEST', 'ADMIN'] });
  const [activeTab, setActiveTab] = useState<TabType>('appointments');

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Priest Dashboard" user={user} welcomePrefix="Welcome, Father" />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {(['appointments', 'reports'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'appointments' ? 'Appointments' : 'Reports'}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'appointments' && <AppointmentsList />}
        {activeTab === 'reports' && <PriestReports user={user} />}
      </div>
    </div>
  );
}
