'use client';

import { User, AppointmentFormData } from '@/types';
import { URDANETA_BARANGAYS } from '@/lib/constants';

interface AppointmentFormProps {
  form: AppointmentFormData;
  onChange: (form: AppointmentFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
  availablePriests: User[];
}

export function AppointmentForm({ form, onChange, onSubmit, onCancel, isEditing, availablePriests }: AppointmentFormProps) {
  const set = (field: keyof AppointmentFormData, value: string) => onChange({ ...form, [field]: value });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={isEditing ? "grid grid-cols-2 gap-4" : ""}>
        <div>
          <label className="block text-sm font-medium mb-1">Sacrament Type</label>
          <select value={form.sacramentType} onChange={(e) => set('sacramentType', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
            <option value="BAPTISM">Baptism</option>
            <option value="WEDDING">Wedding</option>
            <option value="CONFIRMATION">Confirmation</option>
            <option value="FUNERAL">Funeral</option>
            <option value="FIRST_COMMUNION">First Communion</option>
            <option value="ANOINTING_OF_SICK">Anointing of Sick</option>
            <option value="MASS_INTENTION">Mass Intention</option>
          </select>
        </div>
        {isEditing && (
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Assign Priest</label>
        <select value={form.assignedPriestId} onChange={(e) => set('assignedPriestId', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
          <option value="">Select a Priest (Optional)</option>
          {availablePriests.map((priest) => (
            <option key={priest.id} value={priest.id}>{priest.name}</option>
          ))}
        </select>
        {availablePriests.length === 0 && (
          <p className="text-sm text-orange-600 mt-1">No priests currently available</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Participant Name</label>
        <input type="text" value={form.participantName} onChange={(e) => set('participantName', e.target.value)} required className="w-full px-3 py-2 border rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input type="tel" value={form.participantPhone} onChange={(e) => set('participantPhone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" value={form.participantEmail} onChange={(e) => set('participantEmail', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Barangay</label>
          <select value={form.barangay} onChange={(e) => set('barangay', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Select Barangay</option>
            {URDANETA_BARANGAYS.map((brgy) => (
              <option key={brgy} value={brgy}>{brgy}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">City/Municipality</label>
          <input type="text" value={form.city} readOnly className="w-full px-3 py-2 border rounded-lg bg-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Province</label>
          <input type="text" value={form.province} readOnly className="w-full px-3 py-2 border rounded-lg bg-gray-100" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} required className="w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Time</label>
          <input type="time" value={form.scheduledTime} onChange={(e) => set('scheduledTime', e.target.value)} required className="w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location</label>
        <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Fee (PHP)</label>
        <input type="number" value={form.fee} onChange={(e) => set('fee', e.target.value)} required step="0.01" className="w-full px-3 py-2 border rounded-lg" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg" />
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {isEditing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
