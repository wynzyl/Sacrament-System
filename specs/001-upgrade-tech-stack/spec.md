# Feature Specification: Upgrade Tech Stack to Latest Stable Versions

**Feature Branch**: `001-upgrade-tech-stack`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "upgrade the tech stack into latest versions including NextJs, Tailwindcss, pg, typescript, react, shadcn."

## Context

The parish system runs on a mismatched set of platform versions. The web framework was moved to
its newest major release, but the UI library, linting toolchain, styling engine, and database
access layer were left on older releases. That mix is not an officially supported combination, the
project's lint command no longer runs, and the constitution (Principle V) requires the app to
track the latest stable framework release with the UI library version that release supports.
There is also no shared component library, so dialogs, badges, buttons, and form fields are
hand-built and look and behave slightly differently from screen to screen.

This feature brings every named platform piece (web framework, UI library, styling engine,
language/type checker, PostgreSQL driver, component library) to its latest stable release. The
parish staff's day-to-day experience must stay the same, and no data may be lost.

## Clarifications

### Session 2026-11-19

- Q: Which exact versions should the web framework, UI library, and type checker target? → A: Next.js 16.4.6 (exact), React 19.3.x (19.3.1 at time of clarification; react-dom matched), TypeScript 7.x (7.0.2 at time of clarification). *(TypeScript target superseded by the next answer.)*
- Q: TypeScript 7 conflicts with the lint toolchain (typescript-eslint 8.73.0 accepts TypeScript below 6.1 only), so how should we handle it? → A: Use TypeScript 6.0.3 now. Move to TypeScript 7 in a follow-up feature once the lint toolchain officially supports it.
- Q: How should we prove staff workflows still work after the upgrade? → A: Add automated end-to-end regression tests first, covering sign-in and access per role, payment processing, appointment completion, and report totals. They run green on the current stack before any upgrade and are re-run after every stage.
- Q: Where does the production system run? → A: Both a Docker container and Vercel. The upgrade must build, run, and roll back on both.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff keep working without disruption after the upgrade (Priority: P1)

An administrator, priest, or cashier signs in after the upgraded system is deployed and does
their usual work: managing users, priests, and appointments; viewing and completing assigned
appointments; recording cash and GCash payments; and generating and exporting reports. Every
workflow behaves exactly as before, and every existing record is still there and unchanged.

**Why this priority**: The upgrade only delivers value if the parish office can keep running on
it. Any broken workflow or altered record (especially a payment) outweighs all other benefits.

**Independent Test**: Take a snapshot of record counts and payment totals, then deploy the
upgraded system against a copy of production data. Run the automated end-to-end regression
suite (FR-017) for every role and compare the snapshot again.

**Acceptance Scenarios**:

1. **Given** an existing staff account, **When** the user signs in on the upgraded system,
   **Then** they land on the same role dashboard as before and their session lasts as long as
   before.
2. **Given** a confirmed appointment, **When** a cashier records a payment for it, **Then** the
   payment is saved with the same amount, method, and receipt details as before the upgrade,
   and the appointment is marked completed.
3. **Given** the database before the upgrade, **When** the upgraded system is deployed and
   database changes are applied, **Then** the counts of users, appointments, and payments, and
   the per-method payment totals for every day, are identical to the pre-upgrade snapshot.
4. **Given** an administrator on the reports screen, **When** they generate and export the
   collections and appointments reports, **Then** the exported documents open correctly and
   show the same figures as the same reports before the upgrade.
5. **Given** a priest with assigned appointments, **When** they view and complete an
   appointment, **Then** the status change is saved and visible to the administrator.

---

### User Story 2 - Maintainer can install, check, and ship the project cleanly (Priority: P2)

A maintainer clones the project, installs dependencies, sets up and seeds the database, runs
the development server, and runs the lint, type-check, and production build commands. Every step
finishes with no errors and no version-conflict warnings, using only the commands in the project
documentation.

**Why this priority**: The constitution requires lint, type-check, and build to pass before
merging. A healthy toolchain keeps security patches flowing and every later feature depends on
it. It ranks below P1 because staff never see it directly.

**Independent Test**: In a clean checkout on a fresh machine, follow the documented setup steps
and run each project command. Record any errors or dependency-conflict warnings.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** dependencies are installed, **Then** installation
   finishes with no unresolved version-conflict (peer dependency) errors and no use of
   conflict-override flags.
2. **Given** an installed project, **When** the maintainer runs the lint command, **Then** it
   runs and reports zero errors.
3. **Given** an installed project, **When** the maintainer runs the type-check and the
   production build, **Then** both finish with zero errors.
4. **Given** an empty local database, **When** the maintainer runs the documented migrate and
   seed commands, **Then** the database is created and seeded with the default accounts, and
   those accounts can sign in.
5. **Given** the project documentation, **When** a maintainer reads it, **Then** it lists the
   upgraded platform versions, the minimum runtime version, and any changed setup steps.

---

### User Story 3 - Consistent, accessible shared UI components (Priority: P3)

Staff use dialogs, tables, tabs, status badges, buttons, and form fields that look and behave the
same on every screen (sign-in, admin, priest, and cashier). Every dialog can be opened, filled in, submitted, and closed with only the
keyboard, focus moves into and back out of dialogs predictably, and screen readers announce
dialog titles and field labels.

**Why this priority**: A shared component foundation lowers maintenance cost and improves
accessibility, which the constitution requires (WCAG 2.1 AA). It is less urgent than keeping
operations running and the toolchain healthy.

**Independent Test**: On each dashboard, open every create and edit dialog and complete it
using only the keyboard. Then run an automated accessibility check on each dashboard page.

**Acceptance Scenarios**:

1. **Given** any create or edit form on any dashboard, **When** the user opens it, **Then** it
   appears in the same shared dialog style with a title, keyboard focus inside the dialog, and
   Escape closing it.
2. **Given** an appointment or payment status shown anywhere in the app, **When** it is
   displayed, **Then** the same status always uses the same label and color.
3. **Given** a data table on any dashboard (appointments, payments, users, priests, reports),
   **When** it is displayed, **Then** it uses the same table style, header, empty state, and
   row layout as every other table in the app.
4. **Given** the tabbed admin, priest, and cashier dashboards, **When** the user switches tabs
   with the mouse or keyboard (arrow keys), **Then** the tabs behave the same way on every
   dashboard.
5. **Given** any page in the app, **When** an automated accessibility audit runs, **Then** it
   reports zero critical or serious violations.

---

### Edge Cases

- A staff member's browser session was created before the upgrade: the session must keep
  working, or the user must be sent cleanly to sign-in, never shown an error page.
- A staff member uses an older browser that the new styling engine does not support: the
  minimum supported browsers must be documented, and the sign-in page must stay usable.
- The database upgrade step fails halfway: no partial changes may remain, and the previous
  version must be able to run against the database again.
- Payment amounts with centavo values (e.g. ₱1,250.50) must display and total exactly the same
  before and after the upgrade.
- Date and time values must show the same calendar date and time in `Asia/Manila` before and
  after the upgrade, including appointments near midnight.
- A dependency the app relies on has no release compatible with the new platform versions: it
  must be replaced with an equivalent that keeps the same behavior, or the gap must be
  documented as a known issue.
- A requested target version conflicts with a required tool, as TypeScript 7 does with the
  lint toolchain: use the newest version that installs with zero conflicts, and record the
  deferred target as a follow-up.
- The Docker container restarts, or a new Vercel deployment cold-starts: the app must start
  and reach the database with no extra manual steps on either target.
- Many requests arrive at once on Vercel, where each serverless instance opens its own
  connections: database connections must not exhaust the PostgreSQL connection limit.

## Requirements *(mandatory)*

### Functional Requirements

**Platform versions**

- **FR-001**: The system MUST run on these pinned target versions: Next.js **16.4.6** (exact),
  React and React DOM **19.3.x**, and TypeScript **6.0.3** (exact). TypeScript 7 is deferred
  until the lint toolchain officially supports it. No version-conflict overrides may be used
  to force it in. The styling engine, PostgreSQL
  driver, database layer, and component library MUST use their latest stable (non-RC,
  non-beta) release that is compatible with those pinned versions, as of when the upgrade is
  implemented.
- **FR-002**: The system MUST access PostgreSQL through the current officially supported
  database layer with the PostgreSQL driver, keeping the same database, the same connection
  configuration source (environment variables), and the same data model.
- **FR-003**: The system MUST adopt the shadcn component library as its shared UI component
  foundation, configured to match the upgraded styling engine.
- **FR-004**: Supporting tools that must match these platforms (linting configuration, type
  definitions, style processing, database tooling, seed runner) MUST be upgraded to versions
  compatible with them.

**Behavior preservation**

- **FR-005**: All existing staff workflows (sign-in, sign-out, session expiry, user
  management, priest management, appointment create/edit/complete, payment processing,
  reports, and report export) MUST behave the same after the upgrade.
- **FR-006**: The upgrade MUST NOT change, delete, or reformat any stored record. If database
  changes are needed, they MUST be delivered as reversible, versioned migrations that keep all
  existing data.
- **FR-007**: Monetary amounts, receipt details, and audit-relevant fields MUST keep the same
  values and precision as before the upgrade. The upgrade MUST NOT add any new floating-point
  arithmetic on money.
- **FR-008**: Server-side authorization checks and route protection MUST stay in place and
  MUST be verified on every role-restricted page and API after the upgrade.
- **FR-009**: Existing visual layout and branding MUST remain recognizably the same. Changes
  in appearance MUST be limited to the consistency improvements from shared components.

**Shared components**

- **FR-010**: The entire staff-facing UI MUST be rebuilt on the shared component foundation.
  This covers the shared pieces (dialogs, status badges, buttons, form inputs, date presets,
  empty states, loading indicators, page headers) and every dashboard screen's forms, data
  tables, tabs, and report views on the sign-in, admin, priest, and cashier screens. After the
  migration, no hand-built duplicate of a component the foundation provides may remain.
- **FR-016**: The work MUST be delivered and verified in separately testable stages:
  (1) the automated regression suite, passing on the current stack; (2) platform versions,
  with behavior unchanged; (3) UI migration. This keeps a regression traceable to one cause.

**Regression verification**

- **FR-017**: Before any version changes, the project MUST gain an automated end-to-end
  regression suite. It covers: sign-in, sign-out, and redirect to the correct dashboard for
  each role; denial of access to pages and APIs outside a role; appointment create, edit, and
  complete; cash and GCash payment processing, including amounts, receipt details, and the
  appointment auto-completing; and report figures and export. The suite MUST pass on the
  current stack, and again after each stage in FR-016.
- **FR-018**: The regression suite MUST run against an isolated, seeded test database, never
  the development or production database. It MUST be runnable with one documented project
  command.

**Deployment targets**

- **FR-019**: The upgraded system MUST build and run on both production targets: a Docker
  container and Vercel. Database connection handling MUST suit each target: a long-lived pool
  in the container, and serverless-safe pooled connections on Vercel.
- **FR-020**: Each target MUST have a documented rollout and rollback procedure. That means
  redeploying the previous image or deployment and, if database migrations ran, restoring the
  pre-upgrade backup. A database backup MUST be taken before migrations run in production.
- **FR-011**: All dialogs MUST support keyboard-only operation: they trap focus, close on
  Escape, and return focus to the element that opened them.

**Toolchain**

- **FR-012**: The project's lint, type-check, build, development, migrate, and seed commands
  MUST all run successfully with zero errors.
- **FR-013**: Strict type checking MUST stay enabled. The upgrade MUST NOT add unjustified
  type-check suppressions.
- **FR-014**: Project documentation (README and CLAUDE.md) MUST be updated with the new
  versions, the minimum runtime version, the supported browsers, both deployment targets, and
  any changed commands or setup steps.
- **FR-015**: Deprecated framework conventions flagged by the official upgrade guides MUST be
  migrated to their current equivalents, using official codemods where they exist.

### Key Entities

No new business entities. Existing entities (User, Session, Appointment, Payment) must come
through the upgrade with the same meaning, fields, and data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the staff workflows listed in FR-005 complete successfully for each role
  (administrator, priest, cashier) in post-upgrade acceptance testing.
- **SC-002**: Record counts for users, appointments, and payments, and daily per-method payment
  totals, match the pre-upgrade snapshot exactly (zero discrepancies).
- **SC-003**: A new maintainer can go from a clean checkout to a running, seeded local system
  in under 15 minutes, following only the project documentation.
- **SC-004**: Dependency install, lint, type-check, and production build each finish with zero
  errors and zero version-conflict errors.
- **SC-005**: Every create and edit dialog on every dashboard can be completed with the
  keyboard alone, and automated accessibility audits report zero critical or serious
  violations on every page.
- **SC-008**: 100% of the staff-facing screens use the shared component foundation for their
  dialogs, tables, tabs, badges, buttons, and form fields, with zero hand-built duplicates
  left.
- **SC-009**: The automated regression suite passes 100% on the pre-upgrade stack, after the
  platform upgrade, and after the UI migration, with no tests skipped or disabled to get there.
- **SC-010**: The upgraded release deploys successfully to both the Docker container and
  Vercel, and the regression suite's sign-in and payment checks pass against each deployed
  target.
- **SC-006**: Dashboard pages load no slower than before the upgrade, measured on the same
  machine and data set (within 10%).
- **SC-007**: No staff member needs retraining. Parish staff confirm in acceptance testing
  that their screens and steps are unchanged.

## Assumptions

- Next.js, React, and TypeScript are pinned per the 2026-11-19 clarification. For everything
  else, "latest versions" means the latest **stable** (non-RC, non-beta, non-canary) release.
  At the time of clarification that was Tailwind CSS 4.3.5, pg 8.23.1, shadcn CLI 4.23.0, and
  Prisma 7.10.1. The registry's `latest` tag for Prisma points to a release candidate
  (8.0.0-rc.34), which does not qualify.
- Moving to TypeScript 7 is out of scope and will be tracked as a follow-up feature. It
  becomes possible once typescript-eslint (and Next.js's build type-check) officially support
  TypeScript 7.
- "pg" refers to the PostgreSQL Node.js driver. Because the current officially supported
  database layer requires a driver adapter, the database access layer is upgraded to that
  current release and connects through the PostgreSQL driver. The database engine (PostgreSQL
  server) itself is out of scope.
- shadcn is new to the project, not an upgrade of an existing install. Adopting it means a
  full migration of the staff-facing UI onto it (clarified 2026-11-19), but not a redesign:
  layouts, screen flow, wording, and branding stay the same, and the visible changes are the
  consistency the shared components bring.
- Parish staff use current evergreen browsers (Chrome, Edge, Safari, or Firefox released in
  the last two years). Older browsers are out of scope.
- The runtime used for development and production meets the minimum version required by the
  upgraded platforms.
- No new features, business rules, or data model changes are included. Known constitution gaps
  (Float money fields, the audit log) are tracked as separate features and are out of scope,
  but this upgrade must not make them worse. The test-suite gap is partly closed here by the
  end-to-end regression suite (FR-017). Unit tests for `lib/` service functions remain a
  separate feature.
- Existing third-party features (PDF report export) stay in use and are upgraded only as far
  as compatibility requires.
- The Docker image definition is not in this repository. Its base runtime must meet the
  upgraded platforms' minimum Node.js version, and planning must confirm where the image is
  built. Planning must also confirm whether the container uses the pm2 process manager. If
  neither target uses it, it is removed as an unused dependency.
- The upgrade is done on a feature branch and merged by pull request, as the constitution
  requires.
