import { Routes } from '@angular/router';

export const OIC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./oic-tab/oic-tab.page').then(m => m.OicTabPage),
    children: [
      { path: 'home', loadComponent: () => import('../shared/home/home.page').then(m => m.HomePage) },
      { path: 'roster', loadComponent: () => import('../shared/roster/roster.page').then(m => m.RosterPage) },
      { path: 'tasks', loadComponent: () => import('../shared/tasks/tasks.page').then(m => m.TasksPage) },
      { path: 'requests', loadComponent: () => import('../shared/requests/requests.page').then(m => m.RequestsPage) },
      { path: 'visitors', loadComponent: () => import('../shared/visitors/visitors.page').then(m => m.VisitorsPage) },
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  }
];
