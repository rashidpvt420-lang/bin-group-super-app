# WPS / MOHRE Payroll Integration — Scope & Requirements

> Status: **SCOPING ONLY — not yet built.** This document captures what a UAE
> Wage Protection System (WPS) integration requires so it can be implemented
> deliberately. No SIF-file generation or bank routing exists in the codebase
> today; payroll output is currently limited to payslip PDFs.

## 0. Open business decision (resolve before any build)

**Does technician/staff payroll actually run through this app, or through an
external payroll provider / the company's bank portal?**

- If payroll is handled outside this app, WPS is **not** a launch dependency for
  the app — it stays a future enhancement, and this doc is the standing record.
- If the app is intended to be the system of record that pays staff, WPS
  compliance is a **legal obligation independent of the app's launch date**
  (UAE mainland employers must pay wages through WPS), and the phased plan below
  becomes a real backlog item with a compliance deadline.

Either way, WPS is **not a hard-launch blocker for the app itself** — it is a
business/payroll-operations obligation. Do not gate the public launch on it; do
gate any claim that the app "runs payroll" on it.

## 1. What WPS is

The Wage Protection System is a MOHRE + UAE Central Bank electronic salary
transfer system. Employers submit a **Salary Information File (SIF)** to an
authorised agent (a bank or licensed exchange house). The agent validates and
disburses wages, and reports back to MOHRE. Non-compliance (late/short payment,
no SIF) triggers fines and new-permit suspension at the establishment level.

## 2. The SIF file (the core deliverable)

A SIF is a fixed-format file (historically `.SIF`, fixed-width/CSV-style) with
two record types:

- **EDR — Employee Detail Record** (one per employee per cycle):
  - MOL/MOHRE Personal ID (the employee's labour-card / person code)
  - Employee bank/agent routing ID (IBAN or agent code)
  - Pay start date, pay end date, **number of days** in the period
  - **Fixed** component, **variable** component, **total salary** (fils-accurate)
  - Leave/absence days where applicable
- **SCR — Salary Control Record** (one per file, the batch header/trailer):
  - Employer MOL establishment ID
  - Employer bank/agent routing ID
  - File creation date/time and a unique file reference
  - Total record count and **total amount** (must reconcile to the sum of EDRs)

Exact column widths, ordering, and the agent's accepted encoding **must be
taken from the chosen agent bank/exchange house's current WPS spec** — these
differ slightly by agent and change over time. Do not hardcode a format from
memory; obtain the agent's published SIF template.

## 3. Data the app already has vs. what's missing

Already present (see `src/lib/uaeWorkforceComplianceEngine.ts`,
`src/lib/uaeHrComplianceConfig.ts`, and the HR pages):
- Employee identity, role, and salary figures (basic + allowances)
- EOSB/gratuity math (Federal Decree-Law No. 33/2021) — correct, but separate
  from monthly payroll
- The `BIN_GROUP_PRIMARY_ENTITY` profile, which already flags
  `tradeLicenseNumber` and `mohreEstablishmentId` as **not yet on file**

Missing and required before a SIF can be generated:
- **Employer MOL establishment ID** (`mohreEstablishmentId`) and the employer's
  WPS agent routing ID — currently placeholders.
- **Per-employee MOL Personal ID** (labour-card person code) — distinct from
  Emirates ID; not currently captured on the employee record.
- **Per-employee IBAN / agent routing** validated against the agent's accepted
  banks/exchange houses — partially captured for brokers, not for staff payroll.
- A **payroll run** concept: a cycle (month), the set of included employees,
  fixed/variable split per employee, days worked, and an immutable, auditable
  total that reconciles to the SCR.

## 4. Proposed phased build (when greenlit)

1. **Data model + capture.** Add MOL Personal ID and validated payroll IBAN to
   the employee record; populate the entity's MOL establishment ID and agent
   routing. Add a `payrollRuns/{runId}` collection (cycle, status, totals) and
   `payrollRuns/{runId}/items/{employeeId}` (fixed, variable, days, total).
2. **SIF generation (server-side Cloud Function).** Build the EDR/SCR file from
   a locked payroll run, strictly to the chosen agent's published template, with
   a reconciliation check (sum of EDR totals == SCR total) that hard-fails on
   mismatch. Generate as a downloadable artifact for manual upload first.
3. **Agent/bank submission.** Only after (2) is proven by a successful manual
   upload cycle: integrate the agent's submission channel (host-to-host/API or
   portal automation) if the agent offers one. Many employers stay on manual
   upload — do not assume an API exists.
4. **MOHRE reconciliation + status.** Ingest the agent's acceptance/rejection
   and surface per-employee WPS status; alert on rejected or unpaid records.

## 5. Hard rules for whoever builds this

- Treat monetary values in **fils** (integer) end-to-end; never float-round a
  salary.
- The SIF total **must** reconcile to the sum of employee records, enforced in
  code, before a file is ever emitted.
- Source the SIF format from the **agent's current spec**, not from this doc or
  from memory.
- Keep every generated SIF and its submission result immutable and auditable.
- Confirm `legalNameEn`, `workLocationEmirate`, `tradeLicenseNumber`, and
  `mohreEstablishmentId` (the fields the workforce-compliance engine already
  flags as unconfirmed) before any real filing.
