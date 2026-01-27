'use client';

import { useState } from 'react';
import { DatePresetButtons } from '@/components/DatePresetButtons';
import { formatDate } from '@/lib/utils';
import { ReportAppointment, User } from '@/types';

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface PriestReportsProps {
  user: User | null;
}

export function PriestReports({ user }: PriestReportsProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState<ReportAppointment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    if (!fromDate || !toDate) { alert('Please select both From and To dates'); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate, status: 'CONFIRMED' });
      const response = await fetch(`/api/reports/appointments?${params}`);
      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    await import('jspdf-autotable');

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Confirmed Appointments Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Date Range: ${fromDate} to ${toDate}`, 14, 32);
    doc.text(`Priest: Father ${user?.name}`, 14, 40);

    const groupedByDate: { [key: string]: ReportAppointment[] } = {};
    reportData.forEach((apt) => {
      const date = toLocalDateStr(new Date(apt.scheduledDate));
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(apt);
    });

    let yPos = 50;
    Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, dateAppointments]) => {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(formatDate(date), 14, yPos);
      yPos += 6;

      (doc as any).autoTable({
        startY: yPos,
        head: [['Participant', 'Sacrament', 'Time', 'Location', 'Notes']],
        body: dateAppointments.map((apt) => [
          apt.participantName,
          apt.sacramentType.replace('_', ' '),
          apt.scheduledTime,
          apt.location || '-',
          apt.notes || '-',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        margin: { left: 14 },
        columnStyles: { 4: { cellWidth: 50 } },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
      if (yPos > 260) { doc.addPage(); yPos = 20; }
    });

    doc.save(`priest-appointments-report-${fromDate}-to-${toDate}.pdf`);
  };

  // Group for display
  const groupedByDate: { [key: string]: ReportAppointment[] } = {};
  reportData.forEach((apt) => {
    const date = toLocalDateStr(new Date(apt.scheduledDate));
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(apt);
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Confirmed Appointments Report</h2>
        <DatePresetButtons onSetDates={(f, t) => { setFromDate(f); setToDate(t); }} />
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg" />
          </div>
          <button onClick={fetchReport} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
          {reportData.length > 0 && (
            <button onClick={exportToPDF} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
              Export to PDF
            </button>
          )}
        </div>
      </div>

      {reportData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-bold mb-4">Appointments Results</h3>
          {Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateAppointments]) => (
            <div key={date} className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-2 bg-gray-100 p-2 rounded">{formatDate(date)}</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sacrament</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dateAppointments.map((apt) => (
                      <tr key={apt.id}>
                        <td className="px-4 py-2 text-sm">{apt.participantName}</td>
                        <td className="px-4 py-2 text-sm">{apt.sacramentType.replace('_', ' ')}</td>
                        <td className="px-4 py-2 text-sm">{apt.scheduledTime}</td>
                        <td className="px-4 py-2 text-sm">{apt.location || '-'}</td>
                        <td className="px-4 py-2 text-sm">{apt.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="border-t-2 border-gray-300 pt-4 mt-4">
            <div className="flex justify-end">
              <span className="text-lg font-bold">Total Appointments: {reportData.length}</span>
            </div>
          </div>
        </div>
      )}

      {reportData.length === 0 && fromDate && toDate && !loading && (
        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
          No confirmed appointments found for the selected date range.
        </div>
      )}
    </div>
  );
}
