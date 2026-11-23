// lib/constants.ts
// Centralized constants and configuration values

import {
  SacramentType,
  AppointmentStatus,
  UserRole,
  UserStatus,
  PriestAvailability,
  PaymentMethod,
} from '@/types';

// ============================================
// Church Information
// ============================================

export const CHURCH_NAME = 'Immaculate Conception Cathedral Parish';
export const DEFAULT_LOCATION = 'Immaculate Conception Cathedral Parish';
export const DEFAULT_CITY = 'Urdaneta City';
export const DEFAULT_PROVINCE = 'Pangasinan';

// ============================================
// Barangays in Urdaneta City, Pangasinan
// ============================================

export const URDANETA_BARANGAYS = [
  'Anonas',
  'Bactad East',
  'Bayaoas',
  'Bolaoen',
  'Cabaruan',
  'Cabuloan',
  'Camanang',
  'Camantiles',
  'Casantaan',
  'Catablan',
  'Cayambanan',
  'Consolacion',
  'Dilan Paurido',
  'Dr. Pedro T. Orata (Bactad Proper)',
  'Labit Proper',
  'Labit West',
  'Mabanogbog',
  'Macalong',
  'Nancalobasaan',
  'Nancamaliran East',
  'Nancamaliran West',
  'Nancayasan',
  'Oltama',
  'Palina East',
  'Palina West',
  'Pinmaludpod',
  'Poblacion',
  'San Jose',
  'San Vicente',
  'Santa Lucia',
  'Santo Domingo',
  'Sugcong',
  'Tipuso',
  'Tulong',
] as const;

export type Barangay = (typeof URDANETA_BARANGAYS)[number];

// ============================================
// Sacrament Configuration
// ============================================

export const SACRAMENT_LABELS: Record<SacramentType | string, string> = {
  [SacramentType.BAPTISM]: 'Baptism',
  [SacramentType.WEDDING]: 'Wedding',
  [SacramentType.CONFIRMATION]: 'Confirmation',
  [SacramentType.FUNERAL]: 'Funeral',
  [SacramentType.FIRST_COMMUNION]: 'First Communion',
  [SacramentType.ANOINTING_OF_SICK]: 'Anointing of Sick',
  [SacramentType.MASS_INTENTION]: 'Mass Intention',
};

export const SACRAMENT_ICONS: Record<SacramentType | string, string> = {
  [SacramentType.BAPTISM]: '💧',
  [SacramentType.WEDDING]: '💒',
  [SacramentType.CONFIRMATION]: '✋',
  [SacramentType.FUNERAL]: '🕯️',
  [SacramentType.FIRST_COMMUNION]: '🍞',
  [SacramentType.ANOINTING_OF_SICK]: '🙏',
  [SacramentType.MASS_INTENTION]: '✝️',
};

export const SACRAMENT_ORDER: (SacramentType | string)[] = [
  SacramentType.BAPTISM,
  SacramentType.WEDDING,
  SacramentType.CONFIRMATION,
  SacramentType.FUNERAL,
  SacramentType.FIRST_COMMUNION,
  SacramentType.ANOINTING_OF_SICK,
  SacramentType.MASS_INTENTION,
];

// ============================================
// Payment Methods & Online Provider Channels
// ============================================

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod | string, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.GCASH]: 'GCash',
  [PaymentMethod.ONLINE_WALLET]: 'Online Wallet',
  [PaymentMethod.BANK_TRANSFER]: 'Bank Transfer',
};

export const ONLINE_WALLET_CHANNELS = [
  { id: 'MAYA', label: 'Maya (PayMaya)' },
  { id: 'GCASH_ONLINE', label: 'GCash Express' },
  { id: 'GRABPAY', label: 'GrabPay' },
  { id: 'SHOPEEPAY', label: 'ShopeePay' },
] as const;

export const BANK_TRANSFER_CHANNELS = [
  { id: 'INSTAPAY', label: 'InstaPay (Real-Time Bank Transfer)' },
  { id: 'PESONET', label: 'PESONet' },
  { id: 'BPI', label: 'BPI Online' },
  { id: 'BDO', label: 'BDO Online' },
  { id: 'UNIONBANK', label: 'UnionBank Online' },
  { id: 'METROBANK', label: 'Metrobank Direct' },
  { id: 'LANDBANK', label: 'Landbank iAccess' },
] as const;

export const ALL_PROVIDER_CHANNEL_IDS = [
  ...ONLINE_WALLET_CHANNELS.map((c) => c.id),
  ...BANK_TRANSFER_CHANNELS.map((c) => c.id),
] as const;

export const PROVIDER_CHANNEL_LABELS: Record<string, string> = Object.fromEntries([
  ...ONLINE_WALLET_CHANNELS.map((c) => [c.id, c.label]),
  ...BANK_TRANSFER_CHANNELS.map((c) => [c.id, c.label]),
]);

// ============================================
// Status Options
// ============================================

export const APPOINTMENT_STATUS_OPTIONS = Object.values(AppointmentStatus);
export const USER_ROLE_OPTIONS = Object.values(UserRole);
export const USER_STATUS_OPTIONS = Object.values(UserStatus);
export const PRIEST_AVAILABILITY_OPTIONS = Object.values(PriestAvailability);
export const PAYMENT_METHOD_OPTIONS = Object.values(PaymentMethod);

// ============================================
// Status Colors (Tailwind classes)
// ============================================

export const STATUS_COLORS: Record<string, string> = {
  // Appointment Status
  [AppointmentStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [AppointmentStatus.CONFIRMED]: 'bg-blue-100 text-blue-800',
  [AppointmentStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [AppointmentStatus.CANCELLED]: 'bg-red-100 text-red-800',
  // User Status
  [UserStatus.ACTIVE]: 'bg-green-100 text-green-800',
  [UserStatus.INACTIVE]: 'bg-red-100 text-red-800',
  // Priest Availability
  [PriestAvailability.AVAILABLE]: 'bg-green-100 text-green-800',
  [PriestAvailability.DAYOFF]: 'bg-gray-100 text-gray-800',
};

export const ROLE_COLORS: Record<string, string> = {
  [UserRole.ADMIN]: 'bg-red-100 text-red-800',
  [UserRole.PRIEST]: 'bg-purple-100 text-purple-800',
  [UserRole.CASHIER]: 'bg-green-100 text-green-800',
  [UserRole.PARISHIONER]: 'bg-blue-100 text-blue-800',
};

// ============================================
// Default Form Values
// ============================================

export const DEFAULT_APPOINTMENT_FORM = {
  sacramentType: SacramentType.BAPTISM as string,
  participantName: '',
  participantPhone: '',
  participantEmail: '',
  barangay: '',
  city: DEFAULT_CITY,
  province: DEFAULT_PROVINCE,
  scheduledDate: '',
  scheduledTime: '',
  location: DEFAULT_LOCATION,
  notes: '',
  fee: '500',
  status: AppointmentStatus.PENDING as string,
  assignedPriestId: '',
};

export const DEFAULT_USER_FORM = {
  name: '',
  email: '',
  password: '',
  role: UserRole.CASHIER as string,
  status: UserStatus.ACTIVE as string,
  availability: PriestAvailability.AVAILABLE as string,
};

export const DEFAULT_PRIEST_FORM = {
  name: '',
  email: '',
  password: '',
  status: UserStatus.ACTIVE as string,
  availability: PriestAvailability.AVAILABLE as string,
};

// ============================================
// Filter Defaults
// ============================================

export const DEFAULT_FILTER_STATE = {
  searchTerm: '',
  dateFrom: '',
  dateTo: '',
  statusFilter: 'all',
  sacramentFilter: 'all',
  sortField: 'date' as const,
  sortDirection: 'asc' as const,
};
