/**
 * Builds the RailPlan AI deck for SIH26027.
 *
 * Every figure quoted here is read from the running system: the screenshots in
 * ./assets were captured from the app, and the model metrics come straight out
 * of backend/src/modules/planning/risk-model.json. Nothing is invented, and the
 * comparison slide reports the measures that got worse as well as better.
 *
 *   npm run build   ->  ./RailPlan-AI-SIH26027.pptx
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) => resolve(here, 'assets', name);

const riskModel = JSON.parse(
  readFileSync(resolve(here, '..', 'backend/src/modules/planning/risk-model.json'), 'utf8'),
);
const ml = riskModel.metrics;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

/* ------------------------------------------------------------------ theme */

const C = {
  bg: '0B1524',
  panel: '132133',
  panelEdge: '223449',
  ink: 'F1F6FC',
  muted: '9DB2C8',
  faint: '6B819A',
  blue: '3B9BE8',
  teal: '2DD4BF',
  amber: 'F0A93B',
  red: 'F0616D',
  violet: 'A78BFA',
  green: '34D399',
};

const FONT = 'Segoe UI';
// 13.333 x 7.5 in. NOTE: pptxgenjs 'LAYOUT_16x9' is 10 x 5.625 in — the
// widescreen preset is 'LAYOUT_WIDE'. Every coordinate below assumes this grid.
const W = 13.333;
const H = 7.5;

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Team RailPlan AI';
pptx.company = 'Smart India Hackathon 2026';
pptx.title = 'RailPlan AI - Automatic Block Planning (SIH26027)';

pptx.defineSlideMaster({
  title: 'MAIN',
  background: { color: C.bg },
  objects: [
    { rect: { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.blue } } },
    {
      text: {
        text: 'SIH26027 · Ministry of Railways · Synthetic demonstration data',
        options: {
          x: 0.55, y: H - 0.5, w: 8, h: 0.3,
          fontSize: 9, color: C.faint, fontFace: FONT,
        },
      },
    },
  ],
  slideNumber: {
    x: W - 0.9, y: H - 0.5, w: 0.5, h: 0.3,
    fontSize: 9, color: C.faint, fontFace: FONT, align: 'right',
  },
});

/* ---------------------------------------------------------------- helpers */

const deck = [];

function slide() {
  const s = pptx.addSlide({ masterName: 'MAIN' });
  deck.push(s);
  return s;
}

function plainSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: C.blue } });
  deck.push(s);
  return s;
}

/** Section heading with an eyebrow label; returns the y to continue from. */
function heading(s, { eyebrow, title, sub }) {
  let y = 0.42;
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: 0.55, y, w: 10, h: 0.26,
      fontSize: 11, bold: true, color: C.blue, charSpacing: 1.6, fontFace: FONT,
    });
    y += 0.3;
  }
  s.addText(title, {
    x: 0.55, y, w: 12.2, h: 0.62,
    fontSize: 30, bold: true, color: C.ink, fontFace: FONT,
  });
  y += 0.68;
  if (sub) {
    s.addText(sub, {
      x: 0.55, y, w: 12.2, h: 0.4,
      fontSize: 13, color: C.muted, fontFace: FONT,
    });
    y += 0.46;
  }
  return y + 0.12;
}

/** Rounded panel used everywhere as the card background. */
function panel(s, x, y, w, h, fill = C.panel) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: C.panelEdge, width: 1 },
    rectRadius: 0.08,
  });
}

/** Big-number stat tile. */
function stat(s, { x, y, w = 2.9, h = 1.35, label, value, note, color = C.ink }) {
  panel(s, x, y, w, h);
  s.addText(label.toUpperCase(), {
    x: x + 0.18, y: y + 0.14, w: w - 0.36, h: 0.24,
    fontSize: 9, bold: true, color: C.faint, charSpacing: 1, fontFace: FONT,
  });
  s.addText(String(value), {
    x: x + 0.18, y: y + 0.38, w: w - 0.36, h: 0.5,
    fontSize: 24, bold: true, color, fontFace: FONT,
  });
  if (note) {
    s.addText(note, {
      x: x + 0.18, y: y + 0.9, w: w - 0.36, h: 0.38,
      fontSize: 9.5, color: C.muted, fontFace: FONT, valign: 'top',
    });
  }
}

/** Bulleted body copy inside a panel. */
function bullets(s, { x, y, w, h, title, items, accent = C.blue }) {
  panel(s, x, y, w, h);
  let cursor = y + 0.2;
  if (title) {
    s.addShape(pptx.ShapeType.rect, { x, y: y + 0.22, w: 0.05, h: 0.28, fill: { color: accent } });
    s.addText(title, {
      x: x + 0.24, y: cursor, w: w - 0.44, h: 0.3,
      fontSize: 13.5, bold: true, color: C.ink, fontFace: FONT,
    });
    cursor += 0.44;
  }
  s.addText(
    items.map((t) => ({
      text: typeof t === 'string' ? t : t.text,
      options: { bullet: { code: '2022' }, breakLine: true },
    })),
    {
      x: x + 0.28, y: cursor, w: w - 0.5, h: h - (cursor - y) - 0.16,
      fontSize: 11, color: C.muted, fontFace: FONT, lineSpacing: 18, valign: 'top',
    },
  );
}

/** Screenshot with a caption strip underneath; returns the y below it. */
function screenshot(s, { file, x, y, w, caption }) {
  const h = w / 1.44; // captures are 1440x1000
  s.addImage({ path: asset(file), x, y, w, h });
  s.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { type: 'none' },
    line: { color: C.panelEdge, width: 1 },
  });
  if (caption) {
    s.addText(caption, {
      x, y: y + h + 0.06, w, h: 0.28,
      fontSize: 9.5, color: C.faint, italic: true, fontFace: FONT, align: 'center',
    });
  }
  return y + h + 0.38;
}

function pill(s, { x, y, w, h = 0.36, text, color }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.17,
    fill: { color: C.panel }, line: { color, width: 1 },
  });
  s.addText(text, {
    x, y, w, h,
    fontSize: 10.5, bold: true, color, align: 'center', valign: 'middle', fontFace: FONT,
  });
}

/* ------------------------------------------------------------- 1 · title */
{
  const s = plainSlide();

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.9, y: 1.05, w: 2.25, h: 0.42, rectRadius: 0.2,
    fill: { color: '10243B' }, line: { color: C.blue, width: 1 },
  });
  s.addText('PROBLEM SIH26027', {
    x: 0.9, y: 1.05, w: 2.25, h: 0.42,
    fontSize: 10.5, bold: true, color: C.blue, align: 'center', valign: 'middle', fontFace: FONT,
  });

  s.addText('RailPlan AI', {
    x: 0.85, y: 1.72, w: 11.6, h: 1.05,
    fontSize: 56, bold: true, color: C.ink, fontFace: FONT,
  });
  s.addText('AI-powered automatic block planning to maximise asset availability', {
    x: 0.9, y: 2.82, w: 11.5, h: 0.5,
    fontSize: 20, color: C.blue, fontFace: FONT,
  });
  s.addText(
    'One optimiser plans Engineering, Traction Distribution and Signal & Telecom maintenance together — '
    + 'against real corridor windows, protected train paths and the goods forecast.',
    { x: 0.9, y: 3.36, w: 10.8, h: 0.7, fontSize: 13.5, color: C.muted, fontFace: FONT },
  );

  const tiles = [
    { label: 'Source systems integrated', value: '6', note: 'TMS · SMMS · TDMS · COA · Timetable · Goods' },
    { label: 'Planning horizons', value: 'Weekly + Monthly', note: '15-minute planning granularity' },
    { label: 'Optimiser', value: 'GLPK MILP', note: 'greedy fallback, independent re-check' },
    { label: 'Priority scoring', value: 'ML + rules', note: 'every score is explainable' },
  ];
  tiles.forEach((t, i) => stat(s, { ...t, x: 0.9 + i * 3.0, y: 4.35, w: 2.75, h: 1.42, color: C.teal }));

  s.addText('Smart India Hackathon 2026 · Ministry of Railways · Transportation & Logistics', {
    x: 0.9, y: 6.15, w: 11.5, h: 0.3, fontSize: 11, color: C.faint, fontFace: FONT,
  });
  s.addText(
    'Decision support only — final blocks still require authorised approval. '
    + 'Synthetic demonstration data, not Indian Railways production data.',
    { x: 0.9, y: 6.5, w: 11.5, h: 0.3, fontSize: 9.5, color: C.faint, italic: true, fontFace: FONT },
  );
}

/* ----------------------------------------------------------- 2 · problem */
{
  const s = slide();
  heading(s, {
    eyebrow: 'The problem',
    title: 'Three departments plan the same track, separately',
    sub: 'Engineering, Traction Distribution and S&T each request blocks through BDMS on their own, from data that never meets.',
  });

  const cols = [
    {
      t: 'Data lives in silos',
      c: C.red,
      items: [
        'Track defects sit in TMS, signalling defects in SMMS, OHE work in TDMS.',
        'Corridor availability sits separately again, in COA.',
        'No single view of what the whole network actually needs.',
      ],
    },
    {
      t: 'Planning is manual',
      c: C.amber,
      items: [
        'Each department books in its own due-date order.',
        'A window taken by one is simply gone for the rest.',
        'Compatible work that could share one possession does not.',
      ],
    },
    {
      t: 'Assets pay the price',
      c: C.violet,
      items: [
        'The line closes more times than the work itself requires.',
        'Overdue safety-critical work waits behind routine work.',
        'Train operations absorb avoidable downtime.',
      ],
    },
  ];
  cols.forEach((c, i) => bullets(s, {
    x: 0.55 + i * 4.15, y: 2.1, w: 3.85, h: 2.55, title: c.t, items: c.items, accent: c.c,
  }));

  panel(s, 0.55, 4.9, 12.25, 1.6, '10243B');
  s.addText('WHAT THE PROBLEM STATEMENT ASKS FOR', {
    x: 0.85, y: 5.05, w: 11.6, h: 0.26,
    fontSize: 10, bold: true, color: C.blue, charSpacing: 1.2, fontFace: FONT,
  });
  s.addText(
    '"Develop an Automatic Block Planning system that integrates maintenance, defects and corridor data to generate '
    + 'optimized block schedules. The system should prioritize maintenance activities to minimize asset downtime and '
    + 'maximize the availability of critical infrastructure, ensuring uninterrupted train operations."',
    { x: 0.85, y: 5.35, w: 11.65, h: 1.0, fontSize: 12.5, color: C.ink, italic: true, fontFace: FONT },
  );
}

/* ---------------------------------------------------------- 3 · solution */
{
  const s = slide();
  heading(s, {
    eyebrow: 'The solution',
    title: 'One pipeline, from six feeds to a safe block plan',
    sub: 'The same inputs also build a department-by-department baseline, so the improvement is measured, never claimed.',
  });

  const steps = [
    { n: '1', t: 'Integrate', d: 'Six adapters normalise TMS, SMMS and TDMS work with COA windows, protected train paths and the goods forecast.', c: C.blue },
    { n: '2', t: 'Prioritise', d: 'A logistic-regression risk model scores every task 0–100, with a transparent weighted rule engine as the declared fallback.', c: C.violet },
    { n: '3', t: 'Find safe time', d: 'Protected passenger movements plus a configurable buffer are cut out of every window; each rejection carries a reason code.', c: C.teal },
    { n: '4', t: 'Optimise', d: 'A GLPK MILP picks which jobs go where and bundles compatible ENG/TRD/S&T work into a single possession.', c: C.amber },
    { n: '5', t: 'Re-check', d: 'An independent validator re-derives every rule and throws away an unsafe plan; the manual baseline runs on identical inputs.', c: C.green },
  ];

  const boxW = 2.3;
  steps.forEach((st, i) => {
    const x = 0.55 + i * 2.48;
    panel(s, x, 2.15, boxW, 2.6);
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.18, y: 2.35, w: 0.42, h: 0.42, fill: { color: st.c } });
    s.addText(st.n, {
      x: x + 0.18, y: 2.35, w: 0.42, h: 0.42,
      fontSize: 13, bold: true, color: '0B1524', align: 'center', valign: 'middle', fontFace: FONT,
    });
    s.addText(st.t, {
      x: x + 0.18, y: 2.88, w: boxW - 0.36, h: 0.34,
      fontSize: 14.5, bold: true, color: C.ink, fontFace: FONT,
    });
    s.addText(st.d, {
      x: x + 0.18, y: 3.26, w: boxW - 0.36, h: 1.35,
      fontSize: 10, color: C.muted, fontFace: FONT, valign: 'top', lineSpacing: 14,
    });
    if (i < steps.length - 1) {
      s.addText('▶', {
        x: x + boxW + 0.02, y: 3.3, w: 0.42, h: 0.28,
        fontSize: 11, color: C.faint, align: 'center', fontFace: FONT,
      });
    }
  });

  bullets(s, {
    x: 0.55, y: 4.95, w: 6.05, h: 1.55, title: 'Hard constraints, never relaxed', accent: C.red,
    items: [
      'A block may never overlap a protected train path plus its safety buffer.',
      'Traction work without power isolation, S&T work without a disconnection: rejected.',
      'A task that does not fit the window stays unscheduled, with its reason shown.',
    ],
  });
  bullets(s, {
    x: 6.77, y: 4.95, w: 6.05, h: 1.55, title: 'Answers a judge can check live', accent: C.teal,
    items: [
      'Weights, train buffer and slot size each live in one config object — change one, re-run.',
      'Every adapter is swappable (MOCK / JSON / REST) if a real feed is unavailable.',
      'Solver status is reported as returned: OPTIMAL, FEASIBLE, FALLBACK_FEASIBLE, INFEASIBLE, FAILED.',
    ],
  });
}

/* ------------------------------------------------------- 4 · data sources */
{
  const s = slide();
  const y = heading(s, {
    eyebrow: 'Step 1 · integration',
    title: 'All six required inputs, loaded and counted',
    sub: 'Each adapter validates, maps external section and asset codes onto canonical records, and upserts without duplication.',
  });

  screenshot(s, {
    file: 'sources.png', x: 0.55, y, w: 7.4,
    caption: 'Data sources — 6/6 sources current, 2,489 records, 0 requiring attention',
  });

  const feeds = [
    ['TMS', 'Track Management System', '68', C.blue],
    ['SMMS', 'Signalling Maintenance & Mgmt', '60', C.violet],
    ['TDMS', 'Traction Distribution Mgmt', '59', C.amber],
    ['COA', 'Control Office Application', '315', C.teal],
    ['TIMETABLE', 'Train Time Table', '1,007', C.green],
    ['GOODS_FORECAST', 'Goods-train forecast', '980', C.red],
  ];
  panel(s, 8.25, y, 4.57, 3.5);
  s.addText('RECORDS LOADED', {
    x: 8.5, y: y + 0.16, w: 4.05, h: 0.26,
    fontSize: 10, bold: true, color: C.faint, charSpacing: 1.2, fontFace: FONT,
  });
  feeds.forEach(([code, name, count, col], i) => {
    const ry = y + 0.56 + i * 0.47;
    s.addShape(pptx.ShapeType.rect, { x: 8.5, y: ry + 0.04, w: 0.05, h: 0.32, fill: { color: col } });
    s.addText(code, { x: 8.68, y: ry, w: 2.6, h: 0.22, fontSize: 11, bold: true, color: C.ink, fontFace: FONT });
    s.addText(name, { x: 8.68, y: ry + 0.19, w: 2.9, h: 0.2, fontSize: 8.5, color: C.faint, fontFace: FONT });
    s.addText(count, {
      x: 11.55, y: ry + 0.02, w: 1.0, h: 0.3,
      fontSize: 13, bold: true, color: col, align: 'right', fontFace: FONT,
    });
  });

  bullets(s, {
    x: 8.25, y: y + 3.65, w: 4.57, h: 1.75, title: 'What each adapter guarantees', accent: C.blue,
    items: [
      'Zod-validated input; accepted and rejected counts recorded per sync run.',
      'Idempotent upsert — re-loading a feed changes nothing.',
      'Fixtures are deterministic and labelled synthetic on every screen.',
    ],
  });
}

/* ------------------------------------------------------------ 5 · scoring */
{
  const s = slide();
  const y = heading(s, {
    eyebrow: 'Step 2 · AI prioritisation',
    title: 'A risk score you can argue with',
    sub: 'Every task carries a 0–100 estimate of failure, escalation or an operating restriction if the work is deferred — plus the factors behind it.',
  });

  screenshot(s, {
    file: 'maintenance.png', x: 0.55, y, w: 7.4,
    caption: 'Maintenance backlog — 187 tasks, 29 critical, 38 overdue, all 187 scored',
  });

  panel(s, 8.25, y, 4.57, 2.4);
  s.addText('LEARNED MODEL (LEVEL 2)', {
    x: 8.5, y: y + 0.16, w: 4.05, h: 0.26,
    fontSize: 10, bold: true, color: C.violet, charSpacing: 1.2, fontFace: FONT,
  });
  s.addText('Logistic regression in plain JavaScript, trained on maintenance history with a time-based split.', {
    x: 8.5, y: y + 0.44, w: 4.05, h: 0.5, fontSize: 10.5, color: C.muted, fontFace: FONT,
  });
  const mlRows = [
    ['Validation accuracy', pct(ml.validationAccuracy)],
    ['ROC AUC', ml.validationRocAuc.toFixed(4)],
    ['Log loss', ml.validationLogLoss.toFixed(4)],
    ['Train / validation rows', `${ml.trainRows} / ${ml.validationRows}`],
  ];
  mlRows.forEach(([k, v], i) => {
    const ry = y + 1.02 + i * 0.32;
    s.addText(k, { x: 8.5, y: ry, w: 2.9, h: 0.28, fontSize: 10.5, color: C.muted, fontFace: FONT });
    s.addText(v, {
      x: 11.25, y: ry, w: 1.3, h: 0.28,
      fontSize: 10.5, bold: true, color: C.ink, align: 'right', fontFace: FONT,
    });
  });
  s.addText(
    `Trained on synthetic history — reported as ${riskModel.dataOrigin}, never as production accuracy.`,
    { x: 8.5, y: y + 2.04, w: 4.05, h: 0.28, fontSize: 8.5, color: C.faint, italic: true, fontFace: FONT },
  );

  bullets(s, {
    x: 8.25, y: y + 2.55, w: 4.57, h: 1.6, title: 'Rule fallback (Level 1)', accent: C.blue,
    items: [
      'Weighted sum of severity, asset criticality, overdue days, safety flag, speed restriction, corridor importance and repeat defects.',
      'Used whenever history is thin or the model fails to load — always labelled RULE_FALLBACK.',
    ],
  });
  bullets(s, {
    x: 8.25, y: y + 4.25, w: 4.57, h: 1.15, title: 'Duration engine', accent: C.teal,
    items: [
      'Historical median and P90 per task type and department.',
      'P90 drives feasibility; requested, predicted and sample count are all shown.',
    ],
  });
}

/* ------------------------------------------------------------ 6 · planner */
{
  const s = slide();
  const y = heading(s, {
    eyebrow: 'Step 3 · candidate windows',
    title: 'Only the time that is genuinely safe',
    sub: 'Half-open intervals, protected trains and their buffer subtracted, freight pressure priced in — then the optimiser sees what is left.',
  });

  screenshot(s, {
    file: 'planner.png', x: 0.55, y, w: 7.4,
    caption: 'Block planner — horizon, corridor scope, and the five stages that run on Generate',
  });

  bullets(s, {
    x: 8.25, y, w: 4.57, h: 2.4, title: 'Interval arithmetic, unit-tested', accent: C.teal,
    items: [
      'No overlap, full overlap, partial at start, partial at end.',
      'One train splitting a window; several trains splitting a window.',
      'Touching intervals — [start, end) never double-counts a boundary minute.',
    ],
  });

  panel(s, 8.25, y + 2.55, 4.57, 2.85);
  s.addText('WHY A TASK GETS REJECTED', {
    x: 8.5, y: y + 2.72, w: 4.05, h: 0.26,
    fontSize: 10, bold: true, color: C.amber, charSpacing: 1.2, fontFace: FONT,
  });
  const reasons = [
    'NO_BLOCK_WINDOW',
    'TRAIN_CONFLICT',
    'INSUFFICIENT_DURATION',
    'POWER_ISOLATION_UNAVAILABLE',
    'DISCONNECTION_UNAVAILABLE',
    'INCOMPATIBLE_TASK',
    'OUTSIDE_HORIZON',
  ];
  s.addText(
    reasons.map((r) => ({ text: r, options: { bullet: { code: '2022' }, breakLine: true } })),
    { x: 8.62, y: y + 3.04, w: 4.0, h: 2.0, fontSize: 10.5, color: C.muted, fontFace: FONT, lineSpacing: 16 },
  );
  s.addText('Every unscheduled task names one. Nothing disappears silently.', {
    x: 8.5, y: y + 5.02, w: 4.05, h: 0.3, fontSize: 9, color: C.faint, italic: true, fontFace: FONT,
  });
}

/* --------------------------------------------------------- 7 · plan result */
{
  const s = slide();
  const y = heading(s, {
    eyebrow: 'Step 4 · optimised plan',
    title: 'A weekly plan the solver proved optimal',
    sub: 'One possession can serve several departments at once — and the jobs that could not be placed safely are still on the page.',
  });

  screenshot(s, {
    file: 'plan.png', x: 0.55, y, w: 7.4,
    caption: 'Block plan — weekly horizon, OPTIMAL, 25 of 109 jobs placed across 18 blocks',
  });

  const tiles = [
    { label: 'Solver status', value: 'OPTIMAL', note: 'No better plan exists for these jobs, windows and rules', color: C.green },
    { label: 'Asset availability', value: '97.817%', note: 'Share of section time not under block', color: C.teal },
    { label: 'Track time taken', value: '1,980 min', note: 'across 18 separate blocks', color: C.blue },
    { label: 'Shared blocks', value: '7', note: 'one possession serving several departments', color: C.violet },
  ];
  tiles.forEach((t, i) => stat(s, {
    ...t,
    x: 8.25 + (i % 2) * 2.37,
    y: y + Math.floor(i / 2) * 1.5,
    w: 2.2, h: 1.4,
  }));

  bullets(s, {
    x: 8.25, y: y + 3.15, w: 4.57, h: 2.25, title: 'Honest about what was left out', accent: C.amber,
    items: [
      '84 jobs left out, each with a reason code attached.',
      '3 critical jobs still have no safe slot — the constraints were not relaxed to fit them in.',
      'An independent validator re-derives every rule afterwards and rejects a plan with a train conflict, a task outside a block, a missing power or disconnection requirement, a duplicate assignment, or a block outside the horizon.',
    ],
  });
}

/* ---------------------------------------------------------- 8 · comparison */
{
  const s = slide();
  const y = heading(s, {
    eyebrow: 'Step 5 · proof',
    title: 'Coordinated vs department-by-department',
    sub: 'Same jobs, same windows, same durations, same safety rules — the only variable is coordination.',
  });

  screenshot(s, {
    file: 'compare.png', x: 0.55, y, w: 7.4,
    caption: 'Monthly horizon — coordination improved 6 of 10 measures, and 2 got worse',
  });

  const tiles = [
    { label: 'Total block minutes', value: '−11,400', note: '7,030 coordinated vs 18,430 today', color: C.green },
    { label: 'Multi-department blocks', value: '+25', note: '25 coordinated vs 0 today', color: C.teal },
  ];
  tiles.forEach((t, i) => stat(s, { ...t, x: 8.25 + i * 2.37, y, w: 2.2, h: 1.4 }));

  bullets(s, {
    x: 8.25, y: y + 1.55, w: 4.57, h: 2.0, title: 'The trade-off we are not hiding', accent: C.amber,
    items: [
      'The baseline places more tasks (145 vs 90) — by taking 2.6× more track time.',
      'Coordination buys back 11,400 block minutes and closes the line far less often.',
      'Critical coverage is unchanged: 27 scheduled, 2 unscheduled, on both sides.',
    ],
  });
  bullets(s, {
    x: 8.25, y: y + 3.7, w: 4.57, h: 1.7, title: 'No number is hard-coded', accent: C.blue,
    items: [
      'Both plans are computed at run time from the same inputs.',
      'Change a weight or the train buffer, press Generate, and every figure moves.',
      'Asset availability is derived from horizon minutes and section count, not asserted.',
    ],
  });
}

/* ------------------------------------------------------------ 9 · horizons */
{
  const s = slide();
  heading(s, {
    eyebrow: 'Deliverable 4',
    title: 'Weekly and monthly, from one engine',
    sub: 'Both horizons share the same priority, candidate-window, validation, baseline and metrics modules.',
  });

  panel(s, 0.55, 2.1, 6.05, 2.65);
  s.addText('WEEKLY', {
    x: 0.85, y: 2.3, w: 5.4, h: 0.3,
    fontSize: 12, bold: true, color: C.blue, charSpacing: 1.4, fontFace: FONT,
  });
  s.addText('Seven days · 15-minute slots', {
    x: 0.85, y: 2.63, w: 5.4, h: 0.35, fontSize: 17, bold: true, color: C.ink, fontFace: FONT,
  });
  s.addText(
    [
      'Exact start and end times for every block.',
      'Detailed task-within-block timings, grouped by section.',
      'The short-term execution view for the district.',
    ].map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })),
    { x: 1.0, y: 3.1, w: 5.2, h: 1.5, fontSize: 11.5, color: C.muted, fontFace: FONT, lineSpacing: 19 },
  );

  panel(s, 6.77, 2.1, 6.05, 2.65);
  s.addText('MONTHLY', {
    x: 7.07, y: 2.3, w: 5.4, h: 0.3,
    fontSize: 12, bold: true, color: C.violet, charSpacing: 1.4, fontFace: FONT,
  });
  s.addText('28–31 days · day-wise allocation', {
    x: 7.07, y: 2.63, w: 5.4, h: 0.35, fontSize: 17, bold: true, color: C.ink, fontFace: FONT,
  });
  s.addText(
    [
      'Coarser slots for longer-range coordination.',
      'Labelled a planning view, not a granted operational block.',
      'Long-term backlog burn-down across all three departments.',
    ].map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })),
    { x: 7.22, y: 3.1, w: 5.2, h: 1.5, fontSize: 11.5, color: C.muted, fontFace: FONT, lineSpacing: 19 },
  );

  const tiles = [
    { label: 'Monthly backlog scheduled', value: '48%', note: '90 of 187 jobs placed', color: C.blue },
    { label: 'Critical covered', value: '27', note: '2 critical still have no safe slot', color: C.amber },
    { label: 'Asset availability', value: '99.125%', note: 'across the monthly horizon', color: C.teal },
    { label: 'Shared blocks', value: '25', note: 'multi-department possessions', color: C.violet },
  ];
  tiles.forEach((t, i) => stat(s, { ...t, x: 0.55 + i * 3.12, y: 5.0, w: 2.9, h: 1.4 }));
}

/* ------------------------------------------------------------- 10 · stack */
{
  const s = slide();
  heading(s, {
    eyebrow: 'How it is built',
    title: 'A stack chosen to be inspected, not just demoed',
  });

  bullets(s, {
    x: 0.55, y: 1.75, w: 4.0, h: 2.5, title: 'Frontend', accent: C.blue,
    items: [
      'Angular 22, standalone components, client-side rendering only.',
      'Signals for all state; Signal Forms; httpResource for reads.',
      'Tailwind CSS 4 as the only design system — no component library.',
      'Department shown by text and colour, never colour alone.',
    ],
  });
  bullets(s, {
    x: 4.68, y: 1.75, w: 4.0, h: 2.5, title: 'Backend', accent: C.teal,
    items: [
      'Node.js 24, plain JavaScript, ES modules, Express 5.',
      'MySQL 8.0 with handwritten SQL and mysql2/promise — no ORM.',
      'Domain modules: routes, controller, validation, service, repository.',
      'Engines and solvers are pure logic, with no Express inside.',
    ],
  });
  bullets(s, {
    x: 8.81, y: 1.75, w: 4.0, h: 2.5, title: 'Planning core', accent: C.amber,
    items: [
      'glpk.js MILP behind a single solver adapter.',
      'Greedy fallback when the solver fails, reported as FALLBACK_FEASIBLE.',
      'An independent plan validator running after the solver, not inside it.',
      'The manual baseline planner as a first-class deliverable.',
    ],
  });

  bullets(s, {
    x: 0.55, y: 4.4, w: 6.05, h: 2.0, title: 'Tested where it matters', accent: C.green,
    items: [
      'Backend on node --test: adapter validation and idempotency, priority fallback, logistic regression on a known dataset, duration P90, interval subtraction, rejection reasons, baseline, GLPK, fallback, validation and metrics.',
      'Frontend on Vitest + jsdom via @angular/build:unit-test — every generated spec kept and extended.',
    ],
  });
  bullets(s, {
    x: 6.77, y: 4.4, w: 6.05, h: 2.0, title: 'Deliberately out of scope', accent: C.faint,
    items: [
      'No auth, RBAC, approval workflow or audit framework — this is decision support.',
      'No BDMS write-back: no official API contract is published, so we do not pretend to have one.',
      'No Docker, CI/CD or cloud deployment in the MVP.',
    ],
  });
}

/* ------------------------------------------------------------- 11 · close */
{
  const s = slide();
  heading(s, {
    eyebrow: 'Where this goes',
    title: 'What is next, and what we will not claim',
  });

  bullets(s, {
    x: 0.55, y: 1.75, w: 6.05, h: 2.7, title: 'Next steps', accent: C.blue,
    items: [
      'Swap each MOCK adapter for the REST adapter once a real TMS / SMMS / TDMS / COA feed exists — the code path is already there.',
      'Retrain the risk model on real maintenance history; the training pipeline is unchanged.',
      'BDMS write-back once an official API contract is published.',
      'Retrospective learning: feed executed block outcomes back into the duration and risk estimates.',
    ],
  });
  bullets(s, {
    x: 6.77, y: 1.75, w: 6.05, h: 2.7, title: 'What we do not claim', accent: C.red,
    items: [
      'The model is trained on synthetic history and is reported as such — no production accuracy is asserted.',
      'The system does not operate signalling, grant a traffic block, or switch traction power.',
      'It does not replace authorised railway officials; every plan is a recommendation.',
      'No improvement percentage is hard-coded anywhere in the codebase.',
    ],
  });

  panel(s, 0.55, 4.65, 12.25, 1.65, '10243B');
  s.addText('Decentralised and manual  →  data-driven and coordinated', {
    x: 0.85, y: 4.9, w: 11.65, h: 0.45, fontSize: 22, bold: true, color: C.ink, fontFace: FONT,
  });
  s.addText(
    'Six feeds integrated · every task scored and explained · safety constraints enforced as hard limits · '
    + 'weekly and monthly plans · and a measured comparison against how it is done today.',
    { x: 0.85, y: 5.4, w: 11.65, h: 0.75, fontSize: 12.5, color: C.muted, fontFace: FONT },
  );
}

/* ------------------------------------------------------------ 12 · thanks */
{
  const s = plainSlide();
  s.addText('Thank you', {
    x: 0.9, y: 2.5, w: 11.6, h: 1.0, fontSize: 52, bold: true, color: C.ink, fontFace: FONT,
  });
  s.addText('RailPlan AI · SIH26027 · AI-Powered Automatic Block Planning', {
    x: 0.95, y: 3.55, w: 11.5, h: 0.5, fontSize: 18, color: C.blue, fontFace: FONT,
  });
  s.addText('Questions welcome — weights, buffers and the horizon can be changed live and the plan regenerated.', {
    x: 0.95, y: 4.1, w: 11.5, h: 0.4, fontSize: 13, color: C.muted, fontFace: FONT,
  });
  ['Live demo', 'Change a weight', 'Re-run the solver'].forEach((t, i) => {
    pill(s, { x: 0.95 + i * 2.5, y: 4.8, w: 2.3, text: t, color: [C.teal, C.violet, C.amber][i] });
  });
  s.addText('Synthetic demonstration data — not Indian Railways production data.', {
    x: 0.95, y: 6.3, w: 11.5, h: 0.3, fontSize: 10, color: C.faint, italic: true, fontFace: FONT,
  });
}

/* ------------------------------------------------------------------ write */

const out = resolve(here, 'RailPlan-AI-SIH26027.pptx');
await pptx.writeFile({ fileName: out });
console.log(`Wrote ${out} (${deck.length} slides)`);
