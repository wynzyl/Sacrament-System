'use client';

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      {message}
    </div>
  );
}
