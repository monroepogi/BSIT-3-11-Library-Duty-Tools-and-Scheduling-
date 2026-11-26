import { Routes } from '@angular/router';
import {
  adminAuthChildGuard,
  adminAuthGuard,
  adminRoleChildGuard,
  adminRoleGuard,
} from './core/admin-auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/admin-login.page').then((m) => m.AdminLoginPage),
  },
  {
    path: '',
    canActivate: [adminAuthGuard, adminRoleGuard],
    canActivateChild: [adminAuthChildGuard, adminRoleChildGuard],
    loadComponent: () =>
      import('./shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'semesters',
        loadComponent: () =>
          import('./features/semesters/semesters.page').then((m) => m.SemestersPage),
      },
      {
        path: 'sections',
        loadComponent: () =>
          import('./features/sections/sections.page').then((m) => m.SectionsPage),
      },
      {
        path: 'schedule',
        loadComponent: () =>
          import('./features/schedule/schedule.page').then((m) => m.SchedulePage),
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('./features/requests/requests.page').then((m) => m.RequestsPage),
      },
      {
        path: 'sync-audit',
        loadComponent: () =>
          import('./features/sync-audit/sync-audit.page').then((m) => m.SyncAuditPage),
      },
      {
        path: 'discrepancies',
        loadComponent: () =>
          import('./features/discrepancies/discrepancies.page').then((m) => m.DiscrepanciesPage),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
