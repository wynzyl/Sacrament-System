'use client';

import { useState, useCallback } from 'react';
import { User } from '@/types';

export function usePriests() {
  const [priests, setPriests] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPriests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users?role=PRIEST');
      const data = await response.json();
      setPriests(data);
    } catch (error) {
      console.error('Error fetching priests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPriest = useCallback(async (formData: Record<string, any>) => {
    const body: any = {
      name: formData.name,
      email: formData.email,
      role: 'PRIEST',
      status: formData.status,
      availability: formData.availability,
    };
    if (formData.password) body.password = formData.password;

    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save priest');
    }
    return response.json();
  }, []);

  const updatePriest = useCallback(async (id: string, formData: Record<string, any>) => {
    const body: any = {
      name: formData.name,
      email: formData.email,
      role: 'PRIEST',
      status: formData.status,
      availability: formData.availability,
    };
    if (formData.password) body.password = formData.password;

    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save priest');
    }
    return response.json();
  }, []);

  const togglePriestStatus = useCallback(async (priest: User) => {
    const newStatus = priest.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const response = await fetch(`/api/users/${priest.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to toggle priest status`);
    }
    return { newStatus };
  }, []);

  const availablePriests = priests.filter(
    p => p.status === 'ACTIVE' && p.availability === 'AVAILABLE'
  );

  return { priests, availablePriests, loading, fetchPriests, createPriest, updatePriest, togglePriestStatus };
}
