'use client';

import { useState } from 'react';
import { useReports } from '@/lib/hooks/useReports';
import { DatePresetButtons } from '@/components/DatePresetButtons';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ReportAppointment, ReportPayment } from '@/types';

export function ReportsTab() {
  const { reportData, collectionsData, loading, fetchAppointmentsReport, fetchCollectionsReport, exportAppointmentsPDF, exportCollectionsPDF } = useReports();
  const [reportType, setReportType] = useState<'appointments' | 'collections'>('appointments');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleGenerate = () => {
    if (!fromDate || !toDate) { alert('Please select both From and To dates'); return; }
    if (reportType === 'appointments') fetchAppointmentsReport(fromDate, toDate);
    else fetchCollectionsReport(fromDate, toDate);
  };

  const handleExport = () => {
    if (reportType === 'appointments' && reportData) {
      exportAppointmentsPDF(reportData, fromDate, toDate);
    } else if (reportType === 'collections' && collectionsData) {
      exportCollectionsPDF(collectionsData, fromDate, toDate);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Reports</h2>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <DatePresetButtons onSetDates={(f, t) => { setFromDate(f); setToDate(t); }} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Report Type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
              <option value="appointments">Confirmed Appointments</option>
              <option value="collections">Collections</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleGenerate} disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400">
              {loading ? 'Loading...' : 'Generate'}
            </button>
            {(reportData || collectionsData) && (
              <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                Export PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Appointments Report Preview */}
      {reportType === 'appointments' && reportData && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-bold">Confirmed Appointments Report</h3>
            <p className="text-sm text-gray-600">{reportData.length} appointment(s) found</p>
          </div>
          {reportData.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No appointments found for the selected date range</div>
          ) : (
            (() => {
              const grouped = reportData.reduce((acc, apt) => {
                const date = formatDate(apt.scheduledDate);
                if (!acc[date]) acc[date] = [];
                acc[date].push(apt);
                return acc;
              }, {} as Record<string, ReportAppointment[]>);

              return Object.entries(grouped).map(([date, apts]) => (
                <div key={date} className="border-b last:border-b-0">
                  <div className="bg-blue-50 px-6 py-2 font-semibold text-blue-800">{date}</div>
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priest</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {apts.map((apt) => (
                        <tr key={apt.id}>
                          <td className="px-6 py-3 text-sm">{apt.participantName}</td>
                          <td className="px-6 py-3 text-sm">{apt.sacramentType.replace('_', ' ')}</td>
                          <td className="px-6 py-3 text-sm">{apt.scheduledTime}</td>
                          <td className="px-6 py-3 text-sm">{apt.assignedPriest?.name || 'Not assigned'}</td>
                          <td className="px-6 py-3 text-sm text-gray-500">{apt.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ));
            })()
          )}
        </div>
      )}

      {/* Collections Report Preview */}
      {reportType === 'collections' && collectionsData && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-bold">Collections Report</h3>
            <p className="text-sm text-gray-600">{collectionsData.payments.length} payment(s) found</p>
          </div>

          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-100 border-b">
            <div className="text-center">
              <p className="text-sm text-gray-600">Cash</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(collectionsData.totals.cash)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">GCash</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(collectionsData.totals.gcash)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-purple-600">{formatCurrency(collectionsData.totals.total)}</p>
            </div>
          </div>

          {collectionsData.payments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No payments found for the selected date range</div>
          ) : (
            (() => {
              const grouped = collectionsData.payments.reduce((acc, payment) => {
                const date = formatDate(payment.createdAt);
                if (!acc[date]) acc[date] = [];
                acc[date].push(payment);
                return acc;
              }, {} as Record<string, ReportPayment[]>);

              Object.keys(grouped).forEach(date => {
                grouped[date].sort((a, b) => a.appointment.sacramentType.localeCompare(b.appointment.sacramentType));
              });

              return Object.entries(grouped).map(([date, payments]) => (
                <div key={date} className="border-b last:border-b-0">
                  <div className="bg-green-50 px-6 py-2 font-semibold text-green-800">{date}</div>
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                        <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-6 py-3 text-sm">{p.appointment.participantName}</td>
                          <td className="px-6 py-3 text-sm">{p.appointment.sacramentType.replace('_', ' ')}</td>
                          <td className="px-6 py-3 text-sm font-semibold text-green-600 text-right">{formatCurrency(p.amount)}</td>
                          <td className="px-6 py-3 text-sm">{p.paymentMethod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ));
            })()
          )}
        </div>
      )}
    </div>
  );
}
