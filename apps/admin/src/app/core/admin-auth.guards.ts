import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const adminAuthGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.parseUrl('/login');
};

export const adminRoleGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.parseUrl('/login');
  return auth.isAdmin() ? true : router.parseUrl('/login');
};

export const adminAuthChildGuard: CanActivateChildFn = (childRoute, state) =>
  adminAuthGuard(childRoute, state);

export const adminRoleChildGuard: CanActivateChildFn = (childRoute, state) =>
  adminRoleGuard(childRoute, state);
