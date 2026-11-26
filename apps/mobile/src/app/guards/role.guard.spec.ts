import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { roleGuard } from './role.guard';
import { SessionService } from '../services/session/session';
import { MockDataService } from '../services/mock-data/mock-data';

describe('roleGuard', () => {
  it('redirects unauthenticated users to /login', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const guard = roleGuard(['STUDENT']);
    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('allows matching role and bounces mismatched role to own home', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const session = TestBed.inject(SessionService);

    session.signIn('STUDENT');
    const allowStudent = TestBed.runInInjectionContext(() =>
      roleGuard(['STUDENT'])({} as never, {} as never),
    );
    expect(allowStudent).toBe(true);

    const blockOic = TestBed.runInInjectionContext(() =>
      roleGuard(['OIC'])({} as never, {} as never),
    );
    expect(router.serializeUrl(blockOic as UrlTree)).toBe('/student/home');

    session.signIn('OIC');
    const blockStudent = TestBed.runInInjectionContext(() =>
      roleGuard(['STUDENT'])({} as never, {} as never),
    );
    expect(router.serializeUrl(blockStudent as UrlTree)).toBe('/oic/home');
  });
});

describe('MockDataService Option A attendance mode protection', () => {
  it('prevents duplicate Time-In and duplicate Time-Out scans', () => {
    TestBed.configureTestingModule({});
    const data = TestBed.inject(MockDataService);

    expect(data.isClockedIn('Juan Dela Cruz')).toBe(false);
    expect(data.clockOut('Juan Dela Cruz')).toBe('not_in');

    expect(data.clockIn('Juan Dela Cruz')).toBe('ok');
    expect(data.isClockedIn('Juan Dela Cruz')).toBe(true);
    expect(data.clockIn('Juan Dela Cruz')).toBe('already_in');

    expect(data.clockOut('Juan Dela Cruz')).toBe('ok');
    expect(data.isClockedIn('Juan Dela Cruz')).toBe(false);
  });
});
