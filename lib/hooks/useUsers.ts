'use client';

import { useState, useCallback } from 'react';
import { User } from '@/types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async (params?: Record<string, string>) => {
    setLoading(true);
    try {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const response = await fetch(`/api/users${query}`);
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (formData: Record<string, any>) => {
    const body: any = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
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
      throw new Error(error.error || 'Failed to save user');
    }
    return response.json();
  }, []);

  const updateUser = useCallback(async (id: string, formData: Record<string, any>) => {
    const body: any = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
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
      throw new Error(error.error || 'Failed to save user');
    }
    return response.json();
  }, []);

  const toggleUserStatus = useCallback(async (targetUser: User) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const response = await fetch(`/api/users/${targetUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to toggle user status`);
    }
    return { newStatus };
  }, []);

  return { users, loading, fetchUsers, createUser, updateUser, toggleUserStatus };
}
