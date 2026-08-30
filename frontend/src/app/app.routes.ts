import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard - AI Block Planning',
    loadComponent: () => import('./components/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'data-sources',
    title: 'Data sources - AI Block Planning',
    loadComponent: () => import('./components/data-sources/data-sources').then((m) => m.DataSources),
  },
  {
    path: 'maintenance',
    title: 'Maintenance tasks - AI Block Planning',
    loadComponent: () =>
      import('./components/maintenance-tasks/maintenance-tasks').then((m) => m.MaintenanceTasks),
  },
  {
    path: 'planner',
    title: 'Block planner - AI Block Planning',
    loadComponent: () =>
      import('./components/block-planner/block-planner').then((m) => m.BlockPlanner),
  },
  {
    path: 'plans/:id',
    title: 'Plan results - AI Block Planning',
    loadComponent: () => import('./components/plan-results/plan-results').then((m) => m.PlanResults),
  },
  {
    path: 'compare',
    title: 'Plan comparison - AI Block Planning',
    loadComponent: () =>
      import('./components/plan-comparison/plan-comparison').then((m) => m.PlanComparison),
  },
  { path: '**', redirectTo: 'dashboard' },
];
