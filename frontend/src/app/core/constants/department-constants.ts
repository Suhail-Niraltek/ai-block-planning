import { IconName } from '../../components/shared/icon/lucide-paths';
import { Severity } from '../models/maintenance';
import { Department, SourceCode } from '../models/source';

/**
 * Department is always shown as text plus colour, never colour alone, so the
 * tables stay readable in greyscale and for colour-blind users.
 */
export interface DepartmentMeta {
  readonly code: Department;
  readonly label: string;
  readonly fullName: string;
  readonly sourceSystem: string;
  readonly icon: IconName;
  /** Tailwind classes for the chip. */
  readonly chipClass: string;
  /** Tailwind class for a timeline bar. */
  readonly barClass: string;
}

export const DEPARTMENTS: readonly DepartmentMeta[] = [
  {
    code: 'ENG',
    label: 'ENG',
    fullName: 'Engineering (track)',
    sourceSystem: 'TMS',
    icon: 'hard-hat',
    chipClass:
      'bg-blue-100 text-blue-900 ring-blue-300 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-800',
    barClass: 'bg-rail-blue',
  },
  {
    code: 'TRD',
    label: 'TRD',
    fullName: 'Traction Distribution (OHE)',
    sourceSystem: 'TDMS',
    icon: 'zap',
    chipClass:
      'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800',
    barClass: 'bg-rail-amber',
  },
  {
    code: 'SNT',
    label: 'S&T',
    fullName: 'Signal & Telecommunication',
    sourceSystem: 'SMMS',
    icon: 'radio-tower',
    chipClass:
      'bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-800',
    barClass: 'bg-rail-violet',
  },
];

const DEPARTMENT_INDEX = new Map(DEPARTMENTS.map((item) => [item.code, item]));

export function departmentMeta(code: Department): DepartmentMeta {
  return DEPARTMENT_INDEX.get(code) ?? DEPARTMENTS[0];
}

export const SEVERITIES: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const SEVERITY_CLASS: Readonly<Record<Severity, string>> = {
  CRITICAL:
    'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800',
  HIGH: 'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-800',
  MEDIUM:
    'bg-yellow-100 text-yellow-900 ring-yellow-300 dark:bg-yellow-950 dark:text-yellow-100 dark:ring-yellow-800',
  LOW: 'bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600',
};

/** Plain-language explanations shown next to every unscheduled task. */
export const REASON_LABELS: Readonly<Record<string, string>> = {
  NO_BLOCK_WINDOW: 'No block window published',
  TRAIN_CONFLICT: 'Protected train movement',
  INSUFFICIENT_DURATION: 'Not enough usable time',
  POWER_ISOLATION_UNAVAILABLE: 'Power isolation unavailable',
  DISCONNECTION_UNAVAILABLE: 'Signalling disconnection unavailable',
  INCOMPATIBLE_TASK: 'Window claimed by another department',
  OUTSIDE_HORIZON: 'Falls outside the horizon',
};

/** What a planner would actually do about each reason. */
export const REASON_ACTION: Readonly<Record<string, string>> = {
  NO_BLOCK_WINDOW: 'Ask the Control Office to publish availability for this section.',
  TRAIN_CONFLICT: 'Needs a longer gap between protected paths, or a timetable adjustment.',
  INSUFFICIENT_DURATION: 'Split the job across two blocks, or request a longer window.',
  POWER_ISOLATION_UNAVAILABLE: 'Request a window that includes traction power isolation.',
  DISCONNECTION_UNAVAILABLE: 'Request a window that includes a signalling disconnection.',
  INCOMPATIBLE_TASK: 'Coordinate with the department already holding this window.',
  OUTSIDE_HORIZON: 'Plan this one in the next horizon.',
};

export const REASON_ICON: Readonly<Record<string, IconName>> = {
  NO_BLOCK_WINDOW: 'ban',
  TRAIN_CONFLICT: 'train-front',
  INSUFFICIENT_DURATION: 'timer',
  POWER_ISOLATION_UNAVAILABLE: 'zap',
  DISCONNECTION_UNAVAILABLE: 'radio-tower',
  INCOMPATIBLE_TASK: 'signpost',
  OUTSIDE_HORIZON: 'calendar-days',
};

export interface SourceMeta {
  readonly code: SourceCode;
  readonly name: string;
  /** What this system actually contributes to the plan, in plain language. */
  readonly contributes: string;
  readonly icon: IconName;
}

export const SOURCES: readonly SourceMeta[] = [
  {
    code: 'TMS',
    name: 'Track Management System',
    contributes: 'Track defects and overdue engineering work',
    icon: 'hard-hat',
  },
  {
    code: 'SMMS',
    name: 'Signalling Maintenance & Management System',
    contributes: 'Signalling defects and the work that needs a disconnection',
    icon: 'radio-tower',
  },
  {
    code: 'TDMS',
    name: 'Traction Distribution Management System',
    contributes: 'OHE and traction work that needs a power block',
    icon: 'zap',
  },
  {
    code: 'COA',
    name: 'Control Office Application',
    contributes: 'When each section is actually available for a block',
    icon: 'route',
  },
  {
    code: 'TIMETABLE',
    name: 'Train Time Table',
    contributes: 'Protected passenger paths that block time cannot overlap',
    icon: 'train-front',
  },
  {
    code: 'GOODS_FORECAST',
    name: 'Goods-train forecast',
    contributes: 'Expected freight volume, which sets the cost of taking a block',
    icon: 'chart-column-big',
  },
];

const SOURCE_INDEX = new Map(SOURCES.map((item) => [item.code, item]));

export function sourceMeta(code: SourceCode): SourceMeta | null {
  return SOURCE_INDEX.get(code) ?? null;
}

export const SOURCE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  SOURCES.map((item) => [item.code, item.name]),
);

export const BLOCK_TYPE_LABELS: Readonly<Record<string, string>> = {
  LINE: 'Line block',
  POWER: 'Power block',
  DISCONNECTION: 'Disconnection',
  INTEGRATED: 'Integrated block',
};

export const SYNTHETIC_NOTICE =
  'Synthetic demonstration data, generated locally. Not Indian Railways production data.';
