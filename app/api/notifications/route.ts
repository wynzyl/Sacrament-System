// app/api/notifications/route.ts
// Parish Email Notification Outbox API (FEAT-S3).
// GET  (/api/notifications) — (ADMIN, CASHIER) list dispatched notifications
//      filterable by referenceNumber, recipientEmail, template, appointmentId.
// POST (/api/notifications) — (ADMIN, CASHIER) send or resend a notification
//      for a given appointmentId and template with optional customMessage.

import { NextRequest } from 'next/server';
import { errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { userActor } from '@/lib/audit';
import { notificationQuerySchema, notificationSendSchema } from '@/lib/validation';
import {
  dispatchAppointmentNotificationById,
  listNotificationOutbox,
} from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    await requireUser(['ADMIN', 'CASHIER'], 'Only parish staff can view the email notification outbox');

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    // Strip empty query strings so optional enum/number fields parse cleanly
    const cleanedParams = Object.fromEntries(
      Object.entries(rawParams).filter(([, value]) => value.trim() !== '')
    );
    const filters = notificationQuerySchema.parse(cleanedParams);

    const items = listNotificationOutbox(filters);
    return json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error, 'GET /api/notifications');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(
      ['ADMIN', 'CASHIER'],
      'Only parish staff can trigger or resend email notifications'
    );
    const input = await parseBody(request, notificationSendSchema);

    const notification = await dispatchAppointmentNotificationById({
      appointmentId: input.appointmentId,
      template: input.template,
      customMessage: input.customMessage,
      requirementLabel: input.requirementLabel,
      requirementStatus: input.requirementStatus,
      actor: userActor(user),
      appBaseUrl: request.headers.get('origin'),
    });

    return json({ notification }, 201);
  } catch (error) {
    return errorResponse(error, 'POST /api/notifications');
  }
}
