'use client';

import { useState, useCallback } from 'react';
import { ReportAppointment, ReportPayment, CollectionsReportData } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';

export function useReports() {
  const [reportData, setReportData] = useState<ReportAppointment[] | null>(null);
  const [collectionsData, setCollectionsData] = useState<CollectionsReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAppointmentsReport = useCallback(async (from: string, to: string, extraParams?: Record<string, string>) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, ...extraParams });
      const response = await fetch(`/api/reports/appointments?${params}`);
      const data = await response.json();
      setReportData(data);
      setCollectionsData(null);
    } catch {
      alert('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollectionsReport = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/reports/collections?${params}`);
      const data = await response.json();
      setCollectionsData(data);
      setReportData(null);
    } catch {
      alert('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  }, []);

  const exportAppointmentsPDF = useCallback(async (
    data: ReportAppointment[],
    fromDate: string,
    toDate: string,
    options?: { title?: string; subtitle?: string }
  ) => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(options?.title || 'Immaculate Conception Cathedral Parish', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(options?.subtitle || 'Confirmed Appointments Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Date Range: ${formatDate(fromDate)} - ${formatDate(toDate)}`, pageWidth / 2, 29, { align: 'center' });

    const grouped = data.reduce((acc, apt) => {
      const date = formatDate(apt.scheduledDate);
      if (!acc[date]) acc[date] = [];
      acc[date].push(apt);
      return acc;
    }, {} as Record<string, ReportAppointment[]>);

    let startY = 38;
    Object.entries(grouped).forEach(([date, apts]) => {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(date, 14, startY);
      startY += 2;

      autoTable(doc, {
        startY,
        head: [['Participant', 'Sacrament', 'Time', 'Priest', 'Notes']],
        body: apts.map(apt => [
          apt.participantName,
          apt.sacramentType.replace('_', ' '),
          apt.scheduledTime,
          apt.assignedPriest?.name || 'Not assigned',
          apt.notes || '-'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
      });

      startY = (doc as any).lastAutoTable.finalY + 10;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 10);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }

    doc.save(`appointments-report-${fromDate}-to-${toDate}.pdf`);
  }, []);

  const exportCollectionsPDF = useCallback(async (
    data: CollectionsReportData,
    fromDate: string,
    toDate: string,
    options?: { title?: string; generatedBy?: string }
  ) => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const formatAmount = (amount: number) =>
      new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

    doc.setFontSize(16);
    doc.text(options?.title || 'Immaculate Conception Cathedral Parish', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Collections Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Date Range: ${formatDate(fromDate)} - ${formatDate(toDate)}`, pageWidth / 2, 29, { align: 'center' });

    const grouped = data.payments.reduce((acc, payment) => {
      const date = formatDate(payment.createdAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(payment);
      return acc;
    }, {} as Record<string, ReportPayment[]>);

    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) =>
        a.appointment.sacramentType.localeCompare(b.appointment.sacramentType)
      );
    });

    let startY = 38;
    Object.entries(grouped).forEach(([date, payments]) => {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(date, 14, startY);
      startY += 2;

      autoTable(doc, {
        startY,
        head: [['Participant', 'Sacrament', 'Amount', 'Method']],
        body: payments.map(p => [
          p.appointment.participantName,
          p.appointment.sacramentType.replace('_', ' '),
          formatAmount(p.amount),
          p.paymentMethod
        ]),
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' } },
      });

      startY = (doc as any).lastAutoTable.finalY + 10;
    });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, startY);
    autoTable(doc, {
      startY: startY + 2,
      head: [['Cash', 'GCash', 'Total']],
      body: [[
        formatAmount(data.totals.cash),
        formatAmount(data.totals.gcash),
        formatAmount(data.totals.total)
      ]],
      theme: 'grid',
      headStyles: { fillColor: [107, 114, 128] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 10, halign: 'right' },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 10);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }

    doc.save(`collections-report-${fromDate}-to-${toDate}.pdf`);
  }, []);

  return {
    reportData, collectionsData, loading,
    fetchAppointmentsReport, fetchCollectionsReport,
    exportAppointmentsPDF, exportCollectionsPDF,
  };
}
