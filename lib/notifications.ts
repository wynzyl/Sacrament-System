// lib/notifications.ts
// Automated + staff-triggerable Parish Email Notification Outbox (FEAT-S3).
// Supports transactional email templates for:
//   - BOOKING_RECEIVED
//   - FEE_ASSESSED
//   - DOCUMENT_FEEDBACK
//   - SCHEDULE_CONFIRMED
//   - APPOINTMENT_CANCELLED
//
// Persists an inspectable outbox log in `.data/notification-outbox.json` (with
// in-memory support for tests), dispatches via Resend HTTP API when
// RESEND_API_KEY is configured (falling back to LOCAL_OUTBOX mode in local dev),
// and records an immutable AuditLog entry (`notification.dispatched`).

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { SYSTEM_ACTOR, writeAudit, type AuditActor } from '@/lib/audit';
import { CHURCH_NAME, DEFAULT_CITY, DEFAULT_PROVINCE, SACRAMENT_LABELS } from '@/lib/constants';
import { formatCurrencyPlain } from '@/lib/format';
import { getAppBaseUrl } from '@/lib/emailAuth';
import { balanceDueCentavos, fromCentavos, sumCentavos, toCentavos } from '@/lib/money';

export const NOTIFICATION_TEMPLATES = [
  'BOOKING_RECEIVED',
  'FEE_ASSESSED',
  'DOCUMENT_FEEDBACK',
  'SCHEDULE_CONFIRMED',
  'APPOINTMENT_CANCELLED',
] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export const NOTIFICATION_TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  BOOKING_RECEIVED: 'Booking Request Received',
  FEE_ASSESSED: 'Arancel Fee Assessment Notice',
  DOCUMENT_FEEDBACK: 'Document Verification Feedback',
  SCHEDULE_CONFIRMED: 'Schedule Confirmed & QR Pass',
  APPOINTMENT_CANCELLED: 'Appointment Cancellation Notice',
};

export type RequirementFeedbackStatus =
  | 'VERIFIED'
  | 'RESUBMIT_REQUIRED'
  | 'PENDING_SUBMISSION';

export interface ParishNotificationContext {
  appointmentId?: string | null;
  referenceNumber: string;
  sacramentType: string;
  participantName: string;
  recipientEmail: string;
  scheduledDate: string | Date;
  scheduledTime: string;
  location?: string | null;
  fee?: number | string | Prisma.Decimal;
  amountPaid?: number | string | Prisma.Decimal;
  balanceDue?: number | string | Prisma.Decimal;
  assignedPriestName?: string | null;
  requirementLabel?: string | null;
  requirementStatus?: RequirementFeedbackStatus;
  requirementsSummary?: { label: string; isMet: boolean }[];
  cancelReason?: string | null;
  paymentDisposition?: 'REFUND' | 'FORFEIT' | 'NONE' | null;
  refundedAmount?: number | string | Prisma.Decimal;
  customMessage?: string | null;
  appBaseUrl?: string | null;
}

export interface RenderedNotificationEmail {
  template: NotificationTemplate;
  subject: string;
  html: string;
  textSummary: string;
  actionUrl: string;
  actionLabel: string;
}

export interface NotificationOutboxEntry {
  id: string;
  appointmentId: string | null;
  referenceNumber: string;
  sacramentType: string;
  participantName: string;
  recipientEmail: string;
  template: NotificationTemplate;
  subject: string;
  html: string;
  textSummary: string;
  actionUrl: string;
  actionLabel: string;
  deliveryMode: 'RESEND_API' | 'LOCAL_OUTBOX';
  providerMessageId: string | null;
  customMessage: string | null;
  triggeredBy: {
    actorType: 'USER' | 'SYSTEM' | 'PUBLIC';
    actorId: string | null;
    actorName: string | null;
    actorRole: string | null;
  };
  metadata: Record<string, unknown>;
  dispatchedAt: string;
}

export interface NotificationOutboxFilters {
  referenceNumber?: string;
  recipientEmail?: string;
  template?: NotificationTemplate | string;
  appointmentId?: string;
  limit?: number;
}

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface DispatchParishNotificationInput extends ParishNotificationContext {
  template: NotificationTemplate;
  actor?: AuditActor;
  db?: DbClient | null;
  skipAudit?: boolean;
  inMemoryOnly?: boolean;
  fetchImpl?: typeof fetch;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Outbox storage (.data/notification-outbox.json + in-memory store for tests)
// ---------------------------------------------------------------------------

let memoryOutbox: NotificationOutboxEntry[] = [];
let memorySeq = 0;

export function getNotificationOutboxFilePath(): string {
  if (process.env.NOTIFICATION_OUTBOX_FILE) {
    return path.resolve(process.env.NOTIFICATION_OUTBOX_FILE);
  }
  return path.join(process.cwd(), '.data', 'notification-outbox.json');
}

function readDiskOutbox(): NotificationOutboxEntry[] | null {
  try {
    const filePath = getNotificationOutboxFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NotificationOutboxEntry[]) : [];
  } catch {
    return null;
  }
}

function writeDiskOutbox(entries: NotificationOutboxEntry[]): void {
  try {
    const filePath = getNotificationOutboxFilePath();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // If running in a read-only filesystem, in-memory store remains authoritative.
  }
}

function loadAllOutboxEntries(): NotificationOutboxEntry[] {
  const fromDisk = readDiskOutbox();
  if (fromDisk !== null) {
    // Merge any in-memory entries not yet on disk
    const byId = new Map<string, NotificationOutboxEntry>();
    for (const item of fromDisk) byId.set(item.id, item);
    for (const item of memoryOutbox) byId.set(item.id, item);
    return Array.from(byId.values());
  }
  return [...memoryOutbox];
}

function persistOutboxEntry(entry: NotificationOutboxEntry, inMemoryOnly = false): void {
  memoryOutbox = [entry, ...memoryOutbox.filter((e) => e.id !== entry.id)];
  if (!inMemoryOnly && process.env.NOTIFICATION_OUTBOX_MEMORY_ONLY !== 'true') {
    const all = loadAllOutboxEntries();
    const merged = [entry, ...all.filter((e) => e.id !== entry.id)];
    writeDiskOutbox(merged);
  }
}

/** Clear outbox entries in memory and on disk (intended for unit tests). */
export function clearNotificationOutbox(options?: { memoryOnly?: boolean }): void {
  memoryOutbox = [];
  memorySeq = 0;
  if (!options?.memoryOnly) {
    try {
      const filePath = getNotificationOutboxFilePath();
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting & HTML Escaping Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLabel(dateValue: string | Date): string {
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 10);
  }
  return String(dateValue).trim().slice(0, 10);
}

function toMoneyNumber(value: number | string | Prisma.Decimal | undefined, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  return fromCentavos(toCentavos(value));
}

function renderEmailShell(params: {
  badgeText: string;
  badgeColor: string;
  badgeBg: string;
  heading: string;
  participantName: string;
  referenceNumber: string;
  sacramentLabel: string;
  leadHtml: string;
  detailsHtml: string;
  customMessage?: string | null;
  actionUrl: string;
  actionLabel: string;
  secondaryUrl?: string;
  secondaryLabel?: string;
}): string {
  const customNoteBlock =
    params.customMessage && params.customMessage.trim()
      ? `
        <div style="margin: 20px 0; padding: 14px 16px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 6px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1e40af; margin-bottom: 4px;">
            Note from the Parish Office
          </div>
          <div style="font-size: 14px; color: #1e3a8a; line-height: 1.5;">
            ${escapeHtml(params.customMessage.trim())}
          </div>
        </div>
      `
      : '';

  const secondaryActionBlock =
    params.secondaryUrl && params.secondaryLabel
      ? `
        <p style="margin: 12px 0 0 0; font-size: 13px; color: #475569;">
          Or visit: <a href="${escapeHtml(params.secondaryUrl)}" style="color: #1d4ed8; text-decoration: underline;">${escapeHtml(params.secondaryLabel)}</a>
        </p>
      `
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.heading)} — ${escapeHtml(CHURCH_NAME)}</title>
  </head>
  <body style="margin: 0; padding: 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%); padding: 22px 24px; color: #ffffff;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9;">
          Diocese of Urdaneta • ${escapeHtml(DEFAULT_CITY)}, ${escapeHtml(DEFAULT_PROVINCE)}
        </div>
        <h1 style="margin: 4px 0 0 0; font-size: 20px; font-weight: 700;">
          ${escapeHtml(CHURCH_NAME)}
        </h1>
      </div>

      <div style="padding: 24px;">
        <div style="margin-bottom: 14px;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: ${params.badgeBg}; color: ${params.badgeColor};">
            ${escapeHtml(params.badgeText)}
          </span>
          <span style="display: inline-block; margin-left: 8px; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 700; background-color: #f1f5f9; color: #334155;">
            ${escapeHtml(params.referenceNumber)}
          </span>
        </div>

        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">
          ${escapeHtml(params.heading)}
        </h2>

        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          Peace be with you, <strong>${escapeHtml(params.participantName)}</strong>,
        </p>

        <div style="font-size: 14px; line-height: 1.6; color: #334155;">
          ${params.leadHtml}
        </div>

        <div style="margin: 18px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
          ${params.detailsHtml}
        </div>

        ${customNoteBlock}

        <div style="margin: 24px 0 16px 0;">
          <a href="${escapeHtml(params.actionUrl)}" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 22px; border-radius: 8px;">
            ${escapeHtml(params.actionLabel)}
          </a>
          ${secondaryActionBlock}
        </div>

        <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b; word-break: break-all;">
          Direct link: <a href="${escapeHtml(params.actionUrl)}" style="color: #2563eb;">${escapeHtml(params.actionUrl)}</a>
        </p>
      </div>

      <div style="padding: 16px 24px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
        <strong>${escapeHtml(CHURCH_NAME)}</strong> • ${escapeHtml(DEFAULT_CITY)}, ${escapeHtml(DEFAULT_PROVINCE)}<br />
        Keep your booking reference <strong>${escapeHtml(params.referenceNumber)}</strong> for status inquiries and office transactions.
      </div>
    </div>
  </body>
</html>`.trim();
}

// ---------------------------------------------------------------------------
// Template Rendering & HTML Preview
// ---------------------------------------------------------------------------

export function previewNotificationHtml(
  template: NotificationTemplate,
  context: ParishNotificationContext
): RenderedNotificationEmail;
export function previewNotificationHtml(
  input: ParishNotificationContext & { template: NotificationTemplate }
): RenderedNotificationEmail;
export function previewNotificationHtml(
  templateOrInput:
    | NotificationTemplate
    | (ParishNotificationContext & { template: NotificationTemplate }),
  maybeContext?: ParishNotificationContext
): RenderedNotificationEmail {
  const template: NotificationTemplate =
    typeof templateOrInput === 'string' ? templateOrInput : templateOrInput.template;
  const context: ParishNotificationContext =
    typeof templateOrInput === 'string' ? maybeContext! : templateOrInput;

  const baseUrl = getAppBaseUrl(context.appBaseUrl);
  const ref = context.referenceNumber.trim();
  const sacramentLabel = SACRAMENT_LABELS[context.sacramentType] || context.sacramentType;
  const dateLabel = formatDateLabel(context.scheduledDate);
  const timeLabel = context.scheduledTime;
  const locationLabel = context.location || CHURCH_NAME;
  const trackUrl = `${baseUrl}/track?ref=${encodeURIComponent(ref)}`;
  const passUrl = `${baseUrl}/pass/${encodeURIComponent(ref)}`;

  switch (template) {
    case 'BOOKING_RECEIVED': {
      const subject = `[${CHURCH_NAME}] Booking Request Received — ${ref} (${sacramentLabel})`;
      const reqListHtml =
        context.requirementsSummary && context.requirementsSummary.length > 0
          ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                Required Documents &amp; Preparations
              </div>
              <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #334155;">
                ${context.requirementsSummary
                  .map((r) => `<li style="margin-bottom: 4px;">${escapeHtml(r.label)}</li>`)
                  .join('')}
              </ul>
            </div>
          `
          : '';

      const html = renderEmailShell({
        badgeText: 'PENDING PARISH REVIEW',
        badgeColor: '#92400e',
        badgeBg: '#fef3c7',
        heading: `${sacramentLabel} Booking Request Received`,
        participantName: context.participantName,
        referenceNumber: ref,
        sacramentLabel,
        leadHtml: `<p style="margin: 0;">We have received your <strong>${escapeHtml(sacramentLabel)}</strong> booking request. Your slot is currently marked <strong>PENDING</strong> while the parish office reviews your schedule, assigns a priest, and assesses the Arancel fee.</p>`,
        detailsHtml: `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace;">${escapeHtml(ref)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Sacrament:</td>
              <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(sacramentLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Requested Schedule:</td>
              <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Location:</td>
              <td style="padding: 4px 0;">${escapeHtml(locationLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Current Status:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #b45309;">PENDING (Awaiting Parish Confirmation)</td>
            </tr>
          </table>
          ${reqListHtml}
        `,
        customMessage: context.customMessage,
        actionUrl: trackUrl,
        actionLabel: 'Track Booking Status & Checklist',
      });

      return {
        template,
        subject,
        html,
        textSummary: `Booking request ${ref} for ${sacramentLabel} on ${dateLabel} at ${timeLabel} received and pending parish review. Track at ${trackUrl}`,
        actionUrl: trackUrl,
        actionLabel: 'Track Booking Status & Checklist',
      };
    }

    case 'FEE_ASSESSED': {
      const feeAmount = toMoneyNumber(context.fee, 0);
      const paidAmount = toMoneyNumber(context.amountPaid, 0);
      const balanceAmount =
        context.balanceDue !== undefined
          ? toMoneyNumber(context.balanceDue, 0)
          : fromCentavos(balanceDueCentavos(feeAmount, toCentavos(paidAmount)));

      const feeFormatted = formatCurrencyPlain(feeAmount);
      const paidFormatted = formatCurrencyPlain(paidAmount);
      const balanceFormatted = formatCurrencyPlain(balanceAmount);

      const subject = `[${CHURCH_NAME}] Arancel Fee Assessment (${balanceFormatted}) — ${ref}`;
      const html = renderEmailShell({
        badgeText: 'ARANCEL FEE ASSESSED',
        badgeColor: '#1e40af',
        badgeBg: '#dbeafe',
        heading: `Arancel Fee Ready for Online or Office Payment`,
        participantName: context.participantName,
        referenceNumber: ref,
        sacramentLabel,
        leadHtml: `<p style="margin: 0;">The parish office has assessed the Arancel fee for your <strong>${escapeHtml(sacramentLabel)}</strong> request (<strong>${escapeHtml(ref)}</strong>). You may now pay securely online via GCash, Maya, or Bank Transfer, or settle in person at the parish cashier office.</p>`,
        detailsHtml: `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace;">${escapeHtml(ref)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Sacrament &amp; Schedule:</td>
              <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(sacramentLabel)} • ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Assessed Arancel Fee:</td>
              <td style="padding: 4px 0; font-weight: 700;">${escapeHtml(feeFormatted)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Amount Paid:</td>
              <td style="padding: 4px 0; color: #15803d;">${escapeHtml(paidFormatted)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0 2px 0; color: #0f172a; font-weight: 700; border-top: 1px solid #cbd5e1;">Balance Due:</td>
              <td style="padding: 6px 0 2px 0; font-size: 15px; font-weight: 800; color: #1d4ed8; border-top: 1px solid #cbd5e1;">${escapeHtml(balanceFormatted)}</td>
            </tr>
          </table>
        `,
        customMessage: context.customMessage,
        actionUrl: trackUrl,
        actionLabel: 'Pay Online or View Fee Breakdown',
      });

      return {
        template,
        subject,
        html,
        textSummary: `Arancel fee of ${feeFormatted} (balance due: ${balanceFormatted}) assessed for ${ref}. Pay online at ${trackUrl}`,
        actionUrl: trackUrl,
        actionLabel: 'Pay Online or View Fee Breakdown',
      };
    }

    case 'DOCUMENT_FEEDBACK': {
      const reqStatus = context.requirementStatus ?? 'PENDING_SUBMISSION';
      const reqLabel = context.requirementLabel || 'Sacrament Requirement Checklist';
      const isResubmit = reqStatus === 'RESUBMIT_REQUIRED';
      const isVerified = reqStatus === 'VERIFIED';

      const statusText = isVerified
        ? 'PRE-VERIFIED BY STAFF'
        : isResubmit
          ? 'RESUBMISSION REQUESTED'
          : 'DOCUMENT CHECKLIST REMINDER';
      const badgeColor = isVerified ? '#166534' : isResubmit ? '#991b1b' : '#92400e';
      const badgeBg = isVerified ? '#dcfce7' : isResubmit ? '#fee2e2' : '#fef3c7';

      const subject = isResubmit
        ? `[${CHURCH_NAME}] Action Required: Resubmit "${reqLabel}" — ${ref}`
        : isVerified
          ? `[${CHURCH_NAME}] Document Pre-Verified: "${reqLabel}" — ${ref}`
          : `[${CHURCH_NAME}] Document Checklist Reminder — ${ref}`;

      const checklistRowsHtml =
        context.requirementsSummary && context.requirementsSummary.length > 0
          ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                Current Checklist Status
              </div>
              <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #334155;">
                ${context.requirementsSummary
                  .map(
                    (r) =>
                      `<li style="margin-bottom: 4px;"><strong>${r.isMet ? '✓ Verified' : '○ Pending'}:</strong> ${escapeHtml(r.label)}</li>`
                  )
                  .join('')}
              </ul>
            </div>
          `
          : '';

      const leadMessage = isVerified
        ? `<p style="margin: 0;">The parish office has pre-verified your requirement <strong>${escapeHtml(reqLabel)}</strong> for your <strong>${escapeHtml(sacramentLabel)}</strong> booking (<strong>${escapeHtml(ref)}</strong>). Please still bring the original hardcopy on your scheduled ceremony date.</p>`
        : isResubmit
          ? `<p style="margin: 0;">The parish office reviewed your requirement <strong>${escapeHtml(reqLabel)}</strong> for booking <strong>${escapeHtml(ref)}</strong> and requested a correction or resubmission before your schedule can be finalized.</p>`
          : `<p style="margin: 0;">Here is an update on the document requirements for your <strong>${escapeHtml(sacramentLabel)}</strong> booking (<strong>${escapeHtml(ref)}</strong>).</p>`;

      const html = renderEmailShell({
        badgeText: statusText,
        badgeColor,
        badgeBg,
        heading: `Requirement Update: ${reqLabel}`,
        participantName: context.participantName,
        referenceNumber: ref,
        sacramentLabel,
        leadHtml: leadMessage,
        detailsHtml: `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace;">${escapeHtml(ref)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Document / Item:</td>
              <td style="padding: 4px 0; font-weight: 700;">${escapeHtml(reqLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Verification Status:</td>
              <td style="padding: 4px 0; font-weight: 700; color: ${badgeColor};">${escapeHtml(statusText)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Scheduled Date:</td>
              <td style="padding: 4px 0;">${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</td>
            </tr>
          </table>
          ${checklistRowsHtml}
        `,
        customMessage: context.customMessage,
        actionUrl: trackUrl,
        actionLabel: 'View Requirements Checklist',
      });

      return {
        template,
        subject,
        html,
        textSummary: `Document feedback for ${ref} (${reqLabel}): ${statusText}. Check status at ${trackUrl}`,
        actionUrl: trackUrl,
        actionLabel: 'View Requirements Checklist',
      };
    }

    case 'SCHEDULE_CONFIRMED': {
      const priestLabel = context.assignedPriestName || 'Assigned Parish Priest';
      const subject = `[${CHURCH_NAME}] Schedule Confirmed & QR Pass — ${ref} (${sacramentLabel})`;

      const html = renderEmailShell({
        badgeText: 'CONFIRMED SCHEDULE',
        badgeColor: '#166534',
        badgeBg: '#dcfce7',
        heading: `Your ${sacramentLabel} Schedule is Confirmed!`,
        participantName: context.participantName,
        referenceNumber: ref,
        sacramentLabel,
        leadHtml: `<p style="margin: 0;">We are pleased to confirm your <strong>${escapeHtml(sacramentLabel)}</strong> schedule at <strong>${escapeHtml(CHURCH_NAME)}</strong>. Present your digital or printed <strong>QR Confirmation Pass</strong> at the parish office on the day of your sacrament.</p>`,
        detailsHtml: `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace;">${escapeHtml(ref)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Sacrament:</td>
              <td style="padding: 4px 0; font-weight: 700;">${escapeHtml(sacramentLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Confirmed Date &amp; Time:</td>
              <td style="padding: 4px 0; font-weight: 700; color: #15803d;">${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Assigned Priest:</td>
              <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(priestLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Venue / Location:</td>
              <td style="padding: 4px 0;">${escapeHtml(locationLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">QR Confirmation Pass:</td>
              <td style="padding: 4px 0; font-family: monospace;"><a href="${escapeHtml(passUrl)}" style="color: #1d4ed8;">${escapeHtml(passUrl)}</a></td>
            </tr>
          </table>
        `,
        customMessage: context.customMessage,
        actionUrl: passUrl,
        actionLabel: 'Open QR Confirmation Pass',
        secondaryUrl: trackUrl,
        secondaryLabel: 'Track Booking & Payment Receipt',
      });

      return {
        template,
        subject,
        html,
        textSummary: `${sacramentLabel} (${ref}) confirmed for ${dateLabel} at ${timeLabel} with ${priestLabel}. QR Pass: ${passUrl}`,
        actionUrl: passUrl,
        actionLabel: 'Open QR Confirmation Pass',
      };
    }

    case 'APPOINTMENT_CANCELLED': {
      const reasonText = context.cancelReason || 'Cancelled by the parish office';
      const disposition = context.paymentDisposition || 'NONE';
      const refundedNum = toMoneyNumber(context.refundedAmount, 0);
      const paidNum = toMoneyNumber(context.amountPaid, refundedNum);

      let dispositionLabel = 'No payment was collected for this booking.';
      if (disposition === 'REFUND') {
        const amt = refundedNum > 0 ? formatCurrencyPlain(refundedNum) : formatCurrencyPlain(paidNum);
        dispositionLabel = `REFUNDED — ${amt} reversed in the parish ledger for refund.`;
      } else if (disposition === 'FORFEIT') {
        const amt = paidNum > 0 ? ` (${formatCurrencyPlain(paidNum)})` : '';
        dispositionLabel = `FORFEITED — Previously received payment${amt} retained per parish cancellation policy.`;
      }

      const subject = `[${CHURCH_NAME}] Appointment Cancellation Notice — ${ref}`;
      const html = renderEmailShell({
        badgeText: 'CANCELLED',
        badgeColor: '#991b1b',
        badgeBg: '#fee2e2',
        heading: `${sacramentLabel} Appointment Cancelled`,
        participantName: context.participantName,
        referenceNumber: ref,
        sacramentLabel,
        leadHtml: `<p style="margin: 0;">Your <strong>${escapeHtml(sacramentLabel)}</strong> appointment (<strong>${escapeHtml(ref)}</strong>) originally scheduled for <strong>${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</strong> has been cancelled.</p>`,
        detailsHtml: `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace;">${escapeHtml(ref)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Sacrament &amp; Schedule:</td>
              <td style="padding: 4px 0;">${escapeHtml(sacramentLabel)} • ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Cancellation Reason:</td>
              <td style="padding: 4px 0; font-weight: 700; color: #b91c1c;">${escapeHtml(reasonText)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Payment Disposition:</td>
              <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(dispositionLabel)}</td>
            </tr>
          </table>
        `,
        customMessage: context.customMessage,
        actionUrl: trackUrl,
        actionLabel: 'View Booking Record',
      });

      return {
        template,
        subject,
        html,
        textSummary: `Appointment ${ref} (${sacramentLabel}) cancelled. Reason: ${reasonText}. Payment disposition: ${disposition}.`,
        actionUrl: trackUrl,
        actionLabel: 'View Booking Record',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch & Outbox Query
// ---------------------------------------------------------------------------

/**
 * Render, dispatch (via Resend API when RESEND_API_KEY is configured, otherwise
 * LOCAL_OUTBOX), persist to `.data/notification-outbox.json` (and in-memory),
 * and write an `AuditLog` entry (`notification.dispatched`).
 */
export async function dispatchParishNotification(
  input: DispatchParishNotificationInput
): Promise<NotificationOutboxEntry> {
  const recipientEmail = (input.recipientEmail || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new ApiError(
      400,
      'A valid recipient email address is required to dispatch a parish notification.',
      'INVALID_RECIPIENT_EMAIL'
    );
  }

  const rendered = previewNotificationHtml(input.template, {
    ...input,
    recipientEmail,
  });

  let deliveryMode: 'RESEND_API' | 'LOCAL_OUTBOX' = 'LOCAL_OUTBOX';
  let providerMessageId: string | null = null;
  const fetchFn = input.fetchImpl ?? fetch;

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || `${CHURCH_NAME} <onboarding@resend.dev>`,
          to: [recipientEmail],
          subject: rendered.subject,
          html: rendered.html,
        }),
      });
      if (res.ok) {
        deliveryMode = 'RESEND_API';
        try {
          const data = (await res.json()) as { id?: string };
          providerMessageId = data?.id ?? null;
        } catch {
          providerMessageId = null;
        }
      }
    } catch {
      deliveryMode = 'LOCAL_OUTBOX';
    }
  }

  const actor = input.actor ?? SYSTEM_ACTOR;
  const now = input.now ?? new Date();
  memorySeq += 1;

  const entry: NotificationOutboxEntry = {
    id: crypto.randomUUID(),
    appointmentId: input.appointmentId ?? null,
    referenceNumber: input.referenceNumber.trim(),
    sacramentType: input.sacramentType,
    participantName: input.participantName,
    recipientEmail,
    template: input.template,
    subject: rendered.subject,
    html: rendered.html,
    textSummary: rendered.textSummary,
    actionUrl: rendered.actionUrl,
    actionLabel: rendered.actionLabel,
    deliveryMode,
    providerMessageId,
    customMessage: input.customMessage?.trim() || null,
    triggeredBy: {
      actorType: actor.type,
      actorId: actor.type === 'USER' ? actor.id : null,
      actorName: actor.type === 'USER' ? actor.name : null,
      actorRole: actor.type === 'USER' ? actor.role : null,
    },
    metadata: {
      seq: memorySeq,
      scheduledDate: formatDateLabel(input.scheduledDate),
      scheduledTime: input.scheduledTime,
      ...(input.fee !== undefined ? { fee: toMoneyNumber(input.fee) } : {}),
      ...(input.assignedPriestName ? { assignedPriestName: input.assignedPriestName } : {}),
      ...(input.requirementLabel ? { requirementLabel: input.requirementLabel } : {}),
      ...(input.requirementStatus ? { requirementStatus: input.requirementStatus } : {}),
      ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
      ...(input.paymentDisposition ? { paymentDisposition: input.paymentDisposition } : {}),
    },
    dispatchedAt: now.toISOString(),
  };

  persistOutboxEntry(entry, input.inMemoryOnly);

  if (!input.skipAudit && input.db !== null) {
    const auditPayload = {
      actor,
      action: 'notification.dispatched',
      entityType: 'Appointment' as const,
      entityId: input.appointmentId || input.referenceNumber,
      after: {
        notificationId: entry.id,
        template: entry.template,
        referenceNumber: entry.referenceNumber,
        deliveryMode: entry.deliveryMode,
      },
      reason: entry.customMessage ?? null,
    };

    if (input.db) {
      await writeAudit(input.db, auditPayload);
    } else if (input.appointmentId) {
      try {
        await writeAudit(prisma, auditPayload);
      } catch {
        // Ignore DB error when running in pure unit tests without a live DB transaction
      }
    }
  }

  return entry;
}

/**
 * List notifications from the outbox with optional filters (`referenceNumber`,
 * `recipientEmail`, `template`, `appointmentId`, `limit`), newest first.
 */
export function listNotificationOutbox(
  filters?: NotificationOutboxFilters
): NotificationOutboxEntry[] {
  const entries = loadAllOutboxEntries();

  const filtered = entries.filter((item) => {
    if (filters?.referenceNumber) {
      const q = filters.referenceNumber.trim().toLowerCase();
      if (q && !item.referenceNumber.toLowerCase().includes(q)) return false;
    }
    if (filters?.recipientEmail) {
      const q = filters.recipientEmail.trim().toLowerCase();
      if (q && !item.recipientEmail.toLowerCase().includes(q)) return false;
    }
    if (filters?.template) {
      const t = filters.template.trim();
      if (t && item.template !== t) return false;
    }
    if (filters?.appointmentId) {
      const a = filters.appointmentId.trim();
      if (a && item.appointmentId !== a) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const timeDiff = new Date(b.dispatchedAt).getTime() - new Date(a.dispatchedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    const seqA = typeof a.metadata?.seq === 'number' ? a.metadata.seq : 0;
    const seqB = typeof b.metadata?.seq === 'number' ? b.metadata.seq : 0;
    return seqB - seqA;
  });

  if (filters?.limit && filters.limit > 0) {
    return filtered.slice(0, filters.limit);
  }
  return filtered;
}

/**
 * Load an appointment from Prisma and dispatch a notification template for it.
 * Used by `POST /api/notifications` and staff one-click actions.
 */
export async function dispatchAppointmentNotificationById(params: {
  appointmentId: string;
  template: NotificationTemplate;
  customMessage?: string | null;
  requirementLabel?: string | null;
  requirementStatus?: RequirementFeedbackStatus;
  paymentDisposition?: 'REFUND' | 'FORFEIT' | 'NONE' | null;
  refundedAmount?: number;
  actor?: AuditActor;
  appBaseUrl?: string | null;
}): Promise<NotificationOutboxEntry> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, deletedAt: null },
    include: {
      assignedPriest: { select: { name: true } },
      createdBy: { select: { email: true } },
      payments: { where: { deletedAt: null }, select: { amount: true, kind: true } },
      requirements: { select: { label: true, isMet: true }, orderBy: { label: 'asc' } },
    },
  });

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  const recipientEmail =
    appointment.participantEmail?.trim() ||
    (appointment.source === 'ONLINE' ? appointment.createdBy?.email?.trim() : null);

  if (!recipientEmail) {
    throw new ApiError(
      400,
      'This appointment does not have a participant email address on file.',
      'MISSING_RECIPIENT_EMAIL'
    );
  }

  const paidCentavos = sumCentavos(appointment.payments.map((p) => p.amount));
  const amountPaid = fromCentavos(paidCentavos);
  const balanceDue = fromCentavos(balanceDueCentavos(appointment.fee, paidCentavos));
  const reversalCentavos = sumCentavos(
    appointment.payments
      .filter((p) => p.kind === 'REVERSAL')
      .map((p) => p.amount)
  );
  const refundedAmount =
    params.refundedAmount !== undefined
      ? params.refundedAmount
      : reversalCentavos < 0
        ? fromCentavos(Math.abs(reversalCentavos))
        : 0;

  const inferredDisposition: 'REFUND' | 'FORFEIT' | 'NONE' =
    params.paymentDisposition ??
    (refundedAmount > 0 ? 'REFUND' : amountPaid > 0 ? 'FORFEIT' : 'NONE');

  const unmetReq = appointment.requirements.find((r) => !r.isMet);

  return dispatchParishNotification({
    template: params.template,
    appointmentId: appointment.id,
    referenceNumber: appointment.referenceNumber,
    sacramentType: appointment.sacramentType,
    participantName: appointment.participantName,
    recipientEmail,
    scheduledDate: appointment.scheduledDate,
    scheduledTime: appointment.scheduledTime,
    location: appointment.location,
    fee: appointment.fee,
    amountPaid,
    balanceDue,
    assignedPriestName: appointment.assignedPriest?.name ?? null,
    requirementLabel:
      params.requirementLabel ?? unmetReq?.label ?? appointment.requirements[0]?.label ?? null,
    requirementStatus:
      params.requirementStatus ?? (unmetReq ? 'RESUBMIT_REQUIRED' : 'VERIFIED'),
    requirementsSummary: appointment.requirements,
    cancelReason: appointment.cancelReason,
    paymentDisposition: inferredDisposition,
    refundedAmount,
    customMessage: params.customMessage ?? null,
    appBaseUrl: params.appBaseUrl,
    actor: params.actor ?? SYSTEM_ACTOR,
    db: prisma,
  });
}
