import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { Role } from '../attributes/role';
import { AuthService } from '../core/auth.service';

// Checks session hydration + offline lock + role ownership
export const roleGuard =
  (allowed: Role[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ensureInitialized();

    const currentRole = auth.role();
    if (!currentRole) return router.parseUrl('/login');
    if (auth.locked()) return router.parseUrl('/unlock');
    return allowed.includes(currentRole) ? true : router.parseUrl(auth.homeUrl());
  };

export const roleChildGuard =
  (allowed: Role[]): CanActivateChildFn =>
  (route, state) =>
    roleGuard(allowed)(route, state);
