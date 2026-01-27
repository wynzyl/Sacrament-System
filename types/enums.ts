// types/enums.ts
// TypeScript enums matching Prisma schema

export enum UserRole {
  ADMIN = 'ADMIN',
  PRIEST = 'PRIEST',
  CASHIER = 'CASHIER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PriestAvailability {
  AVAILABLE = 'AVAILABLE',
  DAYOFF = 'DAYOFF',
}

export enum SacramentType {
  BAPTISM = 'BAPTISM',
  WEDDING = 'WEDDING',
  CONFIRMATION = 'CONFIRMATION',
  FUNERAL = 'FUNERAL',
  FIRST_COMMUNION = 'FIRST_COMMUNION',
  ANOINTING_OF_SICK = 'ANOINTING_OF_SICK',
  MASS_INTENTION = 'MASS_INTENTION',
}

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  GCASH = 'GCASH',
}
