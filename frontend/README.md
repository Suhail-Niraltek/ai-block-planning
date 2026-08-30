# AI-Powered Automatic Block Planning — SIH26027

Decision-support prototype for **SIH26027 — AI-Powered Automatic Block Planning to Maximize
Asset Availability for Train Operations on Indian Railways** (Ministry of Railways,
Transportation & Logistics).

> **Synthetic demonstration data — not Indian Railways production data.**
> This system is decision support only. It does not grant a traffic block, operate signalling
> equipment, switch traction power, or replace authorised railway officials.

---

## 1. What the problem asks, and where it is implemented

The official problem statement asks for four things. Each maps to specific code:

| Official expected solution | Where it lives |
|---|---|
| 1. Integrate defects and overdue maintenance from **TMS, SMMS, TDMS** with corridor block availability per the **Train Time Table** and the **goods-train forecast** from the Control Office | `backend/src/modules/sources/adapters/` — six adapters, one per input |
| 2. Use **AI/ML** to prioritise and schedule by criticality, urgency and asset-availability impact | `planning/risk-model.js` (logistic regression), `planning/priority-engine.js` (explainable fallback), `planning/duration-engine.js` (P90) |
| 3. **Optimize** block scheduling to maximise uptime and coordinate multi-department activity | `planning/glpk-solver.js` (MILP), `planning/fallback-solver.js` (greedy), `planning/candidate-window-engine.js` |
| 4. Produce **weekly and monthly** block plans | `planning/planning.service.js`, both horizons share every engine |

The acronyms are used exactly as the problem statement defines them: **TMS** Track Management
System, **SMMS** Signalling Maintenance & Management System, **TDMS** Traction Distribution
Management System, **COA** Control Office Application. **BDMS** — the system departments use to
request blocks today — is deliberately *not* integrated: it is the current manual process rather
than one of the four deliverables, and no API contract is published for it.

## 2. Run it locally

Requires **Node.js 24** and a running **MySQL 8.0+** server. No Docker, no cloud setup.

```bash
# Backend — Express + MySQL, port 3000
cd backend
npm install
cp .env.example .env       # edit MYSQL_USER / MYSQL_PASSWORD if yours differ
npm run migrate            # creates the database and all tables
npm run seed               # corridors, sections, source systems, synthetic history
npm run dev
```

```bash
# Frontend — Angular 22, port 4200, proxied to the backend
cd frontend
npm install
npm start
```

| URL | What it is |
|---|---|
| `http://localhost:4200` | The application |
| `http://localhost:3000/api/v1/health` | API and database health |

`npm start` uses `proxy.conf.json`, so the browser calls `/api/v1/...` on port 4200 and Angular
forwards to Express. There is no CORS problem to work around in development.

### Walk-through

The sidebar is numbered in the order you should use it, and ticks each step as you finish it.

1. **Data sources** → *Load all sources*. Each adapter validates its records, maps external section
   and asset codes onto canonical ones, and upserts — so loading twice changes nothing.
2. **Maintenance backlog** → *Rescore backlog*. This retrains the logistic regression on the seeded
   history and rescores every job. Click any task to see exactly why it scored what it did, and how
   much time the planner will actually reserve for it versus what was requested.
3. **Block planner** → choose This week or This month, pick a start date, *Generate plan*. The
   panel beside the form lists the five stages the backend runs, and marks progress through them.
4. **Block plan** → solver status in plain language, the numbers, blocks grouped by section, and
   every job that could not be placed with the reason and what a planner would do about it.
5. **Coordinated vs department-by-department** → the same jobs planned both ways, metric by metric.

## 3. Architecture

```
frontend/  Angular 22, standalone, Signals, Signal Forms, Tailwind 4, CSR only
   └── proxy /api → backend

backend/   Node 24, Express 5, MySQL 8 via mysql2/promise, handwritten SQL, no ORM
   ├── modules/sources      six adapters + sync runs
   ├── modules/network      corridors and sections
   ├── modules/maintenance  unified task backlog, scoring
   ├── modules/operations   train movements, forecasts, block windows
   └── modules/planning     engines, solvers, validator, metrics
```

Layering is strict: routes wire endpoints, controllers touch only HTTP, Zod schemas validate,
services own the business flow and transactions, repositories own SQL, and the engines and solvers
are pure functions with no Express or database imports. That is what makes the algorithms unit
testable without a database.

The interface is organised as a four-step workflow — load sources, review the backlog, generate a
plan, compare against manual planning — and the sidebar marks each step done as you complete it.
On tablet and mobile the sidebar becomes a slide-over drawer opened from the topbar.

Icons are [Lucide](https://lucide.dev) (ISC licensed). The path data for the 38 icons actually used
is inlined in `components/shared/icon/lucide-paths.ts` and rendered by a small `<app-icon>`
component, so there is no icon font, no runtime dependency, and nothing unused in the bundle. Every
icon sits beside its own text label and is hidden from screen readers unless it carries meaning on
its own.

State on the frontend is Angular Signals throughout — `signal()` for writable state, `asReadonly()`
on everything public, `computed()` for derived values, `linkedSignal()` where a selection must
reset when its source changes, and `effect()` only for the genuine DOM side effect of applying the
theme. No RxJS is used as application state.

## 4. How the algorithms work

### 4.1 Priority — two levels, always labelled

**Level 2 (ML).** A logistic regression written in plain JavaScript, trained on
`maintenance_history`. It predicts whether an item *failed, escalated, or forced an operational
restriction before the work was done* — so a high score means deferring is risky, which is exactly
what a block plan should prioritise against. Deterministic preprocessing, one-hot categoricals,
normalisation fitted on the training split only, batch gradient descent with L2, and a
**time-based** train/validation split so future outcomes never leak into training. Coefficients are
written to `planning/risk-model.json`.

**Level 1 (rule fallback).** A weighted sum of severity, asset criticality, overdue days,
safety-critical flag, speed restriction, corridor importance and repeat defects, normalised to
0–100. Every weight is in one exported `PRIORITY_WEIGHTS` object, so a judge can ask for one to be
changed and see the effect immediately. Every contributing factor is stored in
`priority_reasons_json` and rendered in the task detail panel.

The fallback is used whenever history is below `MIN_HISTORY_ROWS`, the model file is missing, or
scoring throws. The UI always shows which path produced each score.

### 4.2 Duration — P90, not the median

Block feasibility is decided on the **P90**, because a block sized to the typical job overruns one
time in two, and an overrun on a live railway means a late hand-back.

1. P90 of actual durations for the same task type and department, when there are enough samples.
2. Otherwise the task's own requested duration scaled by that **department's P90 overrun ratio** —
   a dimensionless figure that transfers across job sizes. (Using another task type's raw minutes
   would reserve 150 minutes for a 30-minute lamp change.)
3. Otherwise the requested duration plus an explicit safety buffer.

The task detail shows requested, predicted, and the sample count behind it.

### 4.3 Candidate windows

COA publishes availability; the timetable says what actually runs. Intervals are half-open
`[start, end)`, so a window ending at 22:00 and a train entering at 22:00 do not conflict.

Protected passenger paths are subtracted from every window, each padded by a configurable safety
buffer on both sides for clearing and re-occupying the track. What survives is the usable time. A
task/window pair is then rejected — with a specific reason code — when the section differs, the
usable time is below the predicted duration, power isolation is missing for traction work, or the
signalling disconnection is missing for S&T work.

Freight is treated differently from passenger traffic: it does not block a window outright, but a
high or uncertain goods forecast raises the window's operational impact, which the optimizer
minimises.

### 4.4 Optimization

A mixed-integer program solved by GLPK (`glpk.js/node`, the synchronous WASM build):

- `x[t,s]` — task *t* runs in candidate segment *s*
- `y[s]` — segment *s* is used as a block at all
- `d[s,p]` — department *p* is present in the block on *s*

**Capacity is per department, not per block.** Different departments work concurrently during one
block — that is the entire point of an integrated block — while the same department must queue. So
a block is as long as its slowest department, not the sum of all its work.

Objective, in the priority order the problem implies: maximise scheduled risk (with a large bonus
for safety-critical work), minimise block minutes, minimise train impact, maximise multi-department
bundling, maximise task count. Downtime and traffic impact are charged **once per block**, however
many tasks share it.

If GLPK fails or returns nothing, a deterministic greedy planner takes over, ordered by
safety-critical, then priority, then due date, then id — never relaxing any constraint the MILP
enforced, only searching less thoroughly.

Solver status is reported exactly as returned: `OPTIMAL`, `FEASIBLE`, `FALLBACK_FEASIBLE`,
`INFEASIBLE`, `FAILED`. Nothing is called optimal unless GLPK proved it.

### 4.5 Independent validation

After either solver, `plan-validator.js` re-derives every rule from the raw inputs rather than
trusting anything the solver reported. A plan is rejected and never stored if it contains a train
conflict (buffer included), a task outside its block, a block outside its window or the horizon, a
duplicate assignment, a missing power or disconnection requirement, a section mismatch, or two
tasks of one department overlapping.

### 4.6 Baseline comparison

The baseline reproduces today's decentralized process: each department plans alone, in due-date
then severity order, taking the first window that works for it, sharing a block with nobody. It
runs on **identical** tasks, windows, durations and safety rules, and shares one capacity ledger so
a window claimed by Engineering is genuinely unavailable to Traction Distribution.

Asset availability is computed, not asserted:

```
availability % = ((horizon minutes × section count) − unavailable section minutes)
                 / (horizon minutes × section count) × 100
```

Every metric carries its own `higherIsBetter` flag, so the UI never has to guess, and critical
coverage is reported on its own row. A plan that takes less track time is not better if it leaves
more critical work undone.

**Reading the comparison honestly.** On a long horizon the optimizer sometimes schedules *fewer*
total tasks than the greedy baseline while using far fewer block minutes and covering more critical
work. That is the optimizer declining low-priority jobs whose block cost exceeds the risk they
retire — the correct trade-off for a brief that asks to maximise availability, not to maximise
activity. The comparison table shows it as a regression on that one row rather than hiding it.

## 5. Demonstration dataset

`npm run seed` builds the fixed network and the learning history; loading the sources then
generates everything else. The whole set is deterministic from `DEMO_SEED`, so the same seed always
produces the same plan.

| | |
|---|---|
| Corridors | 4 (trunk, feeder, freight, suburban) |
| Sections | 18, including one single-line and one non-electrified |
| Assets | ~190 across track, signalling and traction |
| Open maintenance tasks | ~187 (ENG ~68, TRD ~59, S&T ~60) |
| Published block windows | ~315 over 35 days |
| Train movements | ~1,000, of which ~830 are protected passenger paths |
| Goods-forecast buckets | ~980 |
| Historical outcomes for learning | 2,200 |

## 6. Tests

```bash
cd backend  && npm test    # 104 tests, Node's built-in runner
cd frontend && npm test    # 126 tests, Vitest + jsdom via @angular/build:unit-test
```

Backend coverage: interval arithmetic (no/full/partial/multiple overlap, touching intervals),
candidate rejection reason codes, rule-priority behaviour and saturation, logistic regression on a
known separable dataset plus determinism, duration P90 and both fallbacks, GLPK on a small feasible
case, the greedy fallback, the baseline planner, the independent validator against each violation
class, metric and availability arithmetic, adapter validity/determinism/uniqueness, and the
planning API schemas.

Frontend coverage: the four signal stores (loading, success and error paths, and every computed
filter and count), the planner's Signal Forms validation and request shaping, plan-metric and
unscheduled-reason rendering, the optimized-versus-baseline deltas including the "no change" case,
the sidebar drawer and its step-completion ticks, the topbar's three connection states, and the
icon component's accessibility behaviour.

No Playwright, no browser E2E — the brief excludes them.

## 7. Limitations and honest caveats

- **The data is synthetic.** The official SIH26027 record publishes an empty `dataset link` field,
  so there is no supplied production dataset or API schema. Every adapter ships deterministic mock
  fixtures behind a swappable `MOCK` / `JSON` / `REST` interface; only the adapter changes when a
  real feed arrives.
- **The model's accuracy figures describe synthetic data**, not observed Indian Railways
  performance. They are shown so the ML path is visibly real, not to claim production accuracy.
- **BDMS write-back is out of scope** for this MVP, as explained in section 1.
- **No auth, RBAC, approvals, audit, or notifications.** The brief explicitly excludes them.
- **`glpk.js` is GPL-3.0.** Fine for an open hackathon prototype; review before any closed-source
  production use.
- The demo fixtures anchor to midnight UTC of the day a sync runs, so the plan always has a usable
  week ahead while staying reproducible within a day.

## 8. Sources

- SIH 2026 problem statements: <https://www.sih.gov.in/sih2026PS>
- CRIS Track Management System: <https://cris.org.in/loadpage?page=proTMS>
- CRIS Traction Distribution Management System: <https://cris.org.in/loadpage?page=proTDMS>
- CRIS Control Office Application: <https://cris.org.in/loadpage?page=proCOA>
- Indian Railways power-block rules (SR chapter 17):
  <https://indianrailways.gov.in/railwayboard/uploads/directorate/safety/SR_SR/SR_SR_CHAP17.PDF>
- Angular Signals: <https://angular.dev/guide/signals>
- Express 5: <https://expressjs.com/en/5x/api.html>
- MySQL 8.0 reference: <https://dev.mysql.com/doc/refman/8.0/en/>
- GLPK.js: <https://github.com/jvail/glpk.js/>
- Lucide icons (ISC): <https://lucide.dev>
