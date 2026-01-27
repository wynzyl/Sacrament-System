// types/index.ts
// Centralized type definitions for the Sacrament System

import {
  UserRole,
  UserStatus,
  PriestAvailability,
  SacramentType,
  AppointmentStatus,
  PaymentMethod,
} from './enums';

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  status?: UserStatus | string;
  availability?: PriestAvailability | string;
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
// Appointment Types
// ============================================

export interface Appointment {
  id: string;
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
  fee: number;
  assignedPriestId: string | null;
  assignedPriest?: {
    id: string;
    name: string;
  } | null;
  createdBy?: {
    name: string;
    email: string;
  };
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
  amount: number;
  paymentMethod: PaymentMethod | string;
  receiptNumber: string;
  gcashRefNumber?: string | null;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: SacramentType | string;
    scheduledDate?: string;
  };
  processedBy?: {
    name: string;
  };
}

export interface PaymentSummary {
  cash: number;
  gcash: number;
  total: number;
}

// ============================================
// Report Types
// ============================================

export interface ReportAppointment {
  id: string;
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
  amount: number;
  paymentMethod: PaymentMethod | string;
  receiptNumber: string;
  createdAt: string;
  appointment: {
    participantName: string;
    sacramentType: SacramentType | string;
    scheduledDate: string;
  };
}

export interface CollectionsReportData {
  payments: ReportPayment[];
  totals: PaymentSummary;
}

// ============================================
// Tab Types
// ============================================

export type AdminTabType = 'dashboard' | 'appointments' | 'users' | 'priests' | 'payments' | 'reports';
export type CashierTabType = 'payments' | 'reports';
export type PriestTabType = 'appointments' | 'reports';

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
