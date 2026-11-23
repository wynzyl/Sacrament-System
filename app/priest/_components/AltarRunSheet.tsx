'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppointments } from '@/lib/hooks/useAppointments';
import { addDays, manilaDateString } from '@/lib/dates';
import { CHURCH_NAME, DEFAULT_CITY, DEFAULT_PROVINCE } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import {
  buildDailyLiturgicalRunSheet,
  MASS_INTENTION_CATEGORIES,
  MassIntentionCategory,
} from '@/lib/liturgicalRunSheet';
import { StatusBadge } from '@/components/StatusBadge';
import { User } from '@/types';

interface AltarRunSheetProps {
  user: User | null;
}

const INTENTION_CATEGORY_ORDER: MassIntentionCategory[] = ['THANKSGIVING', 'SOULS', 'PETITION'];

const CATEGORY_STYLES: Record<
  MassIntentionCategory,
  { border: string; headerBg: string; badge: string; icon: string }
> = {
  THANKSGIVING: {
    border: 'border-amber-200',
    headerBg: 'bg-amber-50 text-amber-900',
    badge: 'bg-amber-100 text-amber-800',
    icon: '🙌',
  },
  SOULS: {
    border: 'border-purple-200',
    headerBg: 'bg-purple-50 text-purple-900',
    badge: 'bg-purple-100 text-purple-800',
    icon: '✝️',
  },
  PETITION: {
    border: 'border-blue-200',
    headerBg: 'bg-blue-50 text-blue-900',
    badge: 'bg-blue-100 text-blue-800',
    icon: '🙏',
  },
};

export function AltarRunSheet({ user }: AltarRunSheetProps) {
  const { appointments, loading, fetchAppointments } = useAppointments();

  const today = useMemo(() => manilaDateString(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  const [selectedDate, setSelectedDate] = useState<string>(today);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const runSheet = useMemo(
    () => buildDailyLiturgicalRunSheet(appointments, selectedDate),
    [appointments, selectedDate]
  );

  const upcomingDatesFromToday = useMemo(
    () => runSheet.upcomingDates.filter((d) => d >= today),
    [runSheet.upcomingDates, today]
  );

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const formattedSelectedDate =
    selectedDate === 'ALL'
      ? 'All Scheduled Liturgical Dates'
      : selectedDate
        ? formatDate(selectedDate)
        : formatDate(today);

  return (
    <div className="space-y-6">
      {/* Print-specific stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          header,
          nav,
          .no-print {
            display: none !important;
          }
          .print-container {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
          }
          .print-page-break {
            page-break-before: always;
          }
        }
      `}</style>

      {/* Toolbar: Date Selector, Presets, and Print Button (hidden when printing) */}
      <div className="no-print bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Altar Run-Sheet &amp; Daily Mass Intentions (Pamisa)
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Ambo-ready Mass Intention reading sheet and chronological Sacrament Ceremony Run-Sheet
              for {CHURCH_NAME}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow hover:bg-indigo-800 transition-colors"
            >
              <span>🖨️</span>
              <span>Print / Save Altar Run-Sheet PDF</span>
            </button>
          </div>
        </div>

        {/* Date Filter Controls */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="runsheet-date" className="text-sm font-medium text-gray-700 mr-1">
              Liturgical Date:
            </label>
            <input
              id="runsheet-date"
              type="date"
              value={selectedDate === 'ALL' ? '' : selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || today)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                selectedDate === today
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Today ({today})
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(tomorrow)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                selectedDate === tomorrow
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate('ALL')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                selectedDate === 'ALL'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Upcoming Dates ({runSheet.upcomingDates.length})
            </button>
          </div>

          {upcomingDatesFromToday.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">
                Assigned Dates:
              </span>
              {upcomingDatesFromToday.slice(0, 5).map((dateStr) => (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                    selectedDate === dateStr
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {dateStr}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Liturgical Print Header Banner */}
      <div className="bg-white p-6 rounded-lg shadow border-t-4 border-indigo-700 print-container">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
              Diocese of Urdaneta • {DEFAULT_CITY}, {DEFAULT_PROVINCE}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{CHURCH_NAME}</h1>
            <p className="text-sm text-gray-600">
              Official Daily Altar Lector Sheet &amp; Sacrament Ceremony Run-Sheet
            </p>
          </div>
          <div className="mt-3 md:mt-0 md:text-right">
            <p className="text-sm font-semibold text-gray-900">
              Date: <span className="text-indigo-700">{formattedSelectedDate}</span>
            </p>
            <p className="text-sm text-gray-700">
              Celebrant / Priest:{' '}
              <span className="font-medium">
                {user?.name ? `Rev. Fr. ${user.name}` : 'Assigned Parish Priest'}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {runSheet.totalMassIntentions} Mass Intention(s) • {runSheet.totalCeremonies}{' '}
              Sacrament Ceremony(ies)
            </p>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 uppercase font-semibold">Total Schedule Items</p>
            <p className="text-2xl font-bold text-gray-900">{runSheet.totalActiveAppointments}</p>
          </div>
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800 uppercase font-semibold">Thanksgiving</p>
            <p className="text-2xl font-bold text-amber-900">
              {runSheet.intentionsByCategory.THANKSGIVING.length}
            </p>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
            <p className="text-xs text-purple-800 uppercase font-semibold">Repose of Souls (+)</p>
            <p className="text-2xl font-bold text-purple-900">
              {runSheet.intentionsByCategory.SOULS.length}
            </p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-800 uppercase font-semibold">Special Petitions</p>
            <p className="text-2xl font-bold text-blue-900">
              {runSheet.intentionsByCategory.PETITION.length}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
          Loading daily liturgical schedule...
        </div>
      ) : (
        <>
          {/* Section 1: Altar Lector Sheet: Mass Intentions (Pamisa) */}
          <div className="bg-white rounded-lg shadow border border-gray-200 print-container">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  ✝️ Altar Lector Sheet: Mass Intentions (Pamisa)
                </h3>
                <p className="text-xs text-gray-600">
                  Grouped for reading at the ambo before Holy Mass and during the Prayers of the
                  Faithful
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                {runSheet.totalMassIntentions} Intention(s)
              </span>
            </div>

            <div className="p-6 space-y-6">
              {INTENTION_CATEGORY_ORDER.map((categoryKey) => {
                const meta = MASS_INTENTION_CATEGORIES[categoryKey];
                const style = CATEGORY_STYLES[categoryKey];
                const items = runSheet.intentionsByCategory[categoryKey];

                return (
                  <div
                    key={categoryKey}
                    className={`rounded-lg border ${style.border} overflow-hidden`}
                  >
                    <div
                      className={`px-4 py-3 ${style.headerBg} flex items-center justify-between`}
                    >
                      <div>
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <span>{style.icon}</span>
                          <span>{meta.label}</span>
                        </h4>
                        <p className="text-xs opacity-80 italic">{meta.subtitle}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${style.badge}`}>
                        {items.length}
                      </span>
                    </div>

                    <div className="p-4 bg-white">
                      <p className="text-xs font-medium text-gray-500 mb-3 italic">
                        Lector Prompt: &ldquo;{meta.lectorPrompt}&rdquo;
                      </p>

                      {items.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">
                          No {meta.label.toLowerCase()} scheduled for this date.
                        </p>
                      ) : (
                        <ol className="list-decimal list-inside space-y-2.5">
                          {items.map((item) => (
                            <li
                              key={item.id}
                              className="text-sm text-gray-900 pb-2 border-b border-gray-100 last:border-b-0 last:pb-0"
                            >
                              <span className="font-semibold">{item.lectorLine}</span>
                              <div className="mt-1 ml-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                  🕒 {item.scheduledTime}
                                </span>
                                {selectedDate === 'ALL' && (
                                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                    📅 {item.scheduledDate}
                                  </span>
                                )}
                                {item.barangay && (
                                  <span>🏠 Brgy. {item.barangay}</span>
                                )}
                                {item.referenceNumber && (
                                  <span className="font-mono text-gray-400">
                                    Ref: {item.referenceNumber}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded font-medium ${
                                    item.isRequirementsReady
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  📋 {item.requirementsSummary}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Chronological Sacrament Ceremony Run-Sheet */}
          <div className="bg-white rounded-lg shadow border border-gray-200 print-container">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  📜 Chronological Sacrament Ceremony Run-Sheet
                </h3>
                <p className="text-xs text-gray-600">
                  Ordered liturgical celebrations (Baptisms, Weddings, Funerals, Confirmations,
                  First Communions, and Anointing of the Sick)
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                {runSheet.totalCeremonies} Ceremony(ies)
              </span>
            </div>

            {runSheet.ceremonies.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="font-medium">
                  No sacramental ceremonies scheduled for{' '}
                  {selectedDate === 'ALL' ? 'any upcoming date' : formattedSelectedDate}.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the date buttons above to switch to Today, Tomorrow, or All Upcoming Dates.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {runSheet.ceremonies.map((ceremony, index) => (
                  <div key={ceremony.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center justify-center bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg px-3 py-2 min-w-[92px] text-center">
                          <span className="text-2xl">{ceremony.sacramentIcon}</span>
                          <span className="text-sm font-bold mt-1">{ceremony.scheduledTime}</span>
                          <span className="text-[11px] text-indigo-700">
                            to {ceremony.endTime}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                              #{index + 1} • {ceremony.sacramentLabel}
                            </span>
                            {selectedDate === 'ALL' && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                                📅 {formatDate(ceremony.scheduledDate)}
                              </span>
                            )}
                            {ceremony.referenceNumber && (
                              <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {ceremony.referenceNumber}
                              </span>
                            )}
                            <StatusBadge status={ceremony.status} />
                          </div>

                          <h4 className="text-lg font-bold text-gray-900">
                            {ceremony.participantName}
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                            <p>
                              <span className="font-medium text-gray-700">📍 Venue:</span>{' '}
                              {ceremony.location}
                            </p>
                            {ceremony.barangay && (
                              <p>
                                <span className="font-medium text-gray-700">🏠 Residence:</span>{' '}
                                Brgy. {ceremony.barangay}
                                {ceremony.city ? `, ${ceremony.city}` : ''}
                              </p>
                            )}
                            {ceremony.participantPhone && (
                              <p>
                                <span className="font-medium text-gray-700">📞 Contact:</span>{' '}
                                {ceremony.participantPhone}
                              </p>
                            )}
                            {ceremony.assignedPriestName && (
                              <p>
                                <span className="font-medium text-gray-700">⛪ Celebrant:</span>{' '}
                                Fr. {ceremony.assignedPriestName}
                              </p>
                            )}
                          </div>

                          {ceremony.notes && (
                            <p className="text-sm text-gray-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-1.5 mt-2">
                              <span className="font-semibold">Sacristy / Family Note:</span>{' '}
                              {ceremony.notes}
                            </p>
                          )}

                          <div className="mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-indigo-900 bg-indigo-50/60 px-3 py-2 rounded">
                            <span className="font-bold uppercase tracking-wide">
                              Liturgical Rubric:{' '}
                            </span>
                            <span>{ceremony.liturgicalRubric}</span>
                          </div>
                        </div>
                      </div>

                      {/* Requirement Readiness Badge */}
                      <div className="flex md:flex-col items-start md:items-end justify-between gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            ceremony.isRequirementsReady
                              ? 'bg-green-50 text-green-800 border-green-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          <span>{ceremony.isRequirementsReady ? '✅' : '⚠️'}</span>
                          <span>Requirements: {ceremony.requirementsSummary}</span>
                        </span>
                        <span className="text-xs text-gray-500">
                          Duration: ~{ceremony.durationMin} mins
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sacristy Sign-off Footer for Print */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-gray-600">
              <div>
                Prepared via {CHURCH_NAME} Sacrament Management System • Urdaneta City
              </div>
              <div className="flex gap-8">
                <span>Sacristan / Lector Initials: _______________</span>
                <span>Celebrant Signature: ___________________</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
