'use client';

import { useState, useCallback } from 'react';
import { Appointment } from '@/types';

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAppointments = useCallback(async (params?: Record<string, string>) => {
    setLoading(true);
    try {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const response = await fetch(`/api/appointments${query}`);
      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const buildPayload = (formData: Record<string, any>) => {
    const payload = { ...formData };
    if (formData.fee !== undefined && formData.fee !== '') {
      const parsed = parseFloat(formData.fee);
      if (!Number.isFinite(parsed)) {
        throw new Error('Invalid fee value');
      }
      payload.fee = parsed;
    } else {
      delete payload.fee;
    }
    return payload;
  };

  const createAppointment = useCallback(async (formData: Record<string, any>) => {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(formData)),
    });
    if (!response.ok) throw new Error('Failed to save appointment');
    return response.json();
  }, []);

  const updateAppointment = useCallback(async (id: string, formData: Record<string, any>) => {
    const response = await fetch(`/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(formData)),
    });
    if (!response.ok) throw new Error('Failed to save appointment');
    return response.json();
  }, []);

  const cancelAppointment = useCallback(async (id: string) => {
    const response = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to cancel');
    return response.json();
  }, []);

  return { appointments, loading, fetchAppointments, createAppointment, updateAppointment, cancelAppointment };
}
