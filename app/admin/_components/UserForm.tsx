'use client';

import { UserFormData } from '@/types';

interface UserFormProps {
  form: UserFormData;
  onChange: (form: UserFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
}

export function UserForm({ form, onChange, onSubmit, onCancel, isEditing }: UserFormProps) {
  const set = (field: keyof UserFormData, value: string) => onChange({ ...form, [field]: value });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="John Doe" className="w-full px-3 py-2 border rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required placeholder="user@church.com" className="w-full px-3 py-2 border rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Password {isEditing && <span className="text-gray-500">(leave blank to keep current)</span>}
        </label>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required={!isEditing} placeholder="••••••••" className="w-full px-3 py-2 border rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Role</label>
        <select value={form.role} onChange={(e) => set('role', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
          <option value="ADMIN">Admin</option>
          <option value="PRIEST">Priest</option>
          <option value="CASHIER">Cashier</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        {form.role === 'PRIEST' && (
          <div>
            <label className="block text-sm font-medium mb-1">Availability</label>
            <select value={form.availability} onChange={(e) => set('availability', e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="AVAILABLE">Available</option>
              <option value="DAYOFF">Day Off</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
          {isEditing ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  );
}
