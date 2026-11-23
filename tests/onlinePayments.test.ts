import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  createOnlineCheckoutSession,
  handlePaymentWebhook,
  signWebhookPayload,
  verifyOnlinePaymentSession,
  verifyWebhookSignature,
} from '@/lib/payments/onlineProvider';
import {
  createPayMongoCheckoutSession,
  mapChannelToPayMongoTypes,
  parsePayMongoWebhookEvent,
  retrievePayMongoCheckoutSession,
} from '@/lib/payments/paymongo';
import { onlineCheckoutCreateSchema, paymentCreateSchema } from '@/lib/validation';

describe('R1-9 PayMongo Online Payment Gateway (Online Wallet & Bank Transfer)', () => {
  it('signs and verifies HMAC-SHA256 and PayMongo t=...,te=...,li=... webhook signatures (Constitution II)', () => {
    const secret = 'whsk_test_paymongo_secret_2026';
    const body = JSON.stringify({
      eventId: 'evt_test_001',
      type: 'payment.paid',
      providerIntentId: 'cs_test_001',
      providerRef: 'pay_test_001',
      amount: 500,
    });

    const sig = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, 'wrong-signature', secret)).toBe(false);
    expect(verifyWebhookSignature(body + ' ', sig, secret)).toBe(false);

    // PayMongo-formatted t=<ts>,te=<hmac>,li=<hmac> header
    const ts = '1700000000';
    const pmHmac = crypto.createHmac('sha256', secret).update(`${ts}.${body}`, 'utf8').digest('hex');
    expect(verifyWebhookSignature(body, `t=${ts},te=${pmHmac},li=`, secret)).toBe(true);
    expect(verifyWebhookSignature(body, `t=${ts},te=,li=${pmHmac}`, secret)).toBe(true);
    expect(verifyWebhookSignature(body, `t=${ts},te=000000,li=`, secret)).toBe(false);
  });

  it('maps Philippine Online Wallet and Bank Transfer channels to PayMongo payment_method_types', () => {
    expect(mapChannelToPayMongoTypes('GCASH_ONLINE')).toEqual(['gcash', 'qrph']);
    expect(mapChannelToPayMongoTypes('MAYA')).toEqual(['paymaya', 'qrph']);
    expect(mapChannelToPayMongoTypes('GRABPAY')).toEqual(['grab_pay']);
    expect(mapChannelToPayMongoTypes('SHOPEEPAY')).toEqual(['qrph']);
    expect(mapChannelToPayMongoTypes('BPI')).toEqual(['dob', 'qrph']);
    expect(mapChannelToPayMongoTypes('UNIONBANK')).toEqual(['dob_ubp', 'qrph']);
    expect(mapChannelToPayMongoTypes('BDO')).toEqual(['brankas_bdo', 'qrph']);
    expect(mapChannelToPayMongoTypes('METROBANK')).toEqual(['brankas_metrobank', 'qrph']);
    expect(mapChannelToPayMongoTypes('LANDBANK')).toEqual(['brankas_landbank', 'qrph']);
    expect(mapChannelToPayMongoTypes('INSTAPAY')).toContain('qrph');
  });

  it('calls PayMongo Checkout Sessions REST API v1 (POST & GET /v1/checkout_sessions) with HTTP Basic Auth', async () => {
    const prevKey = process.env.PAYMONGO_SECRET_KEY;
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_mock_paymongo_key_12345';

    try {
      const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        expect(auth).toBe(
          `Basic ${Buffer.from('sk_test_mock_paymongo_key_12345:').toString('base64')}`
        );

        if (init?.method === 'POST' && url.endsWith('/checkout_sessions')) {
          const parsed = JSON.parse(String(init.body));
          expect(parsed.data.attributes.line_items[0].amount).toBe(150000); // PHP 1,500.00 in centavos
          expect(parsed.data.attributes.payment_method_types).toEqual(['paymaya', 'qrph']);
          return new Response(
            JSON.stringify({
              data: {
                id: 'cs_mock_paymongo_session_01',
                type: 'checkout_session',
                attributes: {
                  checkout_url: 'https://checkout.paymongo.com/cs_mock_paymongo_session_01',
                  status: 'active',
                },
              },
            }),
            { status: 200 }
          );
        }

        if (init?.method === 'GET' && url.includes('/checkout_sessions/cs_mock_paymongo_session_01')) {
          return new Response(
            JSON.stringify({
              data: {
                id: 'cs_mock_paymongo_session_01',
                attributes: {
                  status: 'paid',
                  reference_number: 'SAC-2026-PM0001',
                  payments: [
                    {
                      id: 'pay_mock_maya_998877',
                      attributes: {
                        amount: 150000,
                        status: 'paid',
                        source: { type: 'paymaya' },
                      },
                    },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }

        return new Response('Not found', { status: 404 });
      }) as unknown as typeof fetch;

      const created = await createPayMongoCheckoutSession(
        {
          intentId: 'intent-1',
          appointmentId: 'apt-1',
          referenceNumber: 'SAC-2026-PM0001',
          sacramentType: 'BAPTISM',
          scheduledDate: '2026-12-15',
          scheduledTime: '10:00',
          participantName: 'Baby Juan Dela Cruz',
          participantEmail: 'juan@example.com',
          participantPhone: '09171234567',
          amountCentavos: 150_000,
          paymentMethod: 'ONLINE_WALLET',
          providerChannel: 'MAYA',
          appBaseUrl: 'http://localhost:3000',
        },
        mockFetch
      );

      expect(created.checkoutSessionId).toBe('cs_mock_paymongo_session_01');
      expect(created.checkoutUrl).toBe('https://checkout.paymongo.com/cs_mock_paymongo_session_01');

      const retrieved = await retrievePayMongoCheckoutSession(
        'cs_mock_paymongo_session_01',
        mockFetch
      );
      expect(retrieved.status).toBe('paid');
      expect(retrieved.paymentId).toBe('pay_mock_maya_998877');
      expect(retrieved.amountCentavos).toBe(150_000);
      expect(retrieved.sourceType).toBe('paymaya');
    } finally {
      if (prevKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
      else process.env.PAYMONGO_SECRET_KEY = prevKey;
    }
  });

  it('parses PayMongo nested checkout_session.payment.paid webhook payloads accurately', () => {
    const paymongoEnvelope = {
      data: {
        id: 'evt_pm_987654321',
        type: 'event',
        attributes: {
          livemode: false,
          type: 'checkout_session.payment.paid',
          data: {
            id: 'cs_CbFCTDfxvMFNjwjVi26Uzhtj',
            type: 'checkout_session',
            attributes: {
              reference_number: 'SAC-2026-WEDD01',
              status: 'paid',
              metadata: {
                provider_channel: 'BPI',
              },
              payments: [
                {
                  id: 'pay_gPSJ6SB24SVEa5hH8LrXBtd4',
                  type: 'payment',
                  attributes: {
                    amount: 500000,
                    currency: 'PHP',
                    status: 'paid',
                    source: { id: 'src_1', type: 'dob' },
                  },
                },
              ],
            },
          },
        },
      },
    };

    const parsed = parsePayMongoWebhookEvent(paymongoEnvelope);
    expect(parsed).toEqual({
      eventId: 'evt_pm_987654321',
      type: 'payment.paid',
      providerIntentId: 'cs_CbFCTDfxvMFNjwjVi26Uzhtj',
      providerRef: 'pay_gPSJ6SB24SVEa5hH8LrXBtd4',
      providerChannel: 'BPI',
      amount: 5000,
      referenceNumber: 'pay_gPSJ6SB24SVEa5hH8LrXBtd4',
    });
  });

  it('validates Online Wallet and Bank Transfer channels and rejects mismatched channel pairs', () => {
    const wallet = onlineCheckoutCreateSchema.parse({
      reference: 'SAC-2026-WEDD01',
      contact: '09187654321',
      paymentMethod: 'ONLINE_WALLET',
      providerChannel: 'MAYA',
    });
    expect(wallet.paymentMethod).toBe('ONLINE_WALLET');
    expect(wallet.providerChannel).toBe('MAYA');

    const bank = onlineCheckoutCreateSchema.parse({
      reference: 'SAC-2026-WEDD01',
      contact: '09187654321',
      paymentMethod: 'BANK_TRANSFER',
      providerChannel: 'INSTAPAY',
    });
    expect(bank.paymentMethod).toBe('BANK_TRANSFER');
    expect(bank.providerChannel).toBe('INSTAPAY');

    expect(() =>
      onlineCheckoutCreateSchema.parse({
        reference: 'SAC-2026-WEDD01',
        contact: '09187654321',
        paymentMethod: 'ONLINE_WALLET',
        providerChannel: 'BPI',
      })
    ).toThrow(/does not match/);

    expect(() =>
      paymentCreateSchema.parse({
        appointmentId: 'apt-1',
        amount: 500,
        paymentMethod: 'BANK_TRANSFER',
      })
    ).toThrow(/reference number is required/);
  });

  it('processes PayMongo checkout_session.payment.paid webhook idempotently without double-charging (Constitution II & VI)', async () => {
    const ref = `SAC-2026-PM${Math.floor(1000 + Math.random() * 8999)}`;
    const appt = await prisma.appointment.create({
      data: {
        referenceNumber: ref,
        source: 'ONLINE',
        sacramentType: 'CONFIRMATION',
        participantName: 'Test PayMongo Parishioner',
        participantPhone: '09179998877',
        scheduledDate: new Date('2026-12-22T00:00:00.000Z'),
        scheduledTime: '11:00',
        status: 'PENDING',
        fee: '1200.00',
      },
    });

    try {
      // 1. Create hosted checkout session for BANK_TRANSFER (BPI)
      const session = await createOnlineCheckoutSession({
        reference: ref,
        contact: '0917 999 8877',
        paymentMethod: 'BANK_TRANSFER',
        providerChannel: 'BPI',
      });

      expect(session.amount).toBe(1200);

      // Appointment MUST still be PENDING with 0 payments before webhook arrives
      const beforeWebhook = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
        include: { payments: true },
      });
      expect(beforeWebhook.status).toBe('PENDING');
      expect(beforeWebhook.payments).toHaveLength(0);

      // 2. Construct a full nested PayMongo `checkout_session.payment.paid` webhook payload
      const paymongoWebhookPayload = JSON.stringify({
        data: {
          id: `evt_pm_${session.intentId.slice(0, 12)}`,
          type: 'event',
          attributes: {
            livemode: false,
            type: 'checkout_session.payment.paid',
            data: {
              id: session.providerIntentId,
              type: 'checkout_session',
              attributes: {
                reference_number: ref,
                status: 'paid',
                metadata: { provider_channel: 'BPI' },
                payments: [
                  {
                    id: `pay_pm_${session.intentId.slice(0, 12)}`,
                    type: 'payment',
                    attributes: {
                      amount: 120000,
                      currency: 'PHP',
                      status: 'paid',
                      source: { id: 'src_dob_1', type: 'dob' },
                    },
                  },
                ],
              },
            },
          },
        },
      });

      // Tampered signature MUST be rejected with 401
      await expect(
        handlePaymentWebhook(paymongoWebhookPayload, 't=1700000000,te=invalid,li=')
      ).rejects.toThrow(/Invalid webhook signature/);

      // 3. Valid Paymongo-Signature confirms payment and transitions appointment to CONFIRMED
      const ts = '1700000000';
      const secret = 'whsk_test_secret';
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(`${ts}.${paymongoWebhookPayload}`, 'utf8')
        .digest('hex');
      const paymongoSigHeader = `t=${ts},te=${hmac},li=`;

      const firstResult = await handlePaymentWebhook(
        paymongoWebhookPayload,
        paymongoSigHeader,
        secret
      );
      expect(firstResult.status).toBe('processed');
      expect(firstResult.receiptNumber).toMatch(/^RCP-\d{4}-\d{5}$/);

      // 4. Duplicate webhook delivery is idempotent
      const dupResult = await handlePaymentWebhook(
        paymongoWebhookPayload,
        paymongoSigHeader,
        secret
      );
      expect(dupResult.status).toBe('duplicate');
      expect(dupResult.receiptNumber).toBe(firstResult.receiptNumber);

      // 5. Calling verifyOnlinePaymentSession on an already-settled intent is a safe no-op
      expect(await verifyOnlinePaymentSession(session.intentId)).toBeNull();

      const afterWebhook = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
        include: { payments: true },
      });
      expect(afterWebhook.status).toBe('CONFIRMED');
      expect(afterWebhook.payments).toHaveLength(1);
      expect(afterWebhook.payments[0].paymentMethod).toBe('BANK_TRANSFER');
      expect(afterWebhook.payments[0].providerChannel).toBe('BPI');
    } finally {
      await prisma.onlinePaymentIntent.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.payment.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.appointment.delete({ where: { id: appt.id } });
    }
  });
});
