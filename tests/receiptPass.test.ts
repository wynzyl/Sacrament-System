import { describe, expect, it } from 'vitest';
import {
  buildAppointmentPassData,
  buildOfficialReceiptData,
  CATHEDRAL_HEADER,
  generateVerificationQrSvg,
  signPassCode,
} from '@/lib/receiptPass';

describe('FEAT-P3: Official Receipt (RCP-YYYY-NNNNN) & QR Appointment Confirmation Pass', () => {
  it('generates a deterministic, tamper-evident verification seal (signPassCode)', () => {
    const seal1 = signPassCode('SAC-2026-K7M4QX');
    const seal2 = signPassCode('  sac-2026-k7m4qx ');
    const sealOther = signPassCode('SAC-2026-K7M4QY');

    expect(seal1).toMatch(/^ICCP-[0-9A-F]{6}$/);
    expect(seal1).toBe(seal2);
    expect(seal1).not.toBe(sealOther);

    const receiptSeal = signPassCode('RCP-2026-00001');
    expect(receiptSeal).toMatch(/^ICCP-[0-9A-F]{6}$/);
    expect(receiptSeal).not.toBe(seal1);
  });

  it('generates a deterministic self-contained SVG QR / Verification Matrix without network calls', () => {
    const payloadA = 'ICCP-PASS|SAC-2026-K7M4QX|BAPTISM|2026-12-10|09:00|CONFIRMED';
    const payloadB = 'ICCP-PASS|SAC-2026-K7M4QX|BAPTISM|2026-12-10|09:00|PENDING';

    const svgA1 = generateVerificationQrSvg(payloadA);
    const svgA2 = generateVerificationQrSvg(payloadA);
    const svgB = generateVerificationQrSvg(payloadB);

    expect(svgA1).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svgA1).toContain('viewBox="0 0 25 25"');
    expect(svgA1).toContain('<rect');
    expect(svgA1).toContain('</svg>');
    expect(svgA1).toBe(svgA2);
    expect(svgA1).not.toBe(svgB);
  });

  it('builds structured AppointmentPassData with Cathedral header, payment summary, requirement readiness, and QR SVG', () => {
    const appointment = {
      id: 'apt-101',
      referenceNumber: 'SAC-2026-K7M4QX',
      sacramentType: 'BAPTISM',
      status: 'CONFIRMED',
      participantName: 'Baby Juan Dela Cruz',
      barangay: 'Poblacion',
      city: 'Urdaneta City',
      province: 'Pangasinan',
      scheduledDate: new Date('2026-12-15T00:00:00.000Z'),
      scheduledTime: '09:00',
      location: 'Immaculate Conception Cathedral Parish',
      fee: 1000,
      assignedPriest: { name: 'Rev. Fr. Mateo Santos' },
      createdAt: new Date('2026-11-24T01:00:00.000Z'),
    };

    const payments = [
      {
        id: 'pay-1',
        receiptNumber: 'RCP-2026-00001',
        kind: 'PAYMENT',
        amount: 500,
        paymentMethod: 'CASH',
        reversal: { id: 'rev-1', receiptNumber: 'RVS-2026-00001' },
        createdAt: '2026-11-24T01:10:00.000Z',
      },
      {
        id: 'rev-1',
        receiptNumber: 'RVS-2026-00001',
        kind: 'REVERSAL',
        amount: -500,
        paymentMethod: 'CASH',
        reversesPayment: { id: 'pay-1', receiptNumber: 'RCP-2026-00001' },
        createdAt: '2026-11-24T01:20:00.000Z',
      },
      {
        id: 'pay-2',
        receiptNumber: 'RCP-2026-00002',
        kind: 'PAYMENT',
        amount: 1000,
        paymentMethod: 'ONLINE_WALLET',
        provider: 'PAYMONGO',
        providerChannel: 'MAYA',
        createdAt: '2026-11-24T01:30:00.000Z',
      },
    ];

    const requirements = [
      { key: 'psa_birth_cert', label: 'PSA Birth Certificate', isMet: true },
      { key: 'seminar', label: 'Pre-Jordan Baptismal Seminar', isMet: true },
      { key: 'sponsors', label: 'Canonical Sponsors List', isMet: false },
    ];

    const pass = buildAppointmentPassData(appointment, payments, requirements);

    expect(pass.header).toEqual(CATHEDRAL_HEADER);
    expect(pass.referenceNumber).toBe('SAC-2026-K7M4QX');
    expect(pass.verificationSeal).toBe(signPassCode('SAC-2026-K7M4QX'));
    expect(pass.sacramentLabel).toBe('Baptism');
    expect(pass.participantName).toBe('Baby Juan Dela Cruz');
    expect(pass.participantAddress).toBe('Poblacion, Urdaneta City, Pangasinan');
    expect(pass.scheduledDate).toBe('2026-12-15');
    expect(pass.scheduledTime).toBe('09:00');
    expect(pass.priestName).toBe('Rev. Fr. Mateo Santos');

    // Net paid: 500 - 500 + 1000 = 1000
    expect(pass.paymentSummary).toEqual({
      fee: 1000,
      amountPaid: 1000,
      balanceDue: 0,
      isFullyPaid: true,
      receiptNumbers: ['RCP-2026-00002'],
    });

    expect(pass.requirementReadiness).toEqual({
      metCount: 2,
      totalCount: 3,
      isComplete: false,
      items: [
        { label: 'PSA Birth Certificate', isMet: true },
        { label: 'Pre-Jordan Baptismal Seminar', isMet: true },
        { label: 'Canonical Sponsors List', isMet: false },
      ],
    });

    expect(pass.qrPayload).toContain('ICCP-PASS|SAC-2026-K7M4QX|BAPTISM|2026-12-15|09:00|CONFIRMED');
    expect(pass.qrSvg).toContain('<svg');
  });

  it('builds structured Diocesan OfficialReceiptData for valid, reversed, and reversal payments', () => {
    const appointment = {
      referenceNumber: 'SAC-2026-W8N9PR',
      sacramentType: 'WEDDING',
      status: 'CONFIRMED',
      participantName: 'Mark & Lisa Garcia',
      scheduledDate: '2026-12-20',
      scheduledTime: '10:00',
      fee: 3500,
    };

    const validPayment = {
      receiptNumber: 'RCP-2026-00015',
      kind: 'PAYMENT',
      amount: 3500,
      paymentMethod: 'BANK_TRANSFER',
      provider: 'PAYMONGO',
      providerChannel: 'INSTAPAY',
      providerRef: 'pm_pay_987654',
      processedBy: null,
      createdAt: new Date('2026-11-24T02:00:00.000Z'),
    };

    const validOr = buildOfficialReceiptData(validPayment, appointment);
    expect(validOr.header).toEqual(CATHEDRAL_HEADER);
    expect(validOr.receiptNumber).toBe('RCP-2026-00015');
    expect(validOr.kind).toBe('PAYMENT');
    expect(validOr.appointmentReference).toBe('SAC-2026-W8N9PR');
    expect(validOr.sacramentLabel).toBe('Wedding');
    expect(validOr.paymentMethodLabel).toBe('Bank Transfer');
    expect(validOr.provider).toBe('PAYMONGO');
    expect(validOr.providerChannelLabel).toBe('InstaPay (Real-Time Bank Transfer)');
    expect(validOr.externalReference).toBe('pm_pay_987654');
    expect(validOr.amount).toBe(3500);
    expect(validOr.reversalStatus).toBe('VALID');
    expect(validOr.verificationSeal).toMatch(/^ICCP-[0-9A-F]{6}$/);
    expect(validOr.qrSvg).toContain('<svg');

    // Reversed payment
    const reversedOr = buildOfficialReceiptData(
      {
        ...validPayment,
        reversal: { id: 'rev-9', receiptNumber: 'RVS-2026-00004' },
      },
      appointment
    );
    expect(reversedOr.reversalStatus).toBe('REVERSED');
    expect(reversedOr.reversedByReceiptNumber).toBe('RVS-2026-00004');

    // Reversal entry itself
    const reversalVoucher = buildOfficialReceiptData(
      {
        receiptNumber: 'RVS-2026-00004',
        kind: 'REVERSAL',
        amount: -3500,
        paymentMethod: 'BANK_TRANSFER',
        provider: 'PAYMONGO',
        providerChannel: 'INSTAPAY',
        reversesPayment: { id: 'pay-15', receiptNumber: 'RCP-2026-00015' },
        reason: 'Duplicate transfer reversal',
        processedBy: { name: 'Cathedral Admin' },
        createdAt: new Date('2026-11-24T03:00:00.000Z'),
      },
      appointment
    );
    expect(reversalVoucher.kind).toBe('REVERSAL');
    expect(reversalVoucher.reversalStatus).toBe('REVERSAL_ENTRY');
    expect(reversalVoucher.reversesReceiptNumber).toBe('RCP-2026-00015');
    expect(reversalVoucher.reversalReason).toBe('Duplicate transfer reversal');
    expect(reversalVoucher.processedByName).toBe('Cathedral Admin');
  });
});
