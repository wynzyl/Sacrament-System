# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Church Sacrament Management System - a Next.js 14 web application for managing sacrament appointments, priest scheduling, and payment processing for a Catholic parish.

## Development Commands

```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Production build
npm run lint             # Run ESLint
npm run prisma:generate  # Generate Prisma client after schema changes
npm run prisma:migrate   # Run database migrations
npm run prisma:seed      # Seed database with initial data
```

## Initial Setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Requires PostgreSQL running on localhost:5432 with database `ParishSacramentDB`.

## Architecture

### Tech Stack
- **Framework**: Next.js 14 with App Router (TypeScript)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **Auth**: Session-based with bcrypt password hashing

### Data Models (prisma/schema.prisma)
- **User**: System users with roles (ADMIN, PRIEST, CASHIER) and status
- **Session**: Server-side authentication tokens (7-day expiry)
- **Appointment**: Sacrament schedules (BAPTISM, WEDDING, CONFIRMATION, FUNERAL, FIRST_COMMUNION, ANOINTING_OF_SICK)
- **Payment**: Payment records linked to appointments (CASH, GCASH methods)

### Role-Based Dashboards
- `/admin` - Full management: users, appointments, priests, payments
- `/priest` - View assigned appointments, mark as completed
- `/cashier` - Process payments for confirmed appointments

### API Structure (app/api/)
- `/auth/login`, `/auth/logout`, `/auth/session` - Authentication
- `/appointments`, `/appointments/[id]` - CRUD operations
- `/users`, `/users/[id]` - User management
- `/payments`, `/payments/today` - Payment processing

### Key Files
- `lib/auth.ts` - Authentication helpers, session management
- `lib/prisma.ts` - Prisma client singleton
- `middleware.ts` - Route protection, session validation

### Authentication Flow
1. Login validates credentials via `/api/auth/login`
2. Session token stored in httpOnly cookie (`session_token`)
3. Middleware validates token on protected routes
4. Role determines dashboard redirect (admin/priest/cashier)

### Patterns
- API routes return `NextResponse` with consistent error handling
- Appointments auto-mark as COMPLETED when past scheduled date
- Payment processing automatically completes associated appointment
- Modal-based forms with edit/create modes in dashboard pages
