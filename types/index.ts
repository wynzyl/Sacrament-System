// types/index.ts
// Centralized type definitions for the Sacrament System

import {
  UserRole,
  UserStatus,
  PriestAvailability,
  SacramentType,
  AppointmentStatus,
  PaymentMethod,
  OnlinePaymentStatus,
  AppointmentSource,
  PaymentKind,
} from './enums';

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  barangay?: string | null;
  role: UserRole | string;
  status?: UserStatus | string;
  availability?: PriestAvailability | string;
  emailVerifiedAt?: string | null;
  createdAt?: string;
}

export interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: UserRole | string;
  status: UserStatus | string;
  availability: PriestAvailability | string;
}

// ============================================
// Appointment & Requirement Types
// ============================================

export interface AppointmentRequirementItem {
  id: string;
  appointmentId: string;
  key: string;
  label: string;
  isMet: boolean;
  verifiedById?: string | null;
  verifiedAt?: string | null;
}

export interface Appointment {
  id: string;
  referenceNumber?: string;
  source?: AppointmentSource | string;
  sacramentType: SacramentType | string;
  participantName: string;
  participantPhone: string | null;
  participantEmail: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  scheduledDate: string;
  scheduledTime: string;
  location: string | null;
  notes: string | null;
  status: AppointmentStatus | string;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  fee: number;
  amountPaid?: number;
  balanceDue?: number;
  requirementsMet?: number;
  requirementsTotal?: number;
  assignedPriestId: string | null;
  assignedPriest?: {
    id: string;
    name: string;
  } | null;
  createdBy?: {
    name: string;
    email: string;
  } | null;
}

export interface AppointmentFormData {
  sacramentType: SacramentType | string;
  participantName: string;
  participantPhone: string;
  participantEmail: string;
  barangay: string;
  city: string;
  province: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  notes: string;
  fee: string;
  status: AppointmentStatus | string;
  assignedPriestId: string;
}

// ============================================
// Payment Types
// ============================================

export interface Payment {
  id: string;
  kind?: PaymentKind | string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  receiptNumber: string;
  gcashRefNumber?: string | null;
  provider?: string | null;
  providerChannel?: string | null;
  providerRef?: string | null;
  reason?: string | null;
  reversesPaymentId?: string | null;
  reversal?: {
    id: string;
    receiptNumber: string;
  } | null;
  reversesPayment?: {
    id: string;
    receiptNumber: string;
  } | null;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: SacramentType | string;
    referenceNumber?: string;
    scheduledDate?: string;
  };
  processedBy?: {
    name: string;
  } | null;
}

export interface PaymentSummary {
  cash: number;
  gcash: number;
  onlineWallet?: number;
  bankTransfer?: number;
  total: number;
}

export interface OnlinePaymentIntentPublic {
  id: string;
  providerIntentId: string;
  provider: string;
  paymentMethod: PaymentMethod | string;
  providerChannel: string;
  amount: number;
  status: OnlinePaymentStatus | string;
  referenceNumber?: string | null;
  receiptNumber?: string | null;
  expiresAt: string;
  appointment: {
    referenceNumber: string;
    sacramentType: SacramentType | string;
    scheduledDate: string;
    scheduledTime: string;
    location: string | null;
  };
}

// ============================================
// Report Types
// ============================================

export interface ReportAppointment {
  id: string;
  referenceNumber?: string;
  sacramentType: SacramentType | string;
  participantName: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string | null;
  notes: string | null;
  status?: AppointmentStatus | string;
  assignedPriest?: {
    name: string;
  } | null;
}

export interface ReportPayment {
  id: string;
  kind?: PaymentKind | string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  provider?: string | null;
  providerChannel?: string | null;
  providerRef?: string | null;
  receiptNumber: string;
  reason?: string | null;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: SacramentType | string;
    referenceNumber?: string;
    scheduledDate: string;
  };
  processedBy?: {
    name: string;
  } | null;
}

export interface CollectionsReportData {
  payments: ReportPayment[];
  totals: PaymentSummary;
}

// ============================================
// Audit Log Types
// ============================================

export interface AuditLogEntry {
  id: string;
  actorType: 'USER' | 'SYSTEM' | 'PUBLIC' | string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType:
    | 'Appointment'
    | 'Payment'
    | 'User'
    | 'AppointmentRequirement'
    | 'OnlinePaymentIntent'
    | string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

// ============================================
// Tab Types
// ============================================

export type AdminTabType =
  | 'dashboard'
  | 'appointments'
  | 'calendar'
  | 'users'
  | 'priests'
  | 'payments'
  | 'reports'
  | 'audit';
export type CashierTabType = 'payments' | 'reports';
export type PriestTabType = 'appointments' | 'calendar' | 'reports';

// ============================================
// Filter & Sort Types
// ============================================

export type SortField = 'date' | 'name' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
  statusFilter: string;
  sacramentFilter: string;
  sortField: SortField;
  sortDirection: SortDirection;
}

// Re-export enums for convenience
export * from './enums';
