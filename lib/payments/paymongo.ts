// lib/payments/paymongo.ts
// PayMongo REST API v1 integration (https://api.paymongo.com/v1/checkout_sessions).
//
// Why PayMongo for a Philippine Parish:
//  - PHP 0 setup fee, PHP 0 monthly subscription fee, and no monthly minimum
//    (unlike Xendit's USD $50/mo minimum or Dragonpay's setup/annual fees).
//  - Single API for Philippine e-wallets (GCash, Maya, GrabPay, QR Ph / ShopeePay)
//    AND Direct Online Banking (BPI, UnionBank, BDO, Metrobank, Landbank, InstaPay).
//  - PCI-DSS Level 1 hosted Checkout Sessions + HMAC-SHA256 signed webhooks.

import { ApiError } from '@/lib/http';
import { CHURCH_NAME, PROVIDER_CHANNEL_LABELS, SACRAMENT_LABELS } from '@/lib/constants';
import type { PaymentWebhookEventInput } from '@/lib/validation';

const PAYMONGO_API_BASE = process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1';

export type PayMongoMethodType =
  | 'gcash'
  | 'paymaya'
  | 'grab_pay'
  | 'qrph'
  | 'dob'
  | 'dob_ubp'
  | 'brankas_bdo'
  | 'brankas_metrobank'
  | 'brankas_landbank';

export function isPayMongoConfigured(): boolean {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  return Boolean(key && (key.startsWith('sk_test_') || key.startsWith('sk_live_')));
}

function getPayMongoAuthHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key) {
    throw new ApiError(500, 'PAYMONGO_SECRET_KEY is not configured');
  }
  // PayMongo HTTP Basic Auth uses the secret key as the username and an empty password.
  const encoded = Buffer.from(`${key}:`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Map the parishioner's chosen wallet/bank channel to PayMongo's
 * `payment_method_types` array for `/v1/checkout_sessions`.
 */
export function mapChannelToPayMongoTypes(providerChannel: string): PayMongoMethodType[] {
  switch (providerChannel) {
    case 'GCASH_ONLINE':
      return ['gcash', 'qrph'];
    case 'MAYA':
      return ['paymaya', 'qrph'];
    case 'GRABPAY':
      return ['grab_pay'];
    case 'SHOPEEPAY':
      // ShopeePay and MariBank scan QR Ph codes via PayMongo
      return ['qrph'];
    case 'BPI':
      return ['dob', 'qrph'];
    case 'UNIONBANK':
      return ['dob_ubp', 'qrph'];
    case 'BDO':
      return ['brankas_bdo', 'qrph'];
    case 'METROBANK':
      return ['brankas_metrobank', 'qrph'];
    case 'LANDBANK':
      return ['brankas_landbank', 'qrph'];
    case 'INSTAPAY':
    case 'PESONET':
      return ['qrph', 'dob', 'dob_ubp', 'brankas_bdo', 'brankas_metrobank', 'brankas_landbank'];
    default:
      return ['qrph', 'gcash', 'paymaya'];
  }
}

/** Map PayMongo's payment `source.type` back to our providerChannel code. */
export function mapPayMongoSourceToChannel(
  sourceType: string | undefined,
  fallbackChannel: string
): string {
  switch (sourceType) {
    case 'gcash':
      return 'GCASH_ONLINE';
    case 'paymaya':
      return 'MAYA';
    case 'grab_pay':
      return 'GRABPAY';
    case 'dob':
      return 'BPI';
    case 'dob_ubp':
      return 'UNIONBANK';
    case 'brankas_bdo':
      return 'BDO';
    case 'brankas_metrobank':
      return 'METROBANK';
    case 'brankas_landbank':
      return 'LANDBANK';
    case 'qrph':
      return fallbackChannel || 'INSTAPAY';
    default:
      return fallbackChannel;
  }
}

export interface CreatePayMongoCheckoutParams {
  intentId: string;
  appointmentId: string;
  referenceNumber: string;
  sacramentType: string;
  scheduledDate: string;
  scheduledTime: string;
  participantName: string;
  participantEmail?: string | null;
  participantPhone?: string | null;
  amountCentavos: number;
  paymentMethod: 'ONLINE_WALLET' | 'BANK_TRANSFER';
  providerChannel: string;
  appBaseUrl: string;
}

export interface PayMongoCheckoutSessionResult {
  checkoutSessionId: string; // e.g. cs_CbFCTDfxvMFNjwjVi26Uzhtj
  checkoutUrl: string; // e.g. https://checkout.paymongo.com/cs_...
}

/**
 * Call `POST https://api.paymongo.com/v1/checkout_sessions` to create a hosted
 * checkout session for the parishioner.
 */
export async function createPayMongoCheckoutSession(
  params: CreatePayMongoCheckoutParams,
  fetchImpl: typeof fetch = fetch
): Promise<PayMongoCheckoutSessionResult> {
  // PayMongo enforces a minimum checkout amount of PHP 20.00 (2,000 centavos).
  if (params.amountCentavos < 2_000) {
    throw new ApiError(
      400,
      'PayMongo requires a minimum online payment of PHP 20.00.'
    );
  }

  const sacramentLabel = SACRAMENT_LABELS[params.sacramentType] || params.sacramentType;
  const channelLabel =
    PROVIDER_CHANNEL_LABELS[params.providerChannel] || params.providerChannel;
  const paymentMethodTypes = mapChannelToPayMongoTypes(params.providerChannel);

  const payload = {
    data: {
      attributes: {
        send_email_receipt: Boolean(params.participantEmail),
        show_description: true,
        show_line_items: true,
        reference_number: params.referenceNumber,
        description: `${CHURCH_NAME} — ${sacramentLabel} (${params.referenceNumber}) via ${channelLabel}`,
        line_items: [
          {
            currency: 'PHP',
            amount: params.amountCentavos,
            name: `${sacramentLabel} Offering / Fee (${params.referenceNumber})`,
            description: `Scheduled ${params.scheduledDate} at ${params.scheduledTime}`,
            quantity: 1,
          },
        ],
        payment_method_types: paymentMethodTypes,
        billing: {
          name: params.participantName,
          ...(params.participantEmail ? { email: params.participantEmail } : {}),
          ...(params.participantPhone ? { phone: params.participantPhone } : {}),
        },
        success_url: `${params.appBaseUrl}/pay/${params.intentId}?paymongo=return`,
        cancel_url: `${params.appBaseUrl}/track?ref=${encodeURIComponent(params.referenceNumber)}`,
        metadata: {
          intent_id: params.intentId,
          appointment_id: params.appointmentId,
          reference_number: params.referenceNumber,
          payment_method: params.paymentMethod,
          provider_channel: params.providerChannel,
        },
      },
    },
  };

  const response = await fetchImpl(`${PAYMONGO_API_BASE}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Authorization: getPayMongoAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body || typeof body !== 'object' || !('data' in body)) {
    const errors = (body as { errors?: { detail?: string }[] } | null)?.errors;
    const detail = errors?.[0]?.detail || 'PayMongo checkout session creation failed';
    throw new ApiError(502, `Payment gateway error: ${detail}`, 'PAYMONGO_API_ERROR');
  }

  const data = body.data as {
    id?: string;
    attributes?: { checkout_url?: string };
  };
  if (!data?.id || !data?.attributes?.checkout_url) {
    throw new ApiError(502, 'PayMongo returned an incomplete checkout session');
  }

  return {
    checkoutSessionId: data.id,
    checkoutUrl: data.attributes.checkout_url,
  };
}

export interface RetrievedPayMongoCheckout {
  checkoutSessionId: string;
  status: 'paid' | 'active' | 'expired';
  paymentId?: string;
  amountCentavos?: number;
  sourceType?: string;
  referenceNumber?: string;
}

/**
 * Server-side verification call: `GET https://api.paymongo.com/v1/checkout_sessions/:id`.
 * Used when the parishioner returns from PayMongo's hosted checkout page so the
 * server verifies payment status directly with PayMongo (Constitution II).
 */
export async function retrievePayMongoCheckoutSession(
  checkoutSessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RetrievedPayMongoCheckout> {
  const response = await fetchImpl(
    `${PAYMONGO_API_BASE}/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: getPayMongoAuthHeader(),
        Accept: 'application/json',
      },
    }
  );

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body || typeof body !== 'object' || !('data' in body)) {
    throw new ApiError(502, 'Could not verify checkout session with PayMongo');
  }

  const data = body.data as {
    id: string;
    attributes?: {
      status?: string;
      reference_number?: string;
      payments?: Array<{
        id: string;
        attributes?: {
          amount?: number;
          status?: string;
          source?: { type?: string };
        };
      }>;
    };
  };

  const payments = data.attributes?.payments ?? [];
  const paidPayment = payments.find((p) => p.attributes?.status === 'paid') ?? payments[0];
  const isPaid =
    paidPayment?.attributes?.status === 'paid' || data.attributes?.status === 'paid';

  return {
    checkoutSessionId: data.id,
    status: isPaid
      ? 'paid'
      : data.attributes?.status === 'expired'
      ? 'expired'
      : 'active',
    paymentId: paidPayment?.id,
    amountCentavos: paidPayment?.attributes?.amount,
    sourceType: paidPayment?.attributes?.source?.type,
    referenceNumber: data.attributes?.reference_number,
  };
}

/**
 * Parse a real PayMongo nested webhook event (`checkout_session.payment.paid`,
 * `payment.paid`, `payment.failed`) into our internal `PaymentWebhookEventInput`
 * structure. Returns null if the JSON is already in the flat internal format.
 */
export function parsePayMongoWebhookEvent(raw: unknown): PaymentWebhookEventInput | null {
  if (!raw || typeof raw !== 'object' || !('data' in raw)) return null;
  const outer = (raw as { data?: unknown }).data;
  if (!outer || typeof outer !== 'object') return null;

  const eventObj = outer as {
    id?: string;
    type?: string;
    attributes?: {
      type?: string;
      data?: {
        id?: string;
        type?: string;
        attributes?: {
          amount?: number;
          reference_number?: string;
          metadata?: Record<string, string>;
          source?: { type?: string };
          payments?: Array<{
            id?: string;
            attributes?: {
              amount?: number;
              status?: string;
              source?: { type?: string };
            };
          }>;
        };
      };
    };
  };

  const eventId = eventObj.id;
  const eventType = eventObj.attributes?.type;
  const resource = eventObj.attributes?.data;
  if (!eventId || !eventType || !resource?.id) return null;

  // Case A: checkout_session.payment.paid
  if (eventType === 'checkout_session.payment.paid') {
    const csId = resource.id;
    const payment = resource.attributes?.payments?.[0];
    const paymentId = payment?.id || `pay_${csId}`;
    const amountCentavos = payment?.attributes?.amount ?? resource.attributes?.amount ?? 0;
    const fallbackChannel = resource.attributes?.metadata?.provider_channel || 'INSTAPAY';
    const sourceType = payment?.attributes?.source?.type;
    const providerChannel = mapPayMongoSourceToChannel(sourceType, fallbackChannel);

    return {
      eventId,
      type: 'payment.paid',
      providerIntentId: csId,
      providerRef: paymentId,
      providerChannel,
      amount: amountCentavos / 100,
      referenceNumber: paymentId,
    };
  }

  // Case B: payment.paid or payment.failed
  if (eventType === 'payment.paid' || eventType === 'payment.failed') {
    const paymentId = resource.id;
    const amountCentavos = resource.attributes?.amount ?? 0;
    const intentIdFromMeta =
      resource.attributes?.metadata?.provider_intent_id ||
      resource.attributes?.reference_number ||
      paymentId;
    const fallbackChannel = resource.attributes?.metadata?.provider_channel || 'INSTAPAY';
    const providerChannel = mapPayMongoSourceToChannel(
      resource.attributes?.source?.type,
      fallbackChannel
    );

    return {
      eventId,
      type: eventType,
      providerIntentId: intentIdFromMeta,
      providerRef: paymentId,
      providerChannel,
      amount: amountCentavos / 100,
      referenceNumber: paymentId,
    };
  }

  return null;
}
