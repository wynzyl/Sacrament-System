'use client';

import { useState, useCallback } from 'react';
import { Appointment, AppointmentRequirementItem } from '@/types';

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAppointments = useCallback(async (params?: Record<string, string>) => {
    setLoading(true);
    try {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const response = await fetch(`/api/appointments${query}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setAppointments(data);
      }
      return data as Appointment[];
    } catch (error) {
      console.error('Error fetching appointments:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createAppointment = useCallback(async (formData: Record<string, unknown>) => {
    const feeNum = formData.fee === '' || formData.fee === undefined ? 0 : Number(formData.fee);
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, fee: feeNum }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to save appointment');
    return data;
  }, []);

  const updateAppointment = useCallback(async (id: string, formData: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...formData };
    if (formData.fee !== undefined) {
      payload.fee = formData.fee === '' ? 0 : Number(formData.fee);
    }
    const response = await fetch(`/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to save appointment');
    return data;
  }, []);

  const cancelAppointment = useCallback(
    async (
      id: string,
      payload: { reason: string; paymentDisposition?: 'REFUND' | 'FORFEIT' }
    ) => {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to cancel appointment');
      return data;
    },
    []
  );

  const fetchRequirements = useCallback(async (id: string): Promise<AppointmentRequirementItem[]> => {
    const response = await fetch(`/api/appointments/${id}/requirements`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load checklist');
    return data;
  }, []);

  const toggleRequirement = useCallback(
    async (id: string, key: string, isMet: boolean): Promise<AppointmentRequirementItem> => {
      const response = await fetch(`/api/appointments/${id}/requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, isMet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update requirement');
      return data;
    },
    []
  );

  return {
    appointments,
    loading,
    fetchAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    fetchRequirements,
    toggleRequirement,
  };
}
