'use client';

import { useState, useEffect, useCallback } from 'react';
import { Appointment } from '@/types';
import { Modal } from '@/components/Modal';
import { SACRAMENT_LABELS } from '@/lib/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

type NotificationTemplateKey =
  | 'BOOKING_RECEIVED'
  | 'FEE_ASSESSED'
  | 'DOCUMENT_FEEDBACK'
  | 'SCHEDULE_CONFIRMED'
  | 'APPOINTMENT_CANCELLED';

interface OutboxNotification {
  id: string;
  appointmentId: string | null;
  referenceNumber: string;
  sacramentType: string;
  participantName: string;
  recipientEmail: string;
  template: NotificationTemplateKey;
  subject: string;
  html: string;
  textSummary: string;
  actionUrl: string;
  actionLabel: string;
  deliveryMode: 'RESEND_API' | 'LOCAL_OUTBOX';
  providerMessageId: string | null;
  customMessage: string | null;
  triggeredBy: {
    actorType: string;
    actorName: string | null;
    actorRole: string | null;
  };
  dispatchedAt: string;
}

const TEMPLATE_META: Record<
  NotificationTemplateKey,
  { label: string; buttonLabel: string; badgeClass: string; buttonClass: string }
> = {
  BOOKING_RECEIVED: {
    label: 'Booking Received',
    buttonLabel: 'Send Booking Receipt',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  FEE_ASSESSED: {
    label: 'Fee Assessed',
    buttonLabel: 'Send Fee Assessment Notice',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  DOCUMENT_FEEDBACK: {
    label: 'Document Feedback',
    buttonLabel: 'Send Document Reminder',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 text-white',
  },
  SCHEDULE_CONFIRMED: {
    label: 'Schedule Confirmed',
    buttonLabel: 'Send Confirmation & QR Pass',
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
    buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  APPOINTMENT_CANCELLED: {
    label: 'Appointment Cancelled',
    buttonLabel: 'Send Cancellation Notice',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

const QUICK_TRIGGER_ORDER: NotificationTemplateKey[] = [
  'FEE_ASSESSED',
  'SCHEDULE_CONFIRMED',
  'DOCUMENT_FEEDBACK',
  'BOOKING_RECEIVED',
  'APPOINTMENT_CANCELLED',
];

interface NotificationsOutboxTabProps {
  appointments: Appointment[];
}

export function NotificationsOutboxTab({ appointments }: NotificationsOutboxTabProps) {
  const [items, setItems] = useState<OutboxNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [referenceFilter, setReferenceFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');

  // One-click Trigger State
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<OutboxNotification | null>(null);

  const fetchOutbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (referenceFilter.trim()) params.set('referenceNumber', referenceFilter.trim());
      if (emailFilter.trim()) params.set('recipientEmail', emailFilter.trim());
      if (templateFilter) params.set('template', templateFilter);

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching notification outbox:', error);
    } finally {
      setLoading(false);
    }
  }, [referenceFilter, emailFilter, templateFilter]);

  useEffect(() => {
    fetchOutbox();
  }, [fetchOutbox]);

  // Preselect first appointment with an email
  useEffect(() => {
    if (!selectedAppointmentId && appointments.length > 0) {
      const withEmail = appointments.find((a) => a.participantEmail || a.createdBy?.email);
      setSelectedAppointmentId((withEmail || appointments[0]).id);
    }
  }, [appointments, selectedAppointmentId]);

  const selectedAppointment = appointments.find((a) => a.id === selectedAppointmentId) || null;

  const handleDispatch = async (
    appointmentId: string,
    template: NotificationTemplateKey,
    staffNote?: string | null
  ) => {
    if (!appointmentId) {
      setFeedbackBanner({ kind: 'error', text: 'Please select an appointment first.' });
      return;
    }

    setSendingTemplate(`${appointmentId}:${template}`);
    setFeedbackBanner(null);

    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          template,
          customMessage: staffNote?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send notification');
      }

      const sent: OutboxNotification = data.notification;
      setFeedbackBanner({
        kind: 'success',
        text: `Sent "${TEMPLATE_META[template].label}" to ${sent.recipientEmail} (${sent.referenceNumber}) via ${sent.deliveryMode}.`,
      });
      setCustomMessage('');
      await fetchOutbox();
    } catch (error) {
      setFeedbackBanner({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Error sending notification',
      });
    } finally {
      setSendingTemplate(null);
    }
  };

  const handleClearFilters = () => {
    setReferenceFilter('');
    setEmailFilter('');
    setTemplateFilter('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Parish Email Notification Outbox
          </h2>
          <p className="text-sm text-gray-600">
            Inspect all automated and staff-dispatched transactional emails, preview rendered HTML email cards, and send one-click notices for Arancel fees, document verification, and QR passes.
          </p>
        </div>
      </div>

      {feedbackBanner && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-center justify-between ${
            feedbackBanner.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-semibold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* One-Click Notification Trigger Panel */}
      <div className="bg-white rounded-lg shadow p-5 border border-blue-100">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          One-Click Parishioner Email Dispatch
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Choose an appointment and click any notification action to immediately send or resend the official parish email.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div>
            <label
              htmlFor="outbox-select-appointment"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Appointment
            </label>
            <select
              id="outbox-select-appointment"
              value={selectedAppointmentId}
              onChange={(e) => setSelectedAppointmentId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {appointments.length === 0 ? (
                <option value="">No active appointments loaded</option>
              ) : (
                appointments.map((apt) => {
                  const email = apt.participantEmail || apt.createdBy?.email || 'No email';
                  return (
                    <option key={apt.id} value={apt.id}>
                      {apt.referenceNumber || apt.id.slice(0, 8)} — {apt.participantName} (
                      {SACRAMENT_LABELS[apt.sacramentType] || apt.sacramentType}) • {email}
                    </option>
                  );
                })
              )}
            </select>
            {selectedAppointment && (
              <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-3">
                <span>
                  <strong>Schedule:</strong> {formatDate(selectedAppointment.scheduledDate)} at{' '}
                  {selectedAppointment.scheduledTime}
                </span>
                <span>
                  <strong>Fee:</strong> {formatCurrency(selectedAppointment.fee)}
                </span>
                <span>
                  <strong>Status:</strong> {selectedAppointment.status}
                </span>
                <span>
                  <strong>Email:</strong>{' '}
                  {selectedAppointment.participantEmail ||
                    selectedAppointment.createdBy?.email || (
                      <span className="text-red-600 font-semibold">None on file</span>
                    )}
                </span>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="outbox-custom-message"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Optional Custom Staff Note (included in email)
            </label>
            <input
              id="outbox-custom-message"
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="e.g. Please bring the original PSA Birth Certificate on Saturday at 9:00 AM..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_TRIGGER_ORDER.map((tpl) => {
            const meta = TEMPLATE_META[tpl];
            const isBusy = sendingTemplate === `${selectedAppointmentId}:${tpl}`;
            return (
              <button
                key={tpl}
                type="button"
                disabled={!selectedAppointmentId || !!sendingTemplate}
                onClick={() => handleDispatch(selectedAppointmentId, tpl, customMessage)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${meta.buttonClass}`}
              >
                {isBusy ? 'Sending...' : meta.buttonLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label
              htmlFor="outbox-filter-ref"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Booking Reference #
            </label>
            <input
              id="outbox-filter-ref"
              type="text"
              value={referenceFilter}
              onChange={(e) => setReferenceFilter(e.target.value)}
              placeholder="SAC-2026-..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="outbox-filter-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Recipient Email
            </label>
            <input
              id="outbox-filter-email"
              type="text"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="parishioner@gmail.com"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="outbox-filter-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Template
            </label>
            <select
              id="outbox-filter-template"
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All Templates</option>
              {Object.entries(TEMPLATE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchOutbox}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Outbox Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center justify-between text-sm text-gray-600">
          <span>Showing {items.length} dispatched notification(s) (Total: {total})</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Dispatched At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Template
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Booking Ref &amp; Sacrament
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Subject &amp; Summary
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Delivery
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No dispatched email notifications found in the outbox.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const meta = TEMPLATE_META[item.template] || {
                    label: item.template,
                    badgeClass: 'bg-gray-100 text-gray-800 border-gray-200',
                  };
                  const canResend = !!item.appointmentId;
                  const resendKey = `${item.appointmentId}:${item.template}`;

                  return (
                    <tr key={item.id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        <div>{formatDateTime(item.dispatchedAt)}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          by{' '}
                          {item.triggeredBy.actorType === 'USER'
                            ? `${item.triggeredBy.actorName || 'Staff'} (${item.triggeredBy.actorRole})`
                            : item.triggeredBy.actorType}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-semibold border ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono font-bold text-gray-900">
                          {item.referenceNumber}
                        </div>
                        <div className="text-gray-600">
                          {SACRAMENT_LABELS[item.sacramentType] || item.sacramentType}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium text-gray-900">{item.participantName}</div>
                        <div className="text-blue-700 font-mono">{item.recipientEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-sm">
                        <div className="font-semibold text-gray-900">{item.subject}</div>
                        <div className="text-gray-600 mt-0.5 line-clamp-2">{item.textSummary}</div>
                        {item.customMessage && (
                          <div className="mt-1 px-2 py-1 bg-blue-50 text-blue-900 rounded text-[11px]">
                            <strong>Staff Note:</strong> {item.customMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                            item.deliveryMode === 'RESEND_API'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.deliveryMode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 font-semibold"
                        >
                          Preview HTML
                        </button>
                        {canResend && (
                          <button
                            type="button"
                            disabled={!!sendingTemplate}
                            onClick={() =>
                              handleDispatch(
                                item.appointmentId!,
                                item.template,
                                item.customMessage
                              )
                            }
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 font-medium disabled:opacity-50"
                          >
                            {sendingTemplate === resendKey ? 'Sending...' : 'Resend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* HTML Email Preview Modal */}
      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title="Rendered HTML Email Card Preview"
        maxWidth="max-w-2xl"
      >
        {previewItem && (
          <div className="space-y-4">
            <div className="bg-gray-50 border rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span>
                  <strong>To:</strong> {previewItem.participantName} &lt;
                  {previewItem.recipientEmail}&gt;
                </span>
                <span className="font-mono text-gray-500">
                  {formatDateTime(previewItem.dispatchedAt)}
                </span>
              </div>
              <div>
                <strong>Subject:</strong> {previewItem.subject}
              </div>
              <div className="flex flex-wrap gap-3 pt-1 text-gray-600">
                <span>
                  <strong>Reference:</strong>{' '}
                  <span className="font-mono">{previewItem.referenceNumber}</span>
                </span>
                <span>
                  <strong>Template:</strong> {TEMPLATE_META[previewItem.template]?.label || previewItem.template}
                </span>
                <span>
                  <strong>Delivery:</strong> {previewItem.deliveryMode}
                </span>
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden bg-slate-100 p-3">
              <div
                className="bg-white rounded-lg shadow-sm overflow-auto max-h-[60vh]"
                dangerouslySetInnerHTML={{ __html: previewItem.html }}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <a
                href={previewItem.actionUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Open Action Link ({previewItem.actionLabel}) &rarr;
              </a>
              <div className="flex gap-2">
                {previewItem.appointmentId && (
                  <button
                    type="button"
                    disabled={!!sendingTemplate}
                    onClick={() =>
                      handleDispatch(
                        previewItem.appointmentId!,
                        previewItem.template,
                        previewItem.customMessage
                      )
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Resend Email
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="px-4 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
