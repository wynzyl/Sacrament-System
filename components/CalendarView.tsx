'use client';

import { useState, useEffect, useCallback } from 'react';
import { Appointment } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { SACRAMENT_ICONS, SACRAMENT_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

interface CalendarViewProps {
  showPriest?: boolean;
  onSelectAppointment?: (appointment: Appointment) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-yellow-500',
  CONFIRMED: 'bg-blue-500',
  COMPLETED: 'bg-green-500',
  CANCELLED: 'bg-red-400',
};

function getManilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarView({ showPriest = true, onSelectAppointment }: CalendarViewProps) {
  const todayStr = getManilaToday();
  const [year, setYear] = useState(() => Number(todayStr.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayStr.slice(5, 7)) - 1); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const fromDate = `${year}-${pad2(month + 1)}-01`;
  const toDate = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetch(`/api/appointments?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAppointments(data);
      }
    } catch (error) {
      console.error('Error loading calendar appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const byDate = appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const d = apt.scheduledDate.slice(0, 10);
    if (!acc[d]) acc[d] = [];
    acc[d].push(apt);
    return acc;
  }, {});

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const t = getManilaToday();
    setYear(Number(t.slice(0, 4)));
    setMonth(Number(t.slice(5, 7)) - 1);
    setSelectedDate(t);
  };

  const monthLabel = new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1)));

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDayAppointments = (byDate[selectedDate] ?? []).slice().sort((a, b) =>
    a.scheduledTime.localeCompare(b.scheduledTime)
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{monthLabel}</h2>
            <p className="text-sm text-gray-500">Click any date to inspect its scheduled sacraments</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
              aria-label="Previous month"
            >
              &larr; Prev
            </button>
            <button
              type="button"
              onClick={goToday}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
              aria-label="Next month"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {/* Status legend */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> Pending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span> Cancelled
          </span>
          {loading && <span className="text-blue-600 ml-auto">Loading month...</span>}
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 uppercase pb-2 border-b">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 pt-2">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-24 bg-gray-50/60 rounded-lg" />;
            }
            const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
            const dayApts = byDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            const counts = dayApts.reduce<Record<string, number>>((c, a) => {
              c[a.status] = (c[a.status] ?? 0) + 1;
              return c;
            }, {});

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`h-24 p-2 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-500/30 bg-blue-50/40'
                    : isToday
                    ? 'border-blue-400 bg-blue-50/20 hover:bg-gray-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-sm font-semibold ${
                      isToday
                        ? 'bg-blue-600 text-white w-6 h-6 rounded-full inline-flex items-center justify-center'
                        : 'text-gray-800'
                    }`}
                  >
                    {day}
                  </span>
                  {dayApts.length > 0 && (
                    <span className="text-xs font-medium text-gray-500">{dayApts.length}</span>
                  )}
                </div>

                {dayApts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const).map((st) =>
                      counts[st] ? (
                        <span
                          key={st}
                          title={`${counts[st]} ${st.toLowerCase()}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-white border border-gray-200 text-gray-700"
                        >
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[st]}`}></span>
                          {counts[st]}
                        </span>
                      ) : null
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Schedule */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Schedule for {formatDate(selectedDate)}
            </h3>
            <p className="text-xs text-gray-500">
              {selectedDayAppointments.length} appointment(s)
            </p>
          </div>
        </div>

        {selectedDayAppointments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No appointments scheduled for this day.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {selectedDayAppointments.map((apt) => (
              <div
                key={apt.id}
                onClick={() => onSelectAppointment?.(apt)}
                className={`px-6 py-4 flex flex-wrap items-center justify-between gap-4 ${
                  onSelectAppointment ? 'cursor-pointer hover:bg-gray-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{SACRAMENT_ICONS[apt.sacramentType] || '⛪'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-700">
                        {apt.scheduledTime}
                      </span>
                      <span className="font-semibold text-gray-900">{apt.participantName}</span>
                      {apt.referenceNumber && (
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {apt.referenceNumber}
                        </span>
                      )}
                      {apt.source === 'ONLINE' && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">
                          ONLINE
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {SACRAMENT_LABELS[apt.sacramentType] || apt.sacramentType}
                      {showPriest && (
                        <span className="ml-3 text-gray-500">
                          • Priest: {apt.assignedPriest?.name || 'Unassigned'}
                        </span>
                      )}
                      {apt.location && <span className="ml-3 text-gray-500">• {apt.location}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {typeof apt.requirementsTotal === 'number' && apt.requirementsTotal > 0 && (
                    <span className="text-xs text-gray-500">
                      {apt.requirementsMet ?? 0}/{apt.requirementsTotal} reqs
                    </span>
                  )}
                  <StatusBadge status={apt.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
