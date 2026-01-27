'use client';

import { useState, useEffect } from 'react';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Appointment } from '@/types';
import { SACRAMENT_ICONS } from '@/lib/constants';

export function AppointmentsList() {
  const { appointments, fetchAppointments, updateAppointment } = useAppointments();
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchAppointments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkCompleted = async (id: string) => {
    if (!confirm('Mark this sacrament as completed?')) return;
    try {
      await updateAppointment(id, { status: 'COMPLETED' });
      alert('Sacrament marked as completed!');
      fetchAppointments();
    } catch {
      alert('Error updating appointment');
    }
  };

  const getSacramentIcon = (type: string) => SACRAMENT_ICONS[type] || '\u26EA';

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return apt.status !== 'CANCELLED';
    return apt.status === filter;
  });

  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.scheduledDate).toISOString().split('T')[0];
    return aptDate === today && apt.status !== 'CANCELLED';
  });

  const upcomingConfirmed = appointments.filter(apt =>
    apt.status === 'CONFIRMED' && new Date(apt.scheduledDate) >= new Date()
  );

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">My Appointments</h3>
          <p className="text-3xl font-bold text-purple-600">{appointments.filter(a => a.status !== 'CANCELLED').length}</p>
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
          <p className="text-3xl font-bold text-red-600">{appointments.filter(a => a.status === 'CANCELLED').length}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {['all', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded ${filter === status ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
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
          <div className="p-6 text-center text-gray-500">No appointments found</div>
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
                        <p>{'\uD83D\uDCC5'} {formatDate(apt.scheduledDate)} at {apt.scheduledTime}</p>
                        {apt.location && <p>{'\uD83D\uDCCD'} {apt.location}</p>}
                        {apt.barangay && <p>{'\uD83C\uDFE0'} {apt.barangay}, {apt.city}, {apt.province}</p>}
                        {apt.participantPhone && <p>{'\uD83D\uDCDE'} {apt.participantPhone}</p>}
                        {apt.notes && <p className="italic">Note: {apt.notes}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={apt.status} />
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
  );
}
