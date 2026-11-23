// lib/receiptPass.ts
// FEAT-P3: Downloadable Official Receipt (RCP-YYYY-NNNNN) & QR Appointment
// Confirmation Pass for Immaculate Conception Cathedral Parish (Urdaneta City).
//
// Pure, deterministic builders and SVG verification matrix generator with a
// tamper-evident cryptographic seal (ICCP-XXXXXX). Requires no external network
// calls and does not modify prisma/schema.prisma.

import crypto from 'crypto';
import {
  CHURCH_NAME,
  DEFAULT_CITY,
  DEFAULT_LOCATION,
  DEFAULT_PROVINCE,
  PAYMENT_METHOD_LABELS,
  PROVIDER_CHANNEL_LABELS,
  SACRAMENT_LABELS,
} from '@/lib/constants';
import { utcToDateOnly } from '@/lib/dates';
import { balanceDueCentavos, fromCentavos, sumCentavos, toCentavos, type MoneyInput } from '@/lib/money';
import { normalizeReference } from '@/lib/reference';

export const DIOCESE_HEADER = 'Diocese of Urdaneta';
export const CATHEDRAL_HEADER = CHURCH_NAME;
export const CATHEDRAL_ADDRESS = `${DEFAULT_CITY}, ${DEFAULT_PROVINCE}, Philippines`;

const DEFAULT_SEAL_SECRET = 'iccp-urdaneta-cathedral-pass-seal-v1';

function getSigningSecret(overrideSecret?: string): string {
  return (
    overrideSecret ||
    process.env.PASS_SIGNING_SECRET ||
    process.env.SESSION_SECRET ||
    DEFAULT_SEAL_SECRET
  );
}

/**
 * Compute a deterministic, tamper-evident verification digest (e.g. `ICCP-8F42A1`)
 * for a booking reference (`SAC-YYYY-XXXXXX`) or official receipt (`RCP-YYYY-NNNNN`).
 */
export function signPassCode(referenceOrReceipt: string, secret?: string): string {
  const normalized = referenceOrReceipt.trim().toUpperCase();
  const digest = crypto
    .createHmac('sha256', getSigningSecret(secret))
    .update(normalized)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  return `ICCP-${digest}`;
}

/**
 * Verify whether a provided verification seal matches the expected digest.
 */
export function verifyPassCode(
  referenceOrReceipt: string,
  seal: string,
  secret?: string
): boolean {
  const expected = signPassCode(referenceOrReceipt, secret);
  const actual = seal.trim().toUpperCase();
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export interface QrSvgOptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * Deterministic 21x21 QR-style Verification Matrix SVG generator.
 * Includes standard 7x7 finder patterns at the three corners, timing patterns,
 * alignment markers, and deterministic payload-derived data cells so passes and
 * official receipts render offline and print crisply at any DPI.
 */
export function generateVerificationQrSvg(
  payload: string,
  options: QrSvgOptions = {}
): string {
  const gridSize = 21;
  const margin = options.margin ?? 2;
  const size = options.size ?? 160;
  const darkColor = options.darkColor ?? '#0f172a';
  const lightColor = options.lightColor ?? '#ffffff';

  const matrix: boolean[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => false)
  );

  const placeFinderPattern = (topRow: number, leftCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = topRow + r;
        const cc = leftCol + c;
        if (rr < 0 || rr >= gridSize || cc < 0 || cc >= gridSize) continue;
        reserved[rr][cc] = true;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        matrix[rr][cc] = inBox && (isBorder || isCenter);
      }
    }
  };

  placeFinderPattern(0, 0);
  placeFinderPattern(0, gridSize - 7);
  placeFinderPattern(gridSize - 7, 0);

  // Timing patterns on row 6 and column 6
  for (let i = 8; i < gridSize - 8; i++) {
    reserved[6][i] = true;
    matrix[6][i] = i % 2 === 0;
    reserved[i][6] = true;
    matrix[i][6] = i % 2 === 0;
  }

  // Dark module marker
  reserved[gridSize - 8][8] = true;
  matrix[gridSize - 8][8] = true;

  // Deterministic bit stream derived from SHA-256 chain of payload
  const seedA = crypto.createHash('sha256').update(payload).digest();
  const seedB = crypto
    .createHash('sha256')
    .update(payload)
    .update(':iccp-matrix-v1')
    .digest();
  const stream = Buffer.concat([seedA, seedB]);

  let bitIndex = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (reserved[r][c]) continue;
      const byte = stream[Math.floor(bitIndex / 8) % stream.length];
      const bit = (byte >> (7 - (bitIndex % 8))) & 1;
      matrix[r][c] = bit === 1;
      bitIndex++;
    }
  }

  const totalUnits = gridSize + margin * 2;
  const rects: string[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        rects.push(
          `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${darkColor}" />`
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalUnits} ${totalUnits}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="ICCP Verification QR Code">`,
    `<rect width="${totalUnits}" height="${totalUnits}" fill="${lightColor}" />`,
    ...rects,
    `</svg>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Input & Output Types for Pass and Official Receipt Builders
// ---------------------------------------------------------------------------

export interface PassPaymentInput {
  id?: string;
  amount: MoneyInput;
  paymentMethod: string;
  kind?: 'PAYMENT' | 'REVERSAL' | string;
  receiptNumber: string;
  gcashRefNumber?: string | null;
  provider?: string | null;
  providerChannel?: string | null;
  providerRef?: string | null;
  reversesPaymentId?: string | null;
  reversesPayment?: { id?: string; receiptNumber: string } | null;
  reversal?: { id?: string; receiptNumber: string } | null;
  reason?: string | null;
  processedBy?: { name: string } | null;
  createdAt?: Date | string;
}

export interface PassRequirementInput {
  key?: string;
  label: string;
  isMet: boolean;
  verifiedAt?: Date | string | null;
}

export interface PassAppointmentInput {
  id?: string;
  referenceNumber: string;
  sacramentType: string;
  status: string;
  participantName: string;
  participantPhone?: string | null;
  participantEmail?: string | null;
  barangay?: string | null;
  city?: string | null;
  province?: string | null;
  scheduledDate: Date | string;
  scheduledTime: string;
  location?: string | null;
  notes?: string | null;
  fee: MoneyInput;
  assignedPriest?: { id?: string; name: string } | null;
  payments?: PassPaymentInput[];
  requirements?: PassRequirementInput[];
}

export interface AppointmentPassData {
  dioceseHeader: string;
  cathedralHeader: string;
  cathedralAddress: string;
  referenceNumber: string;
  verificationSeal: string;
  verificationPayload: string;
  qrSvg: string;
  status: string;
  sacramentType: string;
  sacramentLabel: string;
  participantName: string;
  participant: {
    name: string;
    phone: string | null;
    email: string | null;
    barangay: string | null;
    city: string;
    province: string;
  };
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  schedule: {
    date: string;
    time: string;
    location: string;
  };
  priestName: string;
  priest: {
    id: string | null;
    name: string;
  };
  paymentSummary: {
    fee: number;
    amountPaid: number;
    balanceDue: number;
    isFullyPaid: boolean;
    paymentCount: number;
    receiptNumbers: string[];
  };
  requirementReadiness: {
    metCount: number;
    totalCount: number;
    isComplete: boolean;
    items: {
      key: string;
      label: string;
      isMet: boolean;
      verifiedAt: string | null;
    }[];
  };
}

export type ReceiptReversalStatus = 'ACTIVE' | 'REVERSED' | 'REVERSAL_ENTRY';

export interface OfficialReceiptData {
  dioceseHeader: string;
  cathedralHeader: string;
  cathedralAddress: string;
  receiptNumber: string;
  kind: 'PAYMENT' | 'REVERSAL';
  dateIssued: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  provider: string;
  providerChannel: string | null;
  providerChannelLabel: string | null;
  providerRef: string | null;
  amount: number;
  reversalStatus: ReceiptReversalStatus;
  isReversed: boolean;
  isReversalEntry: boolean;
  reversedByReceiptNumber: string | null;
  reversesReceiptNumber: string | null;
  reversalReason: string | null;
  processedByName: string;
  appointmentReference: string;
  participantName: string;
  sacramentType: string;
  sacramentLabel: string;
  scheduledDate: string;
  scheduledTime: string;
  verificationSeal: string;
  verificationPayload: string;
  qrSvg: string;
}

function normalizeDateString(d: Date | string): string {
  if (d instanceof Date) return utcToDateOnly(d);
  return d.trim().slice(0, 10);
}

function normalizeIsoTimestamp(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toISOString();
}

/**
 * Build structured QR Appointment Confirmation Pass data for a booking.
 */
export function buildAppointmentPassData(
  appointment: PassAppointmentInput,
  paymentsInput?: PassPaymentInput[],
  requirementsInput?: PassRequirementInput[]
): AppointmentPassData {
  const payments = paymentsInput ?? appointment.payments ?? [];
  const requirements = requirementsInput ?? appointment.requirements ?? [];

  const referenceNumber = normalizeReference(appointment.referenceNumber);
  const scheduledDate = normalizeDateString(appointment.scheduledDate);
  const scheduledTime = appointment.scheduledTime.trim();
  const location = appointment.location?.trim() || DEFAULT_LOCATION;
  const sacramentType = appointment.sacramentType;
  const sacramentLabel = SACRAMENT_LABELS[sacramentType] || sacramentType;
  const priestName = appointment.assignedPriest?.name?.trim() || 'To be assigned by Parish Office';

  const feeCentavos = toCentavos(appointment.fee);
  const netPaidCentavos = sumCentavos(payments.map((p) => p.amount));
  const dueCentavos = balanceDueCentavos(appointment.fee, netPaidCentavos);

  const fee = fromCentavos(feeCentavos);
  const amountPaid = fromCentavos(netPaidCentavos);
  const balanceDue = fromCentavos(dueCentavos);
  const isFullyPaid = feeCentavos > 0 && dueCentavos === 0;

  const activeReceiptNumbers = payments
    .filter((p) => {
      const isReversal = p.kind === 'REVERSAL' || toCentavos(p.amount) < 0;
      return !isReversal && !p.reversal;
    })
    .map((p) => p.receiptNumber);

  const reqItems = requirements.map((r, idx) => ({
    key: r.key || `req_${idx + 1}`,
    label: r.label,
    isMet: Boolean(r.isMet),
    verifiedAt: normalizeIsoTimestamp(r.verifiedAt),
  }));
  const metCount = reqItems.filter((r) => r.isMet).length;
  const totalCount = reqItems.length;
  const isComplete = totalCount > 0 ? metCount === totalCount : true;

  const verificationSeal = signPassCode(referenceNumber);
  const verificationPayload = [
    'ICCP',
    'PASS',
    referenceNumber,
    sacramentType,
    scheduledDate,
    scheduledTime,
    verificationSeal,
  ].join('|');
  const qrSvg = generateVerificationQrSvg(verificationPayload);

  return {
    dioceseHeader: DIOCESE_HEADER,
    cathedralHeader: CATHEDRAL_HEADER,
    cathedralAddress: CATHEDRAL_ADDRESS,
    referenceNumber,
    verificationSeal,
    verificationPayload,
    qrSvg,
    status: appointment.status,
    sacramentType,
    sacramentLabel,
    participantName: appointment.participantName.trim(),
    participant: {
      name: appointment.participantName.trim(),
      phone: appointment.participantPhone ?? null,
      email: appointment.participantEmail ?? null,
      barangay: appointment.barangay ?? null,
      city: appointment.city?.trim() || DEFAULT_CITY,
      province: appointment.province?.trim() || DEFAULT_PROVINCE,
    },
    scheduledDate,
    scheduledTime,
    location,
    schedule: {
      date: scheduledDate,
      time: scheduledTime,
      location,
    },
    priestName,
    priest: {
      id: appointment.assignedPriest?.id ?? null,
      name: priestName,
    },
    paymentSummary: {
      fee,
      amountPaid,
      balanceDue,
      isFullyPaid,
      paymentCount: payments.length,
      receiptNumbers: activeReceiptNumbers,
    },
    requirementReadiness: {
      metCount,
      totalCount,
      isComplete,
      items: reqItems,
    },
  };
}

/**
 * Build structured Diocesan Official Receipt data (`RCP-YYYY-NNNNN` or `RVS-YYYY-NNNNN`).
 */
export function buildOfficialReceiptData(
  payment: PassPaymentInput & {
    appointment?: Pick<
      PassAppointmentInput,
      'referenceNumber' | 'participantName' | 'sacramentType' | 'scheduledDate' | 'scheduledTime'
    >;
  },
  appointmentInput?: Pick<
    PassAppointmentInput,
    'referenceNumber' | 'participantName' | 'sacramentType' | 'scheduledDate' | 'scheduledTime'
  >
): OfficialReceiptData {
  const appt = appointmentInput ?? payment.appointment;
  if (!appt) {
    throw new Error('Appointment context is required to build an official receipt');
  }

  const receiptNumber = payment.receiptNumber.trim().toUpperCase();
  const amountCentavos = toCentavos(payment.amount);
  const amount = fromCentavos(amountCentavos);
  const isReversalEntry =
    payment.kind === 'REVERSAL' || amountCentavos < 0 || receiptNumber.startsWith('RVS-');
  const isReversed = !isReversalEntry && Boolean(payment.reversal);

  const reversalStatus: ReceiptReversalStatus = isReversalEntry
    ? 'REVERSAL_ENTRY'
    : isReversed
    ? 'REVERSED'
    : 'ACTIVE';

  const kind: 'PAYMENT' | 'REVERSAL' = isReversalEntry ? 'REVERSAL' : 'PAYMENT';
  const dateIssued =
    normalizeIsoTimestamp(payment.createdAt) ?? new Date(0).toISOString();

  const paymentMethod = payment.paymentMethod;
  const paymentMethodLabel = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod;
  const provider = payment.provider?.trim() || 'MANUAL';
  const providerChannel = payment.providerChannel?.trim() || null;
  const providerChannelLabel = providerChannel
    ? PROVIDER_CHANNEL_LABELS[providerChannel] || providerChannel
    : null;
  const providerRef =
    payment.providerRef?.trim() || payment.gcashRefNumber?.trim() || null;

  const appointmentReference = normalizeReference(appt.referenceNumber);
  const sacramentType = appt.sacramentType;
  const sacramentLabel = SACRAMENT_LABELS[sacramentType] || sacramentType;
  const scheduledDate = normalizeDateString(appt.scheduledDate);
  const scheduledTime = appt.scheduledTime.trim();

  const verificationSeal = signPassCode(receiptNumber);
  const verificationPayload = [
    'ICCP',
    'OR',
    receiptNumber,
    appointmentReference,
    amount.toFixed(2),
    reversalStatus,
    verificationSeal,
  ].join('|');
  const qrSvg = generateVerificationQrSvg(verificationPayload);

  return {
    dioceseHeader: DIOCESE_HEADER,
    cathedralHeader: CATHEDRAL_HEADER,
    cathedralAddress: CATHEDRAL_ADDRESS,
    receiptNumber,
    kind,
    dateIssued,
    paymentMethod,
    paymentMethodLabel,
    provider,
    providerChannel,
    providerChannelLabel,
    providerRef,
    amount,
    reversalStatus,
    isReversed,
    isReversalEntry,
    reversedByReceiptNumber: payment.reversal?.receiptNumber ?? null,
    reversesReceiptNumber: payment.reversesPayment?.receiptNumber ?? null,
    reversalReason: payment.reason ?? null,
    processedByName: payment.processedBy?.name?.trim() || 'Online Payment Gateway',
    appointmentReference,
    participantName: appt.participantName.trim(),
    sacramentType,
    sacramentLabel,
    scheduledDate,
    scheduledTime,
    verificationSeal,
    verificationPayload,
    qrSvg,
  };
}
