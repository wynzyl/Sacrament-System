import { describe, expect, it } from 'vitest';
import {
  buildAppointmentPassData,
  buildOfficialReceiptData,
  CATHEDRAL_HEADER,
  DIOCESE_HEADER,
  generateVerificationQrSvg,
  signPassCode,
  verifyPassCode,
} from '@/lib/receiptPass';

describe('FEAT-P3: Official Receipt (RCP-YYYY-NNNNN) & QR Appointment Confirmation Pass', () => {
  it('generates a deterministic, tamper-evident verification seal (ICCP-XXXXXX)', () => {
    const seal1 = signPassCode('SAC-2026-K7M4QX', 'test-secret');
    const seal2 = signPassCode('  sac-2026-k7m4qx ', 'test-secret');
    const sealDifferentCode = signPassCode('SAC-2026-K7M4QY', 'test-secret');
    const sealDifferentSecret = signPassCode('SAC-2026-K7M4QX', 'other-secret');

    expect(seal1).toMatch(/^ICCP-[0-9A-F]{6}$/);
    expect(seal1).toBe(seal2);
    expect(seal1).not.toBe(sealDifferentCode);
    expect(seal1).not.toBe(sealDifferentSecret);

    expect(verifyPassCode('SAC-2026-K7M4QX', seal1, 'test-secret')).toBe(true);
    expect(verifyPassCode('SAC-2026-K7M4QX', 'ICCP-000000', 'test-secret')).toBe(false);
  });

  it('generates a deterministic self-contained SVG verification QR matrix without external calls', () => {
    const payloadA = 'ICCP|PASS|SAC-2026-K7M4QX|BAPTISM|2026-12-10|09:00|ICCP-8F42A1';
    const payloadB = 'ICCP|OR|RCP-2026-00001|SAC-2026-K7M4QX|500.00|ACTIVE|ICCP-123456';

    const svgA1 = generateVerificationQrSvg(payloadA);
    const svgA2 = generateVerificationQrSvg(payloadA);
    const svgB = generateVerificationQrSvg(payloadB);

    expect(svgA1).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svgA1).toContain('viewBox="0 0 25 25"');
    expect(svgA1).toContain('aria-label="ICCP Verification QR Code"');
    expect(svgA1).toContain('<rect ');
    expect(svgA1).toContain('</svg>');

    // Deterministic for identical payload, distinct for different payload
    expect(svgA1).toBe(svgA2);
    expect(svgA1).not.toBe(svgB);
  });

  it('builds structured QR Appointment Confirmation Pass data with payment & requirement readiness', () => {
    const pass = buildAppointmentPassData(
      {
        referenceNumber: 'sac-2026-k7m4qx',
        sacramentType: 'BAPTISM',
        status: 'CONFIRMED',
        participantName: 'Baby Juan Dela Cruz',
        participantPhone: '09171234567',
        participantEmail: 'family@example.com',
        barangay: 'Poblacion',
        scheduledDate: new Date('2026-12-10T00:00:00.000Z'),
        scheduledTime: '09:00',
        location: 'Immaculate Conception Cathedral Parish',
        fee: 1000,
        assignedPriest: { id: 'priest-1', name: 'Rev. Fr. Mateo Santos' },
      },
      [
        {
          receiptNumber: 'RCP-2026-00001',
          amount: 1000,
          paymentMethod: 'GCASH',
          kind: 'PAYMENT',
          gcashRefNumber: 'GC-998877',
          createdAt: '2026-11-24T01:00:00.000Z',
        },
      ],
      [
        {
          key: 'child_birth_cert',
          label: "Child's PSA birth certificate",
          isMet: true,
          verifiedAt: '2026-11-24T01:30:00.000Z',
        },
        {
          key: 'pre_baptism_seminar',
          label: 'Pre-baptismal seminar attended by parents and godparents',
          isMet: false,
          verifiedAt: null,
        },
      ]
    );

    expect(pass.dioceseHeader).toBe(DIOCESE_HEADER);
    expect(pass.cathedralHeader).toBe(CATHEDRAL_HEADER);
    expect(pass.referenceNumber).toBe('SAC-2026-K7M4QX');
    expect(pass.verificationSeal).toBe(signPassCode('SAC-2026-K7M4QX'));
    expect(pass.qrSvg).toContain('<svg');
    expect(pass.sacramentLabel).toBe('Baptism');
    expect(pass.participant.name).toBe('Baby Juan Dela Cruz');
    expect(pass.participant.barangay).toBe('Poblacion');
    expect(pass.schedule).toEqual({
      date: '2026-12-10',
      time: '09:00',
      location: 'Immaculate Conception Cathedral Parish',
    });
    expect(pass.priest.name).toBe('Rev. Fr. Mateo Santos');
    expect(pass.paymentSummary).toEqual({
      fee: 1000,
      amountPaid: 1000,
      balanceDue: 0,
      isFullyPaid: true,
      paymentCount: 1,
      receiptNumbers: ['RCP-2026-00001'],
    });
    expect(pass.requirementReadiness.metCount).toBe(1);
    expect(pass.requirementReadiness.totalCount).toBe(2);
    expect(pass.requirementReadiness.isComplete).toBe(false);
  });

  it('builds structured Diocesan Official Receipt data including active, reversed, and reversal entries', () => {
    const apptContext = {
      referenceNumber: 'SAC-2026-K7M4QX',
      participantName: 'Mark & Lisa Garcia',
      sacramentType: 'WEDDING',
      scheduledDate: '2026-12-18',
      scheduledTime: '10:00',
    };

    const activeReceipt = buildOfficialReceiptData(
      {
        receiptNumber: 'RCP-2026-00015',
        kind: 'PAYMENT',
        amount: 2500,
        paymentMethod: 'ONLINE_WALLET',
        provider: 'PAYMONGO',
        providerChannel: 'MAYA',
        providerRef: 'pay_maya_12345',
        createdAt: new Date('2026-11-24T02:00:00.000Z'),
        processedBy: null,
      },
      apptContext
    );

    expect(activeReceipt.receiptNumber).toBe('RCP-2026-00015');
    expect(activeReceipt.reversalStatus).toBe('ACTIVE');
    expect(activeReceipt.isReversed).toBe(false);
    expect(activeReceipt.isReversalEntry).toBe(false);
    expect(activeReceipt.paymentMethodLabel).toBe('Online Wallet');
    expect(activeReceipt.providerChannelLabel).toBe('Maya (PayMaya)');
    expect(activeReceipt.providerRef).toBe('pay_maya_12345');
    expect(activeReceipt.amount).toBe(2500);
    expect(activeReceipt.verificationSeal).toBe(signPassCode('RCP-2026-00015'));
    expect(activeReceipt.qrSvg).toContain('<svg');

    const reversedOriginal = buildOfficialReceiptData(
      {
        receiptNumber: 'RCP-2026-00016',
        kind: 'PAYMENT',
        amount: 500,
        paymentMethod: 'CASH',
        createdAt: '2026-11-24T03:00:00.000Z',
        reversal: { id: 'rev-1', receiptNumber: 'RVS-2026-00002' },
        processedBy: { name: 'Maria Cashier' },
      },
      apptContext
    );

    expect(reversedOriginal.reversalStatus).toBe('REVERSED');
    expect(reversedOriginal.isReversed).toBe(true);
    expect(reversedOriginal.reversedByReceiptNumber).toBe('RVS-2026-00002');
    expect(reversedOriginal.processedByName).toBe('Maria Cashier');

    const reversalEntry = buildOfficialReceiptData(
      {
        receiptNumber: 'RVS-2026-00002',
        kind: 'REVERSAL',
        amount: -500,
        paymentMethod: 'CASH',
        createdAt: '2026-11-24T03:15:00.000Z',
        reversesPayment: { id: 'pay-1', receiptNumber: 'RCP-2026-00016' },
        reason: 'Duplicate cashier entry',
        processedBy: { name: 'Maria Cashier' },
      },
      apptContext
    );

    expect(reversalEntry.reversalStatus).toBe('REVERSAL_ENTRY');
    expect(reversalEntry.isReversalEntry).toBe(true);
    expect(reversalEntry.reversesReceiptNumber).toBe('RCP-2026-00016');
    expect(reversalEntry.reversalReason).toBe('Duplicate cashier entry');
    expect(reversalEntry.amount).toBe(-500);
  });
});
