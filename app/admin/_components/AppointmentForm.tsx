'use client';

import { useState, useEffect } from 'react';
import { User, AppointmentFormData } from '@/types';
import { URDANETA_BARANGAYS } from '@/lib/constants';
import {
  allowedNextStatuses,
  isTerminal,
  type AppointmentStatusKey,
} from '@/lib/appointments/stateMachine';
import { calculateArancelFee, getArancelTariff } from '@/lib/arancel';
import { formatCurrency } from '@/lib/utils';

interface AppointmentFormProps {
  form: AppointmentFormData;
  onChange: (form: AppointmentFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
  initialStatus?: string;
  availablePriests: User[];
  allPriests?: User[];
}

const STATUS_LABELS: Record<AppointmentStatusKey, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function AppointmentForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
  initialStatus = 'PENDING',
  availablePriests,
  allPriests = [],
}: AppointmentFormProps) {
  const tariff = getArancelTariff(form.sacramentType);
  const [sponsorCount, setSponsorCount] = useState<number>(tariff.includedSponsors);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  // On new appointment creation, if fee is empty, auto-populate standard Arancel baseFee
  useEffect(() => {
    if (!isEditing && form.fee === '') {
      const initialBreakdown = calculateArancelFee({
        sacramentType: form.sacramentType,
        sponsorCount: tariff.includedSponsors,
        selectedAddOnKeys: [],
      });
      onChange({ ...form, fee: initialBreakdown.totalFee.toString() });
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof AppointmentFormData, value: string) =>
    onChange({ ...form, [field]: value });

  const handleSacramentTypeChange = (nextSacramentType: string) => {
    const nextTariff = getArancelTariff(nextSacramentType);
    const nextSponsors = nextTariff.includedSponsors;
    setSponsorCount(nextSponsors);
    setSelectedAddOns([]);
    const nextBreakdown = calculateArancelFee({
      sacramentType: nextSacramentType,
      sponsorCount: nextSponsors,
      selectedAddOnKeys: [],
    });
    onChange({
      ...form,
      sacramentType: nextSacramentType,
      fee: nextBreakdown.totalFee.toString(),
    });
  };

  const handleSponsorCountChange = (nextCount: number) => {
    const clamped = Number.isFinite(nextCount) ? Math.max(0, Math.floor(nextCount)) : 0;
    setSponsorCount(clamped);
    const nextBreakdown = calculateArancelFee({
      sacramentType: form.sacramentType,
      sponsorCount: clamped,
      selectedAddOnKeys: selectedAddOns,
    });
    onChange({
      ...form,
      fee: nextBreakdown.totalFee.toString(),
    });
  };

  const handleToggleAddOn = (addOnKey: string) => {
    const nextAddOns = selectedAddOns.includes(addOnKey)
      ? selectedAddOns.filter((k) => k !== addOnKey)
      : [...selectedAddOns, addOnKey];
    setSelectedAddOns(nextAddOns);
    const nextBreakdown = calculateArancelFee({
      sacramentType: form.sacramentType,
      sponsorCount,
      selectedAddOnKeys: nextAddOns,
    });
    onChange({
      ...form,
      fee: nextBreakdown.totalFee.toString(),
    });
  };

  const breakdown = calculateArancelFee({
    sacramentType: form.sacramentType,
    sponsorCount,
    selectedAddOnKeys: selectedAddOns,
  });

  // FR-3.3: Offer only statuses reachable from the persisted status (excluding CANCELLED,
  // which has its own Cancel modal requiring a reason and payment disposition).
  const currentKey = (initialStatus as AppointmentStatusKey) || 'PENDING';
  const nextAllowed = allowedNextStatuses(currentKey, 'ADMIN').filter((s) => s !== 'CANCELLED');
  const reachableStatuses: AppointmentStatusKey[] = [currentKey, ...nextAllowed];
  const terminal = isEditing && isTerminal(currentKey);

  // Keep currently assigned priest in dropdown if they are on day-off
  const priestOptions = [...availablePriests];
  if (form.assignedPriestId && !priestOptions.some((p) => p.id === form.assignedPriestId)) {
    const assigned = allPriests.find((p) => p.id === form.assignedPriestId);
    if (assigned) priestOptions.push(assigned);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={isEditing ? 'grid grid-cols-2 gap-4' : ''}>
        <div>
          <label className="block text-sm font-medium mb-1">Sacrament Type</label>
          <select
            value={form.sacramentType}
            onChange={(e) => handleSacramentTypeChange(e.target.value)}
            disabled={terminal}
            className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
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
        {isEditing && (
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              disabled={terminal}
              className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
            >
              {reachableStatuses.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st] || st}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {terminal
                ? `This appointment is ${currentKey.toLowerCase()} (terminal).`
                : 'To cancel, use the Cancel button in the table (requires a reason).'}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Assign Priest</label>
        <select
          value={form.assignedPriestId}
          onChange={(e) => set('assignedPriestId', e.target.value)}
          disabled={terminal}
          className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
        >
          <option value="">Select a Priest (Optional)</option>
          {priestOptions.map((priest) => (
            <option key={priest.id} value={priest.id}>
              {priest.name}
              {priest.availability === 'DAYOFF' ? ' (Day off)' : ''}
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
          value={form.participantName}
          onChange={(e) => set('participantName', e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input
            type="tel"
            value={form.participantPhone}
            onChange={(e) => set('participantPhone', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={form.participantEmail}
            onChange={(e) => set('participantEmail', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Barangay</label>
          <select
            value={form.barangay}
            onChange={(e) => set('barangay', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Select Barangay</option>
            {URDANETA_BARANGAYS.map((brgy) => (
              <option key={brgy} value={brgy}>
                {brgy}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">City/Municipality</label>
          <input
            type="text"
            value={form.city}
            readOnly
            className="w-full px-3 py-2 border rounded-lg bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Province</label>
          <input
            type="text"
            value={form.province}
            readOnly
            className="w-full px-3 py-2 border rounded-lg bg-gray-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={form.scheduledDate}
            onChange={(e) => set('scheduledDate', e.target.value)}
            disabled={terminal}
            required
            className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Time (24h HH:MM)</label>
          <input
            type="time"
            value={form.scheduledTime}
            onChange={(e) => set('scheduledTime', e.target.value)}
            disabled={terminal}
            required
            className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
          disabled={terminal}
          className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
        />
      </div>

      {/* Diocesan Arancel Fee Calculator Card */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-blue-950">
              Diocesan Arancel Fee Calculator
            </h4>
            <p className="text-xs text-blue-800 mt-0.5">
              {tariff.title} — Base: {formatCurrency(tariff.baseFee)}
            </p>
            {tariff.note && (
              <p className="text-xs text-blue-700 mt-0.5 italic">{tariff.note}</p>
            )}
          </div>
          <button
            type="button"
            disabled={terminal}
            onClick={() => set('fee', breakdown.totalFee.toString())}
            className="text-xs font-medium bg-blue-600 text-white px-2.5 py-1.5 rounded hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
          >
            Apply Standard Arancel ({formatCurrency(breakdown.totalFee)})
          </button>
        </div>

        {tariff.extraSponsorFee > 0 && (
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-blue-200/70">
            <label htmlFor="arancel-sponsor-count" className="text-xs font-medium text-blue-950">
              Total Sponsors / Godparents ({tariff.includedSponsors} included in base, +
              {formatCurrency(tariff.extraSponsorFee)} each extra)
            </label>
            <input
              id="arancel-sponsor-count"
              type="number"
              min="0"
              step="1"
              disabled={terminal}
              value={sponsorCount}
              onChange={(e) => handleSponsorCountChange(Number(e.target.value))}
              className="w-20 px-2 py-1 text-sm border border-blue-300 rounded bg-white text-right"
            />
          </div>
        )}

        {tariff.addOns.length > 0 && (
          <div className="pt-1 border-t border-blue-200/70 space-y-1.5">
            <p className="text-xs font-medium text-blue-950">Optional Parish Add-ons:</p>
            {tariff.addOns.map((addOn) => {
              const checked = selectedAddOns.includes(addOn.key);
              return (
                <label
                  key={addOn.key}
                  className="flex items-center justify-between text-xs text-blue-900 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={terminal}
                      onChange={() => handleToggleAddOn(addOn.key)}
                      className="rounded border-blue-300 text-blue-600"
                    />
                    <span>{addOn.label}</span>
                  </span>
                  <span className="font-medium">+{formatCurrency(addOn.amount)}</span>
                </label>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-blue-200/70 space-y-1">
          {breakdown.itemizedLines.map((line, idx) => (
            <div key={idx} className="flex justify-between text-xs text-blue-900">
              <span>{line.label}</span>
              <span>{formatCurrency(line.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-bold text-blue-950 pt-1 border-t border-blue-200">
            <span>Standard Arancel Total</span>
            <span>{formatCurrency(breakdown.totalFee)}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Fee (PHP){' '}
          <span className="text-xs font-normal text-gray-500">
            (Auto-calculated from Arancel or override manually)
          </span>
        </label>
        <input
          type="number"
          value={form.fee}
          onChange={(e) => set('fee', e.target.value)}
          required
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {isEditing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
