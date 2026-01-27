'use client';

import { useState, useEffect } from 'react';
import { useUsers } from '@/lib/hooks/useUsers';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { UserForm } from './UserForm';
import { User, UserFormData } from '@/types';
import { DEFAULT_USER_FORM } from '@/lib/constants';

interface UsersTabProps {
  currentUser: User | null;
  onDataChange?: () => void;
}

export function UsersTab({ currentUser, onDataChange }: UsersTabProps) {
  const { users, fetchUsers, createUser, updateUser, toggleUserStatus } = useUsers();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormData>({ ...DEFAULT_USER_FORM });

  useEffect(() => { fetchUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_USER_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateUser(editingId, form);
        alert('User updated!');
      } else {
        await createUser(form);
        alert('User created!');
      }
      setShowModal(false);
      resetForm();
      fetchUsers();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error saving user');
    }
  };

  const handleEdit = (targetUser: User) => {
    setEditingId(targetUser.id);
    setForm({
      name: targetUser.name,
      email: targetUser.email,
      password: '',
      role: targetUser.role,
      status: targetUser.status || 'ACTIVE',
      availability: targetUser.availability || 'AVAILABLE',
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (targetUser: User) => {
    const action = targetUser.status === 'ACTIVE' ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await toggleUserStatus(targetUser);
      alert(`User ${action}d successfully!`);
      fetchUsers();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Error ${action}ing user`);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-bold">Manage Users</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((targetUser) => (
              <tr key={targetUser.id}>
                <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900">{targetUser.name}</div></td>
                <td className="px-6 py-4 text-sm text-gray-900">{targetUser.email}</td>
                <td className="px-6 py-4"><StatusBadge status={targetUser.role} type="role" /></td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${targetUser.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {targetUser.status || 'ACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm space-x-2">
                  <button onClick={() => handleEdit(targetUser)} className="text-blue-600 hover:text-blue-900">Edit</button>
                  {targetUser.id !== currentUser?.id && (
                    <button
                      onClick={() => handleToggleStatus(targetUser)}
                      className={targetUser.status === 'ACTIVE' ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                    >
                      {targetUser.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-8 text-gray-500">No users found</div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? 'Edit User' : 'Add User'} maxWidth="max-w-md">
        <UserForm form={form} onChange={setForm} onSubmit={handleSubmit} onCancel={() => { setShowModal(false); resetForm(); }} isEditing={!!editingId} />
      </Modal>
    </div>
  );
}
