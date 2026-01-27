'use client';

import { STATUS_COLORS, ROLE_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  type?: 'status' | 'role';
}

export function StatusBadge({ status, type = 'status' }: StatusBadgeProps) {
  const colorMap = type === 'role' ? ROLE_COLORS : STATUS_COLORS;
  const color = colorMap[status] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`px-2 py-1 text-xs rounded ${color}`}>
      {status || 'ACTIVE'}
    </span>
  );
}
