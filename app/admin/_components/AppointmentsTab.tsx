'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { usePriests } from '@/lib/hooks/usePriests';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { AppointmentForm } from './AppointmentForm';
import { Appointment, AppointmentFormData, AppointmentRequirementItem } from '@/types';
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils';
import { SACRAMENT_ORDER, SACRAMENT_LABELS, DEFAULT_APPOINTMENT_FORM } from '@/lib/constants';
import { isTerminal } from '@/lib/appointments/stateMachine';

interface AppointmentsTabProps {
  initialAppointments?: Appointment[];
  onDataChange?: () => void;
}

export function AppointmentsTab({ initialAppointments, onDataChange }: AppointmentsTabProps) {
  const {
    appointments,
    fetchAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    fetchRequirements,
    toggleRequirement,
  } = useAppointments();
  const { priests, availablePriests, fetchPriests } = usePriests();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialEditStatus, setInitialEditStatus] = useState<string>('PENDING');
  const [form, setForm] = useState<AppointmentFormData>({ ...DEFAULT_APPOINTMENT_FORM });

  // Cancel modal state (FR-5.6)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [paymentDisposition, setPaymentDisposition] = useState<'REFUND' | 'FORFEIT'>('REFUND');
  const [cancelling, setCancelling] = useState(false);

  // Requirements checklist modal state (FR-7.3, FR-7.4)
  const [checklistTarget, setChecklistTarget] = useState<Appointment | null>(null);
  const [checklistItems, setChecklistItems] = useState<AppointmentRequirementItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sacramentFilter, setSacramentFilter] = useState('all');
  const [sortField, setSortField] = useState<'date' | 'name' | 'type'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchAppointments();
    fetchPriests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = appointments.length > 0 ? appointments : initialAppointments || [];

  const resetForm = () => {
    setEditingId(null);
    setInitialEditStatus('PENDING');
    setForm({ ...DEFAULT_APPOINTMENT_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateAppointment(editingId, form as unknown as Record<string, unknown>);
        alert('Appointment updated!');
      } else {
        await createAppointment(form as unknown as Record<string, unknown>);
        alert('Appointment created!');
      }
      setShowModal(false);
      resetForm();
      fetchAppointments();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error saving appointment');
    }
  };

  const handleEdit = (apt: Appointment) => {
    setEditingId(apt.id);
    setInitialEditStatus(apt.status);
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

  const openCancelModal = (apt: Appointment) => {
    setCancelTarget(apt);
    setCancelReason('');
    setPaymentDisposition('REFUND');
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const hasPaid = (cancelTarget.amountPaid ?? 0) > 0;
      const res = await cancelAppointment(cancelTarget.id, {
        reason: cancelReason,
        ...(hasPaid ? { paymentDisposition } : {}),
      });
      const refundNote = res.refunded > 0 ? ` (${formatCurrency(res.refunded)} reversed)` : '';
      alert(`Appointment cancelled${refundNote}.`);
      setCancelTarget(null);
      fetchAppointments();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error cancelling appointment');
    } finally {
      setCancelling(false);
    }
  };

  const openChecklistModal = async (apt: Appointment) => {
    setChecklistTarget(apt);
    setChecklistLoading(true);
    try {
      const rows = await fetchRequirements(apt.id);
      setChecklistItems(rows);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to load checklist');
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleToggleChecklist = async (item: AppointmentRequirementItem) => {
    if (!checklistTarget) return;
    try {
      const updated = await toggleRequirement(checklistTarget.id, item.key, !item.isMet);
      setChecklistItems((prev) => prev.map((r) => (r.key === item.key ? updated : r)));
      fetchAppointments();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update requirement');
    }
  };

  // Apply filters
  const filtered = data.filter((apt) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchesName = apt.participantName.toLowerCase().includes(q);
      const matchesRef = (apt.referenceNumber ?? '').toLowerCase().includes(q);
      if (!matchesName && !matchesRef) return false;
    }
    if (dateFrom && new Date(apt.scheduledDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(apt.scheduledDate) > new Date(dateTo + 'T23:59:59')) return false;
    if (statusFilter !== 'all' && apt.status !== statusFilter) return false;
    if (sacramentFilter !== 'all' && apt.sacramentType !== sacramentFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'date':
        cmp = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
        break;
      case 'name':
        cmp = a.participantName.localeCompare(b.participantName);
        break;
      case 'type':
        cmp = a.sacramentType.localeCompare(b.sacramentType);
        break;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const grouped = sorted.reduce(
    (acc, apt) => {
      if (!acc[apt.sacramentType]) acc[apt.sacramentType] = [];
      acc[apt.sacramentType].push(apt);
      return acc;
    },
    {} as Record<string, Appointment[]>
  );

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setSacramentFilter('all');
    setSortField('date');
    setSortDirection('asc');
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-bold">
          {statusFilter === 'all' ? 'All' : statusFilter} Appointments
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + New Appointment
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Name or Reference #
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name or SAC-2026-..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
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
            <select
              value={sacramentFilter}
              onChange={(e) => setSacramentFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
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
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as 'date' | 'name' | 'type')}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="type">Sacrament</option>
              </select>
              <button
                onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="px-3 py-2 border rounded-lg hover:bg-gray-100"
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDirection === 'asc' ? '\u2191' : '\u2193'}
              </button>
            </div>
          </div>
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-100"
          >
            Clear Filters
          </button>
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
        SACRAMENT_ORDER.filter((type) => grouped[type] && grouped[type].length > 0).map(
          (sacramentType) => (
            <div key={sacramentType} className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {SACRAMENT_LABELS[sacramentType]} ({grouped[sacramentType].length})
                </span>
              </h3>
              <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Participant & Ref
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Schedule
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Assigned Priest
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Fee / Paid
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Requirements
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {grouped[sacramentType].map((apt) => {
                      const reqMet = apt.requirementsMet ?? 0;
                      const reqTotal = apt.requirementsTotal ?? 0;
                      const allMet = reqTotal > 0 && reqMet === reqTotal;
                      return (
                        <tr key={apt.id}>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {apt.participantName}
                            </div>
                            <div className="text-xs text-gray-500">{apt.participantPhone}</div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {apt.referenceNumber && (
                                <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                  {apt.referenceNumber}
                                </span>
                              )}
                              {apt.source === 'ONLINE' && (
                                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-medium">
                                  ONLINE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {formatDate(apt.scheduledDate)}
                            </div>
                            <div className="text-sm text-gray-500">{apt.scheduledTime}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {apt.assignedPriest?.name || (
                              <span className="text-gray-400">Not assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div>{formatCurrency(apt.fee)}</div>
                            {(apt.amountPaid ?? 0) > 0 && (
                              <div className="text-xs text-green-700">
                                Paid: {formatCurrency(apt.amountPaid ?? 0)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <button
                              type="button"
                              onClick={() => openChecklistModal(apt)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                allMet
                                  ? 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              {reqMet}/{reqTotal} requirements met
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={apt.status} />
                            {apt.cancelReason && (
                              <div className="text-xs text-red-600 mt-1 max-w-[160px] truncate" title={apt.cancelReason}>
                                {apt.cancelReason}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm space-x-2 whitespace-nowrap">
                            {apt.referenceNumber && (
                              <Link
                                href={`/pass/${encodeURIComponent(apt.referenceNumber)}`}
                                className="text-emerald-700 hover:text-emerald-900 font-semibold"
                              >
                                Pass / OR
                              </Link>
                            )}
                            <button
                              onClick={() => handleEdit(apt)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                            {!isTerminal(apt.status) && (
                              <button
                                onClick={() => openCancelModal(apt)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )
      )}

      {/* Create / Edit Appointment Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editingId ? 'Edit Appointment' : 'New Appointment'}
      >
        <AppointmentForm
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowModal(false);
            resetForm();
          }}
          isEditing={!!editingId}
          initialStatus={initialEditStatus}
          availablePriests={availablePriests}
          allPriests={priests}
        />
      </Modal>

      {/* Cancel Appointment Modal (FR-5.6) */}
      <Modal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Appointment"
        maxWidth="max-w-md"
      >
        {cancelTarget && (
          <form onSubmit={handleConfirmCancel} className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <p className="font-semibold text-gray-900">{cancelTarget.participantName}</p>
              <p className="text-gray-600">
                {SACRAMENT_LABELS[cancelTarget.sacramentType]} —{' '}
                {formatDate(cancelTarget.scheduledDate)} at {cancelTarget.scheduledTime}
              </p>
              {cancelTarget.referenceNumber && (
                <p className="text-xs font-mono text-gray-500 mt-1">
                  Ref: {cancelTarget.referenceNumber}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Cancellation (required)
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
                minLength={3}
                rows={3}
                placeholder="Explain why this appointment is being cancelled..."
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {(cancelTarget.amountPaid ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-900">
                  {formatCurrency(cancelTarget.amountPaid ?? 0)} has been received for this appointment.
                </p>
                <p className="text-xs text-amber-800">
                  Choose how to record the payment disposition in the ledger and audit log:
                </p>
                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="radio"
                      name="paymentDisposition"
                      value="REFUND"
                      checked={paymentDisposition === 'REFUND'}
                      onChange={() => setPaymentDisposition('REFUND')}
                    />
                    <span>
                      <strong>Refund</strong> — write reversing ledger entries (RVS-...)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="radio"
                      name="paymentDisposition"
                      value="FORFEIT"
                      checked={paymentDisposition === 'FORFEIT'}
                      onChange={() => setPaymentDisposition('FORFEIT')}
                    />
                    <span>
                      <strong>Forfeit</strong> — retain payment (recorded in audit log)
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={cancelling || cancelReason.trim().length < 3}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Requirements Checklist Modal (FR-7.3) */}
      <Modal
        isOpen={!!checklistTarget}
        onClose={() => setChecklistTarget(null)}
        title="Sacrament Requirements Checklist"
        maxWidth="max-w-lg"
      >
        {checklistTarget && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="font-semibold text-blue-900">
                {checklistTarget.participantName} — {SACRAMENT_LABELS[checklistTarget.sacramentType]}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Tick each document or requirement once verified. Changes are recorded in the audit log.
              </p>
            </div>

            {checklistLoading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading checklist...</p>
            ) : checklistItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No requirements configured.</p>
            ) : (
              <ul className="divide-y divide-gray-200 border rounded-lg">
                {checklistItems.map((item) => (
                  <li key={item.key} className="p-3 flex items-start gap-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      id={`req-${item.key}`}
                      checked={item.isMet}
                      onChange={() => handleToggleChecklist(item)}
                      className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <label htmlFor={`req-${item.key}`} className="flex-1 text-sm cursor-pointer">
                      <span className={item.isMet ? 'line-through text-gray-500' : 'text-gray-900 font-medium'}>
                        {item.label}
                      </span>
                      {item.isMet && item.verifiedAt && (
                        <span className="block text-xs text-green-700 mt-0.5">
                          Verified {formatDateTime(item.verifiedAt)}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setChecklistTarget(null)}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
