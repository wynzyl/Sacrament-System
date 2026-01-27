'use client';

import { useState, useEffect } from 'react';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { usePriests } from '@/lib/hooks/usePriests';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { AppointmentForm } from './AppointmentForm';
import { Appointment, AppointmentFormData } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { SACRAMENT_ORDER, SACRAMENT_LABELS, DEFAULT_APPOINTMENT_FORM } from '@/lib/constants';

interface AppointmentsTabProps {
  initialAppointments?: Appointment[];
  onDataChange?: () => void;
}

export function AppointmentsTab({ initialAppointments, onDataChange }: AppointmentsTabProps) {
  const { appointments, loading: isAppointmentsLoading, fetchAppointments, createAppointment, updateAppointment, cancelAppointment } = useAppointments();
  const { availablePriests, fetchPriests } = usePriests();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AppointmentFormData>({ ...DEFAULT_APPOINTMENT_FORM });
  const [hasFetched, setHasFetched] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sacramentFilter, setSacramentFilter] = useState('all');
  const [sortField, setSortField] = useState<'date' | 'name' | 'type'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchAppointments({ activeOnly: 'true' }).then(() => setHasFetched(true));
    fetchPriests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = hasFetched ? appointments : (initialAppointments || []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_APPOINTMENT_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateAppointment(editingId, form);
        alert('Appointment updated!');
      } else {
        await createAppointment(form);
        alert('Appointment created!');
      }
      setShowModal(false);
      resetForm();
      fetchAppointments({ activeOnly: 'true' });
      onDataChange?.();
    } catch {
      alert('Error saving appointment');
    }
  };

  const handleEdit = (apt: Appointment) => {
    setEditingId(apt.id);
    setForm({
      sacramentType: apt.sacramentType,
      participantName: apt.participantName,
      participantPhone: apt.participantPhone || '',
      participantEmail: apt.participantEmail || '',
      barangay: apt.barangay || '',
      city: apt.city || 'Urdaneta City',
      province: apt.province || 'Pangasinan',
      scheduledDate: new Date(apt.scheduledDate).toISOString().split('T')[0],
      scheduledTime: apt.scheduledTime,
      location: apt.location || '',
      notes: apt.notes || '',
      fee: apt.fee.toString(),
      status: apt.status,
      assignedPriestId: apt.assignedPriestId || '',
    });
    setShowModal(true);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await cancelAppointment(id);
      alert('Appointment cancelled!');
      fetchAppointments({ activeOnly: 'true' });
      onDataChange?.();
    } catch {
      alert('Error cancelling appointment');
    }
  };

  // Apply filters
  const filtered = data.filter(apt => {
    if (searchTerm && !apt.participantName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (dateFrom && new Date(apt.scheduledDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(apt.scheduledDate) > new Date(dateTo + 'T23:59:59')) return false;
    if (statusFilter !== 'all' && apt.status !== statusFilter) return false;
    if (sacramentFilter !== 'all' && apt.sacramentType !== sacramentFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'date': cmp = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(); break;
      case 'name': cmp = a.participantName.localeCompare(b.participantName); break;
      case 'type': cmp = a.sacramentType.localeCompare(b.sacramentType); break;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const grouped = sorted.reduce((acc, apt) => {
    if (!acc[apt.sacramentType]) acc[apt.sacramentType] = [];
    acc[apt.sacramentType].push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const clearFilters = () => {
    setSearchTerm(''); setDateFrom(''); setDateTo('');
    setStatusFilter('all'); setSacramentFilter('all');
    setSortField('date'); setSortDirection('asc');
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-bold">All Appointments</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + New Appointment
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Participant</label>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Enter name..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sacrament Type</label>
            <select value={sacramentFilter} onChange={(e) => setSacramentFilter(e.target.value)} className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">All Types</option>
              <option value="BAPTISM">Baptism</option>
              <option value="WEDDING">Wedding</option>
              <option value="CONFIRMATION">Confirmation</option>
              <option value="FUNERAL">Funeral</option>
              <option value="FIRST_COMMUNION">First Communion</option>
              <option value="ANOINTING_OF_SICK">Anointing of Sick</option>
              <option value="MASS_INTENTION">Mass Intention</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <div className="flex gap-2">
              <select value={sortField} onChange={(e) => setSortField(e.target.value as any)} className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="type">Sacrament</option>
              </select>
              <button onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')} className="px-3 py-2 border rounded-lg hover:bg-gray-100" title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}>
                {sortDirection === 'asc' ? '\u2191' : '\u2193'}
              </button>
            </div>
          </div>
          <button onClick={clearFilters} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-100">Clear Filters</button>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Showing {filtered.length} of {data.length} appointments
      </div>

      {data.length === 0 ? (
        <EmptyState message="No appointments found" />
      ) : sorted.length === 0 ? (
        <EmptyState message="No appointments match your filters" />
      ) : (
        SACRAMENT_ORDER
          .filter(type => grouped[type] && grouped[type].length > 0)
          .map(sacramentType => (
            <div key={sacramentType} className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {SACRAMENT_LABELS[sacramentType]} ({grouped[sacramentType].length})
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
                        <td className="px-6 py-4"><StatusBadge status={apt.status} /></td>
                        <td className="px-6 py-4 text-sm space-x-2">
                          <button onClick={() => handleEdit(apt)} className="text-blue-600 hover:text-blue-900">Edit</button>
                          <button onClick={() => handleCancel(apt.id)} className="text-red-600 hover:text-red-900">Cancel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? 'Edit Appointment' : 'New Appointment'}>
        <AppointmentForm
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => { setShowModal(false); resetForm(); }}
          isEditing={!!editingId}
          availablePriests={availablePriests}
        />
      </Modal>
    </div>
  );
}
