'use client';

import { useState, useEffect } from 'react';
import { usePriests } from '@/lib/hooks/usePriests';
import { Modal } from '@/components/Modal';
import { PriestForm, PriestFormData } from './PriestForm';
import { User } from '@/types';
import { DEFAULT_PRIEST_FORM } from '@/lib/constants';

interface PriestsTabProps {
  onDataChange?: () => void;
}

export function PriestsTab({ onDataChange }: PriestsTabProps) {
  const { priests, fetchPriests, createPriest, updatePriest, togglePriestStatus } = usePriests();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PriestFormData>({ ...DEFAULT_PRIEST_FORM });

  useEffect(() => { fetchPriests(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_PRIEST_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updatePriest(editingId, form);
        alert('Priest updated!');
      } else {
        await createPriest(form);
        alert('Priest added!');
      }
      setShowModal(false);
      resetForm();
      fetchPriests();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error saving priest');
    }
  };

  const handleEdit = (priest: User) => {
    setEditingId(priest.id);
    setForm({
      name: priest.name,
      email: priest.email,
      password: '',
      status: priest.status || 'ACTIVE',
      availability: priest.availability || 'AVAILABLE',
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (priest: User) => {
    const action = priest.status === 'ACTIVE' ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this priest?`)) return;
    try {
      await togglePriestStatus(priest);
      alert(`Priest ${action}d successfully!`);
      fetchPriests();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Error ${action}ing priest`);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-bold">Manage Priests</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
          + Add Priest
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {priests.map((priest) => (
              <tr key={priest.id}>
                <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900">{priest.name}</div></td>
                <td className="px-6 py-4 text-sm text-gray-900">{priest.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${priest.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {priest.status || 'ACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${priest.availability === 'AVAILABLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                    {priest.availability || 'AVAILABLE'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm space-x-2">
                  <button onClick={() => handleEdit(priest)} className="text-blue-600 hover:text-blue-900">Edit</button>
                  <button
                    onClick={() => handleToggleStatus(priest)}
                    className={priest.status === 'ACTIVE' ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                  >
                    {priest.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {priests.length === 0 && (
          <div className="text-center py-8 text-gray-500">No priests found</div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? 'Edit Priest' : 'Add Priest'} maxWidth="max-w-md">
        <PriestForm form={form} onChange={setForm} onSubmit={handleSubmit} onCancel={() => { setShowModal(false); resetForm(); }} isEditing={!!editingId} />
      </Modal>
    </div>
  );
}
