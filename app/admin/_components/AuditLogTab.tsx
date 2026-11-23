'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuditLogEntry } from '@/types';
import { formatDateTime } from '@/lib/utils';

const ENTITY_TYPES = [
  'Appointment',
  'Payment',
  'OnlinePaymentIntent',
  'User',
  'AppointmentRequirement',
] as const;

const ACTOR_BADGE: Record<string, string> = {
  USER: 'bg-blue-100 text-blue-800',
  SYSTEM: 'bg-gray-200 text-gray-800',
  PUBLIC: 'bg-indigo-100 text-indigo-800',
};

function renderSnapshot(snap: Record<string, unknown> | null) {
  if (!snap || Object.keys(snap).length === 0) {
    return <span className="text-gray-400 italic">—</span>;
  }
  return (
    <dl className="space-y-0.5 text-xs">
      {Object.entries(snap).map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="font-medium text-gray-600">{k}:</dt>
          <dd className="font-mono text-gray-900 break-all">
            {v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditLogTab() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (entityType) params.set('entityType', entityType);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error loading audit log:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityType, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleReset = () => {
    setEntityType('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Immutable Audit Log</h2>
          <p className="text-sm text-gray-600">
            Every change to appointments, payments, checklists and staff accounts is recorded here and protected against edits or deletion.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="audit-entity-type" className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              id="audit-entity-type"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">All Entities</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="audit-from-date" className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              id="audit-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="audit-to-date" className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              id="audit-to-date"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {items.length} of {total} audit record(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">When</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Before</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">After</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No audit entries found.
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-medium ${
                          ACTOR_BADGE[entry.actorType] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {entry.actorType === 'USER'
                          ? `${entry.actorName || 'Staff'} (${entry.actorRole || 'USER'})`
                          : entry.actorType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-semibold text-gray-900">
                      {entry.action}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-gray-900">{entry.entityType}</div>
                      <div className="font-mono text-gray-500">{entry.entityId.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3">{renderSnapshot(entry.before)}</td>
                    <td className="px-4 py-3">{renderSnapshot(entry.after)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                      {entry.reason || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
