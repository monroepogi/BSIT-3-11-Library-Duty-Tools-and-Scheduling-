import { Routes } from '@angular/router';

export const STUDENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./student-tab/student-tab.page').then(m => m.StudentTabPage),
    children: [
      { path: 'home', loadComponent: () => import('../shared/home/home.page').then(m => m.HomePage) },
      { path: 'roster', loadComponent: () => import('../shared/roster/roster.page').then(m => m.RosterPage) },
      { path: 'tasks', loadComponent: () => import('../shared/tasks/tasks.page').then(m => m.TasksPage) },
      { path: 'requests', loadComponent: () => import('../shared/requests/requests.page').then(m => m.RequestsPage) },
      { path: 'profile', loadComponent: () => import('../shared/profile/profile.page').then(m => m.ProfilePage) },
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  }
];
