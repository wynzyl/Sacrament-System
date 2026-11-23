// lib/payments/onlineProvider.ts
// Online payment provider integration (PayMongo Checkout Sessions API v1 +
// Built-in Local Sandbox Simulator) for Online Wallet (Maya, GCash Express,
// GrabPay, ShopeePay) and Bank Transfer (InstaPay, PESONet, BPI, BDO, UnionBank,
// Metrobank, Landbank).
//
// Constitutional guarantees (Principles I, II, III, VI, VII):
//  1. Hosted checkout only: the application never collects or stores card numbers,
//     bank passwords, or wallet PINs/OTPs.
//  2. Creating a checkout session NEVER records a Payment or confirms a booking.
//  3. Payment records and appointment confirmations are written ONLY from a
//     signature-verified webhook event (`handlePaymentWebhook`) or an authenticated
//     server-side verification call to PayMongo (`verifyOnlinePaymentSession`).
//  4. Webhook handling is idempotent on both `eventId` and `providerRef`, and
//     runs inside a single database transaction holding the appointment row lock.

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import {
  PUBLIC_ACTOR,
  SYSTEM_ACTOR,
  paymentSnapshot,
  writeAudit,
} from '@/lib/audit';
import { balanceDueCentavos, fromCentavos, sumCentavos, toCentavos } from '@/lib/money';
import { normalizeReference } from '@/lib/reference';
import { canTransition } from '@/lib/appointments/stateMachine';
import { TX_OPTIONS } from '@/lib/appointments/service';
import { allocateReceiptNumber } from '@/lib/payments/receipts';
import { lockAppointmentRow, netPaidCentavos } from '@/lib/payments/ledger';
import {
  createPayMongoCheckoutSession,
  isPayMongoConfigured,
  mapPayMongoSourceToChannel,
  parsePayMongoWebhookEvent,
  retrievePayMongoCheckoutSession,
} from '@/lib/payments/paymongo';
import type {
  OnlineCheckoutCreateInput,
  PaymentWebhookEventInput,
} from '@/lib/validation';
import { paymentWebhookEventSchema } from '@/lib/validation';

const DEFAULT_WEBHOOK_SECRET = 'sacrament-system-local-webhook-secret-key-2026';

export function getWebhookSecret(): string {
  return (
    process.env.PAYMONGO_WEBHOOK_SECRET ||
    process.env.PAYMENT_WEBHOOK_SECRET ||
    DEFAULT_WEBHOOK_SECRET
  );
}

export function getProviderName(): string {
  return isPayMongoConfigured() ? 'PAYMONGO' : 'PAYMONGO_SANDBOX';
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 Webhook Signature Verification
// ---------------------------------------------------------------------------

export function signWebhookPayload(rawBody: string, secret = getWebhookSecret()): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Verify `Paymongo-Signature` (`t=<timestamp>,te=<hex>,li=<hex>`) or
 * `x-payment-signature` (hex HMAC-SHA256) in constant time.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret = getWebhookSecret()
): boolean {
  if (!signatureHeader || !signatureHeader.trim()) return false;
  const trimmed = signatureHeader.trim();

  // PayMongo style: t=1700000000,te=abcdef...,li=...
  if (trimmed.includes('t=') && (trimmed.includes('te=') || trimmed.includes('li=') || trimmed.includes('v1='))) {
    const parts = Object.fromEntries(
      trimmed.split(',').map((kv) => {
        const [k, v] = kv.trim().split('=');
        return [k, v ?? ''];
      })
    );
    const timestamp = parts.t;
    const candidates = [parts.te, parts.li, parts.v1].filter(Boolean);
    if (!timestamp || candidates.length === 0) return false;
    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    return candidates.some((c) => safeHexEqual(c, expectedHex));
  }

  const expectedHex = signWebhookPayload(rawBody, secret);
  return safeHexEqual(trimmed, expectedHex);
}

function safeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length || aHex.length === 0) return false;
  try {
    const aBuf = Buffer.from(aHex, 'hex');
    const bBuf = Buffer.from(bHex, 'hex');
    if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contact second-factor check (shared with public tracking)
// ---------------------------------------------------------------------------

function phoneKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

function contactMatches(
  contact: string,
  appt: { participantPhone: string | null; participantEmail: string | null }
): boolean {
  const input = contact.trim();
  if (input.includes('@')) {
    return (
      !!appt.participantEmail &&
      appt.participantEmail.trim().toLowerCase() === input.toLowerCase()
    );
  }
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return false;
  return (
    phoneKey(input) === phoneKey(appt.participantPhone) &&
    phoneKey(appt.participantPhone).length === 10
  );
}

const NOT_FOUND =
  'We could not find a booking with those details. Check the reference number and the phone or email you used.';

// ---------------------------------------------------------------------------
// Create Hosted Checkout Session (PayMongo API v1 or Local PayMongo Sandbox)
// ---------------------------------------------------------------------------

export async function createOnlineCheckoutSession(
  input: OnlineCheckoutCreateInput,
  fetchImpl: typeof fetch = fetch
) {
  const appt = await prisma.appointment.findFirst({
    where: { referenceNumber: normalizeReference(input.reference), deletedAt: null },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
    },
  });
  if (!appt || !contactMatches(input.contact, appt)) {
    throw new ApiError(404, NOT_FOUND);
  }
  if (appt.status === 'CANCELLED') {
    throw new ApiError(409, 'This appointment is cancelled and cannot be paid online.');
  }

  const feeCentavos = toCentavos(appt.fee);
  if (feeCentavos <= 0) {
    throw new ApiError(
      409,
      'The parish office has not set the fee for this request yet. Please wait for staff review.'
    );
  }

  const paidCentavos = sumCentavos(appt.payments.map((p) => p.amount));
  const balanceCentavos = balanceDueCentavos(appt.fee, paidCentavos);
  if (balanceCentavos <= 0) {
    throw new ApiError(409, 'This appointment is already fully paid.', 'ALREADY_PAID');
  }

  const livePayMongo = isPayMongoConfigured();
  const provider = livePayMongo ? 'PAYMONGO' : 'PAYMONGO_SANDBOX';
  const intentId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes
  const amountStr = (balanceCentavos / 100).toFixed(2);

  let providerIntentId = `cs_sandbox_${crypto.randomBytes(10).toString('hex')}`;
  let checkoutUrl = `/pay/${intentId}`;

  if (livePayMongo) {
    const pmSession = await createPayMongoCheckoutSession(
      {
        intentId,
        appointmentId: appt.id,
        referenceNumber: appt.referenceNumber,
        sacramentType: appt.sacramentType,
        scheduledDate: appt.scheduledDate.toISOString().slice(0, 10),
        scheduledTime: appt.scheduledTime,
        participantName: appt.participantName,
        participantEmail: appt.participantEmail,
        participantPhone: appt.participantPhone,
        amountCentavos: balanceCentavos,
        paymentMethod: input.paymentMethod,
        providerChannel: input.providerChannel,
        appBaseUrl: getAppBaseUrl(),
      },
      fetchImpl
    );
    providerIntentId = pmSession.checkoutSessionId;
    checkoutUrl = pmSession.checkoutUrl;
  }

  const intent = await prisma.$transaction(async (tx) => {
    const created = await tx.onlinePaymentIntent.create({
      data: {
        id: intentId,
        appointmentId: appt.id,
        amount: amountStr,
        paymentMethod: input.paymentMethod,
        provider,
        providerChannel: input.providerChannel,
        providerIntentId,
        status: 'PENDING',
        expiresAt,
      },
    });

    await writeAudit(tx, {
      actor: PUBLIC_ACTOR,
      action: 'online_payment.intent_created',
      entityType: 'OnlinePaymentIntent',
      entityId: created.id,
      after: {
        appointmentId: appt.id,
        referenceNumber: appt.referenceNumber,
        amount: fromCentavos(balanceCentavos),
        paymentMethod: input.paymentMethod,
        provider,
        providerChannel: input.providerChannel,
        providerIntentId,
      },
    });

    return created;
  }, TX_OPTIONS);

  console.info(
    JSON.stringify({
      level: 'info',
      event: 'online_payment.intent_created',
      intentId: intent.id,
      providerIntentId: intent.providerIntentId,
      provider,
      paymentMethod: intent.paymentMethod,
      providerChannel: intent.providerChannel,
      amount: fromCentavos(balanceCentavos),
    })
  );

  return {
    intentId: intent.id,
    providerIntentId: intent.providerIntentId,
    provider: intent.provider,
    paymentMethod: intent.paymentMethod,
    providerChannel: intent.providerChannel,
    amount: fromCentavos(balanceCentavos),
    checkoutUrl,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hosted Checkout Public Read
// ---------------------------------------------------------------------------

export async function getOnlinePaymentIntentPublic(intentId: string) {
  const intent = await prisma.onlinePaymentIntent.findUnique({
    where: { id: intentId },
    include: {
      appointment: {
        select: {
          referenceNumber: true,
          sacramentType: true,
          scheduledDate: true,
          scheduledTime: true,
          location: true,
        },
      },
      payment: {
        select: {
          receiptNumber: true,
        },
      },
    },
  });
  if (!intent) throw new ApiError(404, 'Payment session not found');

  return {
    id: intent.id,
    providerIntentId: intent.providerIntentId,
    provider: intent.provider,
    paymentMethod: intent.paymentMethod,
    providerChannel: intent.providerChannel,
    amount: intent.amount,
    status: intent.status,
    referenceNumber: intent.referenceNumber,
    receiptNumber: intent.payment?.receiptNumber ?? null,
    expiresAt: intent.expiresAt.toISOString(),
    appointment: {
      referenceNumber: intent.appointment.referenceNumber,
      sacramentType: intent.appointment.sacramentType,
      scheduledDate: intent.appointment.scheduledDate.toISOString().slice(0, 10),
      scheduledTime: intent.appointment.scheduledTime,
      location: intent.appointment.location,
    },
  };
}

// ---------------------------------------------------------------------------
// Verified, Idempotent Webhook Handler (Constitution II, VI, VII)
// ---------------------------------------------------------------------------

export interface WebhookProcessResult {
  status: 'processed' | 'duplicate' | 'failed';
  intentId: string;
  providerIntentId: string;
  providerRef: string;
  receiptNumber?: string | null;
}

export async function handlePaymentWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret = getWebhookSecret()
): Promise<WebhookProcessResult> {
  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    throw new ApiError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'Webhook body must be valid JSON');
  }

  // Accept both PayMongo's official nested webhook envelope and our flat schema
  const normalizedPayMongo = parsePayMongoWebhookEvent(parsedJson);
  const event: PaymentWebhookEventInput = paymentWebhookEventSchema.parse(
    normalizedPayMongo ?? parsedJson
  );

  return settleVerifiedPaymentEvent(event);
}

async function settleVerifiedPaymentEvent(
  event: PaymentWebhookEventInput
): Promise<WebhookProcessResult> {
  return prisma.$transaction(async (tx) => {
    const intent = await tx.onlinePaymentIntent.findUnique({
      where: { providerIntentId: event.providerIntentId },
      include: { payment: { select: { receiptNumber: true } } },
    });
    if (!intent) {
      throw new ApiError(404, `Unknown payment intent: ${event.providerIntentId}`);
    }

    await lockAppointmentRow(tx, intent.appointmentId);

    // 1. Idempotency check on webhookEventId, intent status, or providerRef
    if (intent.webhookEventId === event.eventId || intent.status === 'SUCCEEDED') {
      const current = await tx.onlinePaymentIntent.findUnique({
        where: { id: intent.id },
        include: { payment: { select: { receiptNumber: true } } },
      });
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'online_payment.webhook_duplicate',
          eventId: event.eventId,
          providerIntentId: event.providerIntentId,
          providerRef: event.providerRef,
        })
      );
      return {
        status: 'duplicate',
        intentId: intent.id,
        providerIntentId: intent.providerIntentId,
        providerRef: event.providerRef,
        receiptNumber: current?.payment?.receiptNumber ?? null,
      };
    }

    const existingByProviderRef = await tx.payment.findUnique({
      where: { providerRef: event.providerRef },
      select: { id: true, receiptNumber: true },
    });
    if (existingByProviderRef) {
      return {
        status: 'duplicate',
        intentId: intent.id,
        providerIntentId: intent.providerIntentId,
        providerRef: event.providerRef,
        receiptNumber: existingByProviderRef.receiptNumber,
      };
    }

    // 2. Failed payment event
    if (event.type === 'payment.failed') {
      await tx.onlinePaymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', webhookEventId: event.eventId },
      });
      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: 'online_payment.failed',
        entityType: 'OnlinePaymentIntent',
        entityId: intent.id,
        before: { status: intent.status },
        after: { status: 'FAILED', providerRef: event.providerRef, eventId: event.eventId },
      });
      return {
        status: 'failed',
        intentId: intent.id,
        providerIntentId: intent.providerIntentId,
        providerRef: event.providerRef,
      };
    }

    // 3. Successful payment event (payment.paid)
    const appointment = await tx.appointment.findFirst({
      where: { id: intent.appointmentId, deletedAt: null },
    });
    if (!appointment) throw new ApiError(404, 'Appointment not found');
    if (appointment.status === 'CANCELLED') {
      throw new ApiError(409, 'Cannot settle online payment for a cancelled appointment');
    }

    const paid = await netPaidCentavos(tx, appointment.id);
    const balance = balanceDueCentavos(appointment.fee, paid);
    const amountCentavos = toCentavos(intent.amount);

    if (balance === 0 || amountCentavos > balance) {
      throw new ApiError(
        409,
        'Appointment balance has already been settled',
        'ALREADY_PAID'
      );
    }

    const receiptNumber = await allocateReceiptNumber(tx, 'RCP');
    const customerRef = event.referenceNumber || event.providerRef;

    const payment = await tx.payment.create({
      data: {
        kind: 'PAYMENT',
        amount: (amountCentavos / 100).toFixed(2),
        paymentMethod: intent.paymentMethod,
        gcashRefNumber: customerRef,
        provider: intent.provider,
        providerChannel: event.providerChannel || intent.providerChannel,
        providerRef: event.providerRef,
        receiptNumber,
        appointmentId: appointment.id,
        processedById: null, // Settled automatically by verified online gateway
      },
    });

    await tx.onlinePaymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'SUCCEEDED',
        webhookEventId: event.eventId,
        paymentId: payment.id,
        referenceNumber: customerRef,
      },
    });

    await writeAudit(tx, {
      actor: SYSTEM_ACTOR,
      action: 'payment.create_online',
      entityType: 'Payment',
      entityId: payment.id,
      after: {
        ...paymentSnapshot(payment),
        webhookEventId: event.eventId,
        providerIntentId: intent.providerIntentId,
      },
    });

    if (appointment.status === 'PENDING' && canTransition('PENDING', 'CONFIRMED', 'SYSTEM')) {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CONFIRMED' },
      });
      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: 'appointment.status_change',
        entityType: 'Appointment',
        entityId: appointment.id,
        before: { status: 'PENDING' },
        after: { status: 'CONFIRMED' },
        reason: `Online ${intent.paymentMethod} payment confirmed via ${intent.provider} (${receiptNumber}, ref ${event.providerRef})`,
      });
    }

    console.info(
      JSON.stringify({
        level: 'info',
        event: 'online_payment.webhook_settled',
        eventId: event.eventId,
        providerIntentId: intent.providerIntentId,
        providerRef: event.providerRef,
        receiptNumber,
        amount: fromCentavos(amountCentavos),
      })
    );

    return {
      status: 'processed',
      intentId: intent.id,
      providerIntentId: intent.providerIntentId,
      providerRef: event.providerRef,
      receiptNumber,
    };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Server-Side Verification Call against PayMongo API (Constitution II)
// ---------------------------------------------------------------------------

export async function verifyOnlinePaymentSession(
  intentId: string,
  fetchImpl: typeof fetch = fetch
): Promise<WebhookProcessResult | null> {
  const intent = await prisma.onlinePaymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new ApiError(404, 'Payment session not found');
  if (intent.status === 'SUCCEEDED' || !isPayMongoConfigured()) return null;

  const remote = await retrievePayMongoCheckoutSession(intent.providerIntentId, fetchImpl);
  if (remote.status !== 'paid' || !remote.paymentId) return null;

  const channel = mapPayMongoSourceToChannel(remote.sourceType, intent.providerChannel);
  return settleVerifiedPaymentEvent({
    eventId: `evt_verify_${remote.paymentId}`,
    type: 'payment.paid',
    providerIntentId: intent.providerIntentId,
    providerRef: remote.paymentId,
    providerChannel: channel,
    amount: (remote.amountCentavos ?? toCentavos(intent.amount)) / 100,
    referenceNumber: remote.paymentId,
  });
}

// ---------------------------------------------------------------------------
// Built-in Sandbox Provider Settlement (dispatches a signed PayMongo webhook)
// ---------------------------------------------------------------------------

export async function settleSandboxIntent(
  intentId: string,
  options?: { referenceNumber?: string | null; outcome?: 'PAID' | 'FAILED' }
): Promise<WebhookProcessResult> {
  const intent = await prisma.onlinePaymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new ApiError(404, 'Payment session not found');

  if (intent.status === 'SUCCEEDED') {
    const full = await getOnlinePaymentIntentPublic(intentId);
    return {
      status: 'duplicate',
      intentId: intent.id,
      providerIntentId: intent.providerIntentId,
      providerRef: intent.referenceNumber ?? intent.providerIntentId,
      receiptNumber: full.receiptNumber,
    };
  }

  if (intent.expiresAt < new Date()) {
    await prisma.onlinePaymentIntent.update({
      where: { id: intent.id },
      data: { status: 'EXPIRED' },
    });
    throw new ApiError(410, 'This online payment session has expired. Please start a new payment.');
  }

  const outcome = options?.outcome ?? 'PAID';
  const providerRef = `pay_${intent.providerChannel.toLowerCase()}_${intent.id
    .replace(/-/g, '')
    .slice(0, 12)}`;
  const eventPayload: PaymentWebhookEventInput = {
    eventId: `evt_${outcome.toLowerCase()}_${intent.id.replace(/-/g, '').slice(0, 16)}`,
    type: outcome === 'FAILED' ? 'payment.failed' : 'payment.paid',
    providerIntentId: intent.providerIntentId,
    providerRef,
    providerChannel: intent.providerChannel,
    amount: toCentavos(intent.amount) / 100,
    referenceNumber:
      options?.referenceNumber && options.referenceNumber.trim()
        ? options.referenceNumber.trim().toUpperCase()
        : `${intent.providerChannel}-${providerRef.slice(-8).toUpperCase()}`,
  };

  const rawBody = JSON.stringify(eventPayload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const pmSig = crypto
    .createHmac('sha256', getWebhookSecret())
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return handlePaymentWebhook(rawBody, `t=${timestamp},te=${pmSig},li=`);
}
