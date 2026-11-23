import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearNotificationOutbox,
  dispatchParishNotification,
  getNotificationOutboxFilePath,
  listNotificationOutbox,
  previewNotificationHtml,
} from '@/lib/notifications';
import { SYSTEM_ACTOR, userActor } from '@/lib/audit';

describe('FEAT-S3 Parish Email Notification Outbox (lib/notifications.ts)', () => {
  const prevOutboxFile = process.env.NOTIFICATION_OUTBOX_FILE;
  const prevResendKey = process.env.RESEND_API_KEY;
  let tempOutboxFile: string;

  beforeEach(() => {
    tempOutboxFile = path.join(
      os.tmpdir(),
      `parish-notification-outbox-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.NOTIFICATION_OUTBOX_FILE = tempOutboxFile;
    delete process.env.RESEND_API_KEY;
    clearNotificationOutbox();
  });

  afterEach(() => {
    clearNotificationOutbox();
    try {
      if (fs.existsSync(tempOutboxFile)) fs.unlinkSync(tempOutboxFile);
    } catch {
      // Ignore temp cleanup failure
    }
    if (prevOutboxFile === undefined) delete process.env.NOTIFICATION_OUTBOX_FILE;
    else process.env.NOTIFICATION_OUTBOX_FILE = prevOutboxFile;

    if (prevResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResendKey;
  });

  it('renders BOOKING_RECEIVED subject and HTML with reference number, sacrament, and tracking link', () => {
    const rendered = previewNotificationHtml('BOOKING_RECEIVED', {
      referenceNumber: 'SAC-2026-BAP777',
      sacramentType: 'BAPTISM',
      participantName: 'Baby Mateo Santos',
      recipientEmail: 'santos.family@gmail.com',
      scheduledDate: '2026-12-19',
      scheduledTime: '10:00',
      requirementsSummary: [
        { label: "Child's PSA or Local Civil Registrar Birth Certificate", isMet: false },
      ],
      appBaseUrl: 'https://cathedral.urdaneta.ph',
    });

    expect(rendered.template).toBe('BOOKING_RECEIVED');
    expect(rendered.subject).toContain('Immaculate Conception Cathedral Parish');
    expect(rendered.subject).toContain('SAC-2026-BAP777');
    expect(rendered.subject).toContain('Baptism');
    expect(rendered.actionUrl).toBe('https://cathedral.urdaneta.ph/track?ref=SAC-2026-BAP777');
    expect(rendered.html).toContain('Baby Mateo Santos');
    expect(rendered.html).toContain('PENDING PARISH REVIEW');
    expect(rendered.html).toContain('Birth Certificate');
    expect(rendered.html).toContain('https://cathedral.urdaneta.ph/track?ref=SAC-2026-BAP777');
  });

  it('renders FEE_ASSESSED subject and HTML with Arancel fee breakdown and /track?ref=... online payment link', () => {
    const rendered = previewNotificationHtml('FEE_ASSESSED', {
      referenceNumber: 'SAC-2026-WED888',
      sacramentType: 'WEDDING',
      participantName: 'Carlo & Maria Mendoza',
      recipientEmail: 'carlo.maria@gmail.com',
      scheduledDate: '2027-01-15',
      scheduledTime: '09:00',
      fee: 3500,
      amountPaid: 1000,
      balanceDue: 2500,
      customMessage: 'You may pay via GCash, Maya, or BPI Online using the tracking portal.',
      appBaseUrl: 'http://localhost:3000',
    });

    expect(rendered.template).toBe('FEE_ASSESSED');
    expect(rendered.subject).toContain('Arancel Fee Assessment');
    expect(rendered.subject).toContain('SAC-2026-WED888');
    expect(rendered.actionUrl).toBe('http://localhost:3000/track?ref=SAC-2026-WED888');
    expect(rendered.html).toContain('ARANCEL FEE ASSESSED');
    expect(rendered.html).toContain('3,500.00');
    expect(rendered.html).toContain('2,500.00');
    expect(rendered.html).toContain('You may pay via GCash, Maya, or BPI Online');
    expect(rendered.html).toContain('/track?ref=SAC-2026-WED888');
  });

  it('renders DOCUMENT_FEEDBACK for both pre-verified documents and resubmission requests', () => {
    const resubmit = previewNotificationHtml('DOCUMENT_FEEDBACK', {
      referenceNumber: 'SAC-2026-CNF321',
      sacramentType: 'CONFIRMATION',
      participantName: 'Angela Reyes',
      recipientEmail: 'angela.reyes@gmail.com',
      scheduledDate: '2026-12-20',
      scheduledTime: '14:00',
      requirementLabel: 'Baptismal Certificate (annotated "For Confirmation")',
      requirementStatus: 'RESUBMIT_REQUIRED',
      customMessage: 'Uploaded copy is blurry; please bring or re-send a clear copy with parish seal.',
      appBaseUrl: 'http://localhost:3000',
    });

    expect(resubmit.subject).toContain('Action Required');
    expect(resubmit.subject).toContain('SAC-2026-CNF321');
    expect(resubmit.html).toContain('RESUBMISSION REQUESTED');
    expect(resubmit.html).toContain('Uploaded copy is blurry');
    expect(resubmit.html).toContain('Baptismal Certificate');

    const verified = previewNotificationHtml('DOCUMENT_FEEDBACK', {
      referenceNumber: 'SAC-2026-CNF321',
      sacramentType: 'CONFIRMATION',
      participantName: 'Angela Reyes',
      recipientEmail: 'angela.reyes@gmail.com',
      scheduledDate: '2026-12-20',
      scheduledTime: '14:00',
      requirementLabel: 'Confirmation Seminar Attendance',
      requirementStatus: 'VERIFIED',
      appBaseUrl: 'http://localhost:3000',
    });

    expect(verified.subject).toContain('Document Pre-Verified');
    expect(verified.html).toContain('PRE-VERIFIED BY STAFF');
    expect(verified.html).toContain('Confirmation Seminar Attendance');
  });

  it('renders SCHEDULE_CONFIRMED with assigned priest, date/time, and QR Pass link (/pass/SAC-...)', () => {
    const rendered = previewNotificationHtml('SCHEDULE_CONFIRMED', {
      referenceNumber: 'SAC-2026-BAP999',
      sacramentType: 'BAPTISM',
      participantName: 'Baby Lucas Aquino',
      recipientEmail: 'aquino.family@gmail.com',
      scheduledDate: '2026-12-27',
      scheduledTime: '11:00',
      assignedPriestName: 'Rev. Fr. Roberto Villanueva',
      location: 'Immaculate Conception Cathedral Parish',
      appBaseUrl: 'http://localhost:3000',
    });

    expect(rendered.template).toBe('SCHEDULE_CONFIRMED');
    expect(rendered.subject).toContain('Schedule Confirmed & QR Pass');
    expect(rendered.subject).toContain('SAC-2026-BAP999');
    expect(rendered.actionUrl).toBe('http://localhost:3000/pass/SAC-2026-BAP999');
    expect(rendered.html).toContain('Rev. Fr. Roberto Villanueva');
    expect(rendered.html).toContain('2026-12-27 at 11:00');
    expect(rendered.html).toContain('http://localhost:3000/pass/SAC-2026-BAP999');
  });

  it('renders APPOINTMENT_CANCELLED with cancellation reason and refund/forfeit payment disposition', () => {
    const refunded = previewNotificationHtml('APPOINTMENT_CANCELLED', {
      referenceNumber: 'SAC-2026-CAN100',
      sacramentType: 'WEDDING',
      participantName: 'Paolo & Sofia Garcia',
      recipientEmail: 'paolo.sofia@gmail.com',
      scheduledDate: '2027-02-14',
      scheduledTime: '10:00',
      cancelReason: 'Family requested postponement due to overseas travel',
      paymentDisposition: 'REFUND',
      refundedAmount: 2000,
      appBaseUrl: 'http://localhost:3000',
    });

    expect(refunded.template).toBe('APPOINTMENT_CANCELLED');
    expect(refunded.subject).toContain('Appointment Cancellation Notice');
    expect(refunded.subject).toContain('SAC-2026-CAN100');
    expect(refunded.html).toContain('Family requested postponement due to overseas travel');
    expect(refunded.html).toContain('REFUNDED');
    expect(refunded.html).toContain('2,000.00');

    const forfeited = previewNotificationHtml('APPOINTMENT_CANCELLED', {
      referenceNumber: 'SAC-2026-CAN101',
      sacramentType: 'BAPTISM',
      participantName: 'Baby Noel',
      recipientEmail: 'noel@gmail.com',
      scheduledDate: '2026-12-28',
      scheduledTime: '09:00',
      cancelReason: 'No-show on ceremony date',
      paymentDisposition: 'FORFEIT',
      amountPaid: 500,
      appBaseUrl: 'http://localhost:3000',
    });

    expect(forfeited.html).toContain('FORFEITED');
    expect(forfeited.html).toContain('500.00');
  });

  it('persists dispatched notifications to the JSON outbox, writes AuditLog entries, supports RESEND_API, and filters by referenceNumber, recipientEmail, and template', async () => {
    const auditLogs: unknown[] = [];
    const mockDb = {
      auditLog: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          auditLogs.push(data);
          return data;
        }),
      },
    } as unknown as Parameters<typeof dispatchParishNotification>[0]['db'];

    const staffActor = userActor({
      id: 'staff-admin-1',
      name: 'Cathedral Secretary',
      role: 'ADMIN',
    });

    // 1. Dispatch BOOKING_RECEIVED in LOCAL_OUTBOX mode
    const n1 = await dispatchParishNotification({
      template: 'BOOKING_RECEIVED',
      appointmentId: 'apt-001',
      referenceNumber: 'SAC-2026-ALPHA2',
      sacramentType: 'BAPTISM',
      participantName: 'Baby Alpha',
      recipientEmail: 'Alpha.Family@Gmail.com',
      scheduledDate: '2026-12-21',
      scheduledTime: '09:00',
      actor: SYSTEM_ACTOR,
      db: mockDb,
      now: new Date('2026-11-24T01:00:00.000Z'),
    });

    expect(n1.deliveryMode).toBe('LOCAL_OUTBOX');
    expect(n1.recipientEmail).toBe('alpha.family@gmail.com');

    // 2. Dispatch FEE_ASSESSED in LOCAL_OUTBOX mode
    const n2 = await dispatchParishNotification({
      template: 'FEE_ASSESSED',
      appointmentId: 'apt-001',
      referenceNumber: 'SAC-2026-ALPHA2',
      sacramentType: 'BAPTISM',
      participantName: 'Baby Alpha',
      recipientEmail: 'alpha.family@gmail.com',
      scheduledDate: '2026-12-21',
      scheduledTime: '09:00',
      fee: 800,
      balanceDue: 800,
      customMessage: 'Arancel fee assessed by parish cashier',
      actor: staffActor,
      db: mockDb,
      now: new Date('2026-11-24T02:00:00.000Z'),
    });

    expect(n2.triggeredBy.actorName).toBe('Cathedral Secretary');

    // 3. Dispatch SCHEDULE_CONFIRMED via mocked RESEND_API
    process.env.RESEND_API_KEY = 're_test_mock_key';
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 're_msg_12345' }), { status: 200 });
    }) as unknown as typeof fetch;

    const n3 = await dispatchParishNotification({
      template: 'SCHEDULE_CONFIRMED',
      appointmentId: 'apt-002',
      referenceNumber: 'SAC-2026-BRAVO9',
      sacramentType: 'WEDDING',
      participantName: 'Bravo Couple',
      recipientEmail: 'bravo.couple@yahoo.com',
      scheduledDate: '2026-12-28',
      scheduledTime: '14:00',
      assignedPriestName: 'Rev. Fr. Jose Gomez',
      actor: staffActor,
      db: mockDb,
      fetchImpl: mockFetch,
      now: new Date('2026-11-24T03:00:00.000Z'),
    });

    expect(n3.deliveryMode).toBe('RESEND_API');
    expect(n3.providerMessageId).toBe('re_msg_12345');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify JSON outbox file was persisted on disk
    const outboxPath = getNotificationOutboxFilePath();
    expect(fs.existsSync(outboxPath)).toBe(true);
    const diskContents = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
    expect(diskContents).toHaveLength(3);

    // Verify AuditLog entries were written for all 3 dispatches
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs[0]).toMatchObject({
      action: 'notification.dispatched',
      entityType: 'Appointment',
      entityId: 'apt-001',
    });

    // Verify filtering by referenceNumber, recipientEmail, and template
    const all = listNotificationOutbox();
    expect(all.map((i) => i.id)).toEqual([n3.id, n2.id, n1.id]);

    const byRef = listNotificationOutbox({ referenceNumber: 'SAC-2026-ALPHA2' });
    expect(byRef).toHaveLength(2);
    expect(byRef.every((i) => i.referenceNumber === 'SAC-2026-ALPHA2')).toBe(true);

    const byEmail = listNotificationOutbox({ recipientEmail: 'BRAVO.COUPLE@YAHOO.COM' });
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0].id).toBe(n3.id);

    const byTemplate = listNotificationOutbox({ template: 'FEE_ASSESSED' });
    expect(byTemplate).toHaveLength(1);
    expect(byTemplate[0].id).toBe(n2.id);
  });
});
