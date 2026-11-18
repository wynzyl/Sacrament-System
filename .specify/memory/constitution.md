<!--
Sync Impact Report
==================
Version change: (unfilled template) → 1.0.0
Bump rationale: Initial ratification. All placeholders replaced with concrete governance.

Principles defined (template slot → title):
- PRINCIPLE_1 → I. Parishioner-First Booking
- PRINCIPLE_2 → II. Financial Integrity & Auditability (NON-NEGOTIABLE)
- PRINCIPLE_3 → III. Secure by Default & Privacy-Respecting
- PRINCIPLE_4 → IV. Scheduling Correctness
- PRINCIPLE_5 → V. Modern Next.js & End-to-End Type Safety
- (added) → VI. Test-Backed Changes
- (added) → VII. Observability & Simplicity

Added sections:
- Technology & Compliance Constraints (SECTION_2)
- Development Workflow & Quality Gates (SECTION_3)
- Governance (filled)

Removed sections: none

Templates reviewed (not modified by this command; they read the constitution at runtime):
- .specify/templates/plan-template.md — "Constitution Check" gate will evaluate principles I–VII
- .specify/templates/spec-template.md — no structural change required
- .specify/templates/tasks-template.md — Principle VI makes tests mandatory for money/scheduling

Known gaps between current code and this constitution (to be addressed via features, not here):
- Monetary fields (Appointment.fee, Payment.amount) use Float; Principle II requires
  Decimal or integer minor units.
- No automated test suite exists; Principle VI requires one for money and scheduling logic.
- React 18 is pinned while Next.js 16 is installed; Principle V requires the React version
  that the current Next.js release supports.
- No append-only audit log model exists; Principle II requires one.

Deferred TODOs: none
-->

# Parish Sacrament System Constitution

## Core Principles

### I. Parishioner-First Booking

The system exists so parishioners can request sacrament appointments and pay for them without
an in-person office visit, while parish staff stay in control of the final schedule.

- Parishioners MUST be able to view available dates/times, submit a booking request, and pay
  online without creating staff-level accounts.
- Every public-facing flow MUST be usable on a mobile phone (360px width) and meet WCAG 2.1 AA.
- A booking MUST NOT be presented to the parishioner as confirmed until staff confirm it or the
  sacrament type is explicitly configured for automatic confirmation.
- Parishioners MUST receive a reference number and a clear status (pending, confirmed,
  completed, cancelled) for every booking and payment.
- Sacrament-specific requirements (documents, seminars, sponsors) MUST be shown before booking,
  not discovered after payment.

Rationale: Parishioners are non-technical and often book on phones; trust depends on never
implying a confirmation or charge that the office has not approved.

### II. Financial Integrity & Auditability (NON-NEGOTIABLE)

Every peso received, refunded, or voided MUST be traceable to a person, a time, and a reason.

- Monetary amounts MUST be stored as Prisma `Decimal` or integer minor units (centavos).
  Floating-point types MUST NOT be used for money anywhere: database, API, or UI arithmetic.
- Payment records MUST be append-only. Corrections, refunds, and voids MUST be recorded as new
  reversing entries that reference the original; payments MUST NOT be updated in place or
  hard-deleted.
- Every state change to an appointment, payment, fee, or user role MUST write an audit log
  entry capturing actor, action, timestamp (UTC), target entity, and before/after values.
  Audit log entries MUST be immutable through the application.
- Receipt numbers MUST be unique and generated server-side inside the same database transaction
  as the payment record.
- Online payments MUST be confirmed only from a verified provider webhook or server-side
  verification call, never from client-side redirects alone. Webhook handlers MUST verify
  signatures and be idempotent (keyed on the provider's event/transaction ID).
- Operations that create or mutate money records MUST run in a single database transaction.
- The system MUST support daily reconciliation: totals by method (cash, GCash, online gateway)
  per cashier per day MUST be reproducible from stored records alone.

Rationale: Parish funds are held in trust and subject to diocesan audit. Float rounding,
silent edits, and unverified payment confirmations are the most common sources of
irreconcilable books.

### III. Secure by Default & Privacy-Respecting

- Authorization MUST be enforced on the server for every route handler, Server Action, and data
  access function. Route protection in `proxy.ts` is a convenience layer and MUST NOT be the
  only check.
- Roles (ADMIN, PRIEST, CASHIER, and any parishioner identity) MUST follow least privilege; a
  role MUST NOT read or mutate data outside its responsibility.
- All external input (request bodies, query params, form data, webhook payloads) MUST be
  validated with a runtime schema (e.g., Zod) before use.
- Passwords MUST be hashed with bcrypt (or stronger); session tokens MUST live in `httpOnly`,
  `secure`, `sameSite` cookies; sessions MUST expire and be revocable.
- The system MUST NOT store card numbers or wallet credentials; online payment MUST use a hosted
  checkout or tokenized flow from a PCI-compliant provider.
- Personal data of parishioners MUST be handled per the Philippine Data Privacy Act of 2012 (RA
  10173): collect only what the sacrament requires, never log it in plaintext, and support
  correction and deletion requests (soft-delete with retention rules for financial records).
- Secrets MUST come from environment variables and MUST NOT be committed.

Rationale: The system holds personal, sacramental, and financial data for a community; a single
leak or privilege bug undermines the parish's trust.

### IV. Scheduling Correctness

- The database MUST be the single source of truth for priest availability and appointments.
  Double-booking a priest or a venue MUST be prevented by a transactional check or database
  constraint, not by UI checks alone.
- All timestamps MUST be stored in UTC and displayed in `Asia/Manila`. Date-only and time-of-day
  values MUST NOT be compared as strings.
- Appointment status MUST follow an explicit, documented state machine (e.g., PENDING →
  CONFIRMED → COMPLETED, any non-completed → CANCELLED). Invalid transitions MUST be rejected
  server-side. Automatic transitions (e.g., auto-complete after the scheduled date) MUST be
  recorded in the audit log as system actions.
- Priest days off, leave, and recurring commitments MUST block booking for that priest.
- Cancellations and reschedules MUST state their effect on any payment (refund, credit, or
  forfeit) and record it per Principle II.

Rationale: A double-booked funeral or wedding cannot be fixed after the fact; scheduling rules
must be enforced where concurrency is controlled.

### V. Modern Next.js & End-to-End Type Safety

- The app MUST track the latest stable Next.js release using the App Router, and MUST use the
  React version that release officially supports. Major upgrades MUST land within one minor
  release cycle and follow the official codemods.
- React Server Components are the default; `"use client"` MUST be limited to components that
  need interactivity or browser APIs.
- Mutations MUST go through Server Actions or route handlers that reuse shared, validated
  service functions in `lib/`; business logic MUST NOT live in React components.
- TypeScript `strict` mode MUST be enabled. `any`, non-null assertions on external data, and
  `@ts-ignore` MUST NOT be introduced without an inline justification.
- Prisma MUST be the only data access layer; raw SQL is allowed only via parameterized
  `$queryRaw` with a comment explaining why.
- Lint (ESLint with the Next.js config) and type-check MUST pass with zero errors before merge.

Rationale: Following the framework's current, supported path keeps security patches flowing and
makes the codebase understandable to any Next.js developer.

### VI. Test-Backed Changes

- Any change touching money, payment status, receipts, audit logging, scheduling conflicts, or
  authorization MUST include automated tests that fail without the change.
- Unit/integration tests (e.g., Vitest) MUST cover service functions in `lib/`; end-to-end
  tests (e.g., Playwright) MUST cover the parishioner booking-and-payment path and the cashier
  payment path.
- Payment provider integrations MUST be tested against the provider's sandbox or recorded
  fixtures, including duplicate and out-of-order webhook delivery.
- Bug fixes MUST include a regression test reproducing the bug.

Rationale: Financial and scheduling defects are costly and hard to detect manually; tests are
the evidence that audit rules actually hold.

### VII. Observability & Simplicity

- Server errors MUST be logged with structured context (request ID, user ID, action) and MUST
  NOT include passwords, tokens, or unmasked personal data.
- Payment and webhook events MUST be logged with provider reference IDs to support
  reconciliation and dispute handling.
- Prefer the simplest design that satisfies the spec (YAGNI). New dependencies, services, or
  abstractions MUST be justified in the plan's Complexity Tracking table.

Rationale: A small parish team maintains this system; clarity and diagnosable failures matter
more than architectural sophistication.

## Technology & Compliance Constraints

- **Runtime stack**: Next.js (latest stable, App Router), React (version required by Next.js),
  TypeScript (strict), Prisma ORM, PostgreSQL, Tailwind CSS.
- **Payments**: Cash and GCash (manual reference entry) for in-office payments; online payments
  via a PCI-compliant provider supporting PHP and local e-wallets. Currency is PHP; amounts are
  displayed with two decimal places.
- **Locale**: Timezone `Asia/Manila`; currency formatting `en-PH` / `PHP`.
- **Data retention**: Financial and audit records MUST be retained (soft-deleted at most) for
  the period required by diocesan and BIR record-keeping rules; the retention period MUST be
  documented in configuration.
- **Database changes**: Schema changes MUST ship as Prisma migrations; destructive migrations on
  financial or audit tables MUST include a data-preservation plan.
- **Deployment**: Production builds MUST pass `npm run build`; environment configuration MUST be
  documented in `.env.example` without real secrets.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` (as needed) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Every plan MUST complete the Constitution Check against Principles I–VII before design and
  again after design; violations MUST be justified in Complexity Tracking or the design
  revised.
- Changes MUST be made on feature branches and merged via pull request; direct commits to
  `main` are not permitted.
- Pull requests MUST pass lint, type-check, tests, and build in CI before merge.
- Pull requests touching payments, audit logging, authorization, or migrations of financial
  tables MUST be reviewed with explicit attention to Principles II and III, and the PR
  description MUST state how compliance was verified.

## Governance

- This constitution supersedes conflicting practices, conventions, and guidance files. Where
  `CLAUDE.md` or other runtime guidance conflicts with it, this document wins and the guidance
  file MUST be updated.
- Amendments MUST be proposed via pull request that edits this file, includes a Sync Impact
  Report, and states the version bump and its rationale.
- Versioning follows semantic versioning:
  - MAJOR: removal or backward-incompatible redefinition of a principle or governance rule.
  - MINOR: a new principle or section, or materially expanded guidance.
  - PATCH: clarifications, wording, and typo fixes with no change in meaning.
- Compliance is reviewed at every `/speckit-plan` Constitution Check, at every pull request
  review, and in a full audit of the codebase against this document at least once per quarter.
- Known gaps between the existing codebase and these principles MUST be tracked as features or
  tasks and MUST NOT be expanded by new work.

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
