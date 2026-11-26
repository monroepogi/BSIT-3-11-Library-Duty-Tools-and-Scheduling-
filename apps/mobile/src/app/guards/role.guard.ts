import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../attributes/role';
import { SessionService } from '../services/session/session';

// Not signed in -> /login. Wrong role -> bounced to own home.
export const roleGuard = (allowed: Role[]): CanActivateFn => () => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (!session.role) return router.parseUrl('/login');
  return allowed.includes(session.role) ? true : router.parseUrl(session.homeUrl());
};
