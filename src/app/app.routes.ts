import { Routes } from '@angular/router';
import { Role } from './attributes/role';
import { roleGuard } from './guards/role.guard';

const STUDENT: Role[] = ['STUDENT'];
const OIC: Role[] = ['OIC'];
const ANY: Role[] = ['STUDENT', 'OIC'];

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },

  // separate lazy-loaded trees per role
  { path: 'student', canActivate: [roleGuard(STUDENT)],
    loadChildren: () => import('./pages/student/student.routes').then(m => m.STUDENT_ROUTES) },
  { path: 'oic', canActivate: [roleGuard(OIC)],
    loadChildren: () => import('./pages/oic/oic.routes').then(m => m.OIC_ROUTES) },

  // pushed pages (tab bar hidden)
  { path: 'shift/:id', canActivate: [roleGuard(ANY)],
    loadComponent: () => import('./pages/shared/shift-detail/shift-detail.page').then(m => m.ShiftDetailPage) },
  { path: 'profile', canActivate: [roleGuard(ANY)],
    loadComponent: () => import('./pages/shared/profile/profile.page').then(m => m.ProfilePage) },
  { path: 'visitors', canActivate: [roleGuard(ANY)],
    loadComponent: () => import('./pages/shared/visitors/visitors.page').then(m => m.VisitorsPage) },
  { path: 'visitor-new', canActivate: [roleGuard(ANY)],
    loadComponent: () => import('./pages/shared/visitor-new/visitor-new.page').then(m => m.VisitorNewPage) },

  { path: 'scan', canActivate: [roleGuard(STUDENT)],
    loadComponent: () => import('./pages/student/scan/scan.page').then(m => m.ScanPage) },
  { path: 'request-new', canActivate: [roleGuard(STUDENT)],
    loadComponent: () => import('./pages/student/request-new/request-new.page').then(m => m.RequestNewPage) },

  { path: 'qr-display', canActivate: [roleGuard(OIC)],
    loadComponent: () => import('./pages/oic/qr-display/qr-display.page').then(m => m.QrDisplayPage) },
  { path: 'task-assign', canActivate: [roleGuard(OIC)],
    loadComponent: () => import('./pages/oic/task-assign/task-assign.page').then(m => m.TaskAssignPage) },
];
