import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_SESSION_PORT, provideVitsNetwork } from '@vits/shared-network';
import type { ComplianceReportDto, UserProfileDto } from '@vits/shared-types';
import { environment } from '../environments/environment';
import { AdminApiService, parseUsersCsv } from './core/admin-api.service';
import { adminAuthGuard, adminRoleGuard } from './core/admin-auth.guards';
import { AdminAuthService } from './core/admin-auth.service';
import { DashboardPage } from './features/dashboard/dashboard.page';
import { UsersPage } from './features/users/users.page';

const ADMIN_USER: UserProfileDto = {
  id: 'usr-admin-elena',
  universityId: 'ADM-00012',
  email: 'admin@university.edu',
  fullName: 'Elena Cruz',
  role: 'admin',
  department: 'University Main Library Administration',
  active: true,
  sectionIds: [],
  sectionNames: [],
};

const SAMPLE_REPORT: ComplianceReportDto = {
  semesterId: 'sem-2026-1',
  semesterName: '1st Semester AY 2026–2027',
  generatedAt: '2026-11-26T00:00:00.000Z',
  totalStudents: 2,
  totalRenderedHours: 54.5,
  averageCompletionPct: 60,
  pendingRequestsCount: 2,
  openDiscrepanciesCount: 0,
  attendanceBreakdown: { verified: 2, pending: 2, missed: 0, flagged: 0 },
  sections: [
    {
      sectionId: 'sec-periodicals',
      sectionName: 'Periodicals & Serials',
      activeStudents: 2,
      renderedHours: 54.5,
      targetHours: 180,
      completionPct: 30,
      openDiscrepancies: 0,
    },
  ],
};

function configureAdminTestingModule(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideVitsNetwork(environment),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AUTH_SESSION_PORT, useExisting: AdminAuthService },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AdminAuthService & Guards (Real API Wiring)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('blocks unauthenticated navigation and rejects non-admin 403 from real API', async () => {
    const httpMock = configureAdminTestingModule();
    const router = TestBed.inject(Router);
    const auth = TestBed.inject(AdminAuthService);

    const guardRes = TestBed.runInInjectionContext(() =>
      adminAuthGuard({} as never, {} as never),
    );
    expect(guardRes instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(guardRes as UrlTree)).toBe('/login');

    const loginPromise = auth.login('student@university.edu', 'VitsDemo123!');
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/auth/login`);
    expect(req.request.headers.get('X-Client-Id')).toBe('admin');
    req.flush(
      {
        error: {
          code: 'AUTH_FORBIDDEN_CLIENT',
          message: 'Student accounts must use the mobile app.',
          correlationId: 'test-1',
          timestamp: new Date().toISOString(),
        },
      },
      { status: 403, statusText: 'Forbidden' },
    );

    await expect(loginPromise).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN_CLIENT',
      status: 403,
    });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('authenticates admin via /v1/auth/login and allows adminRoleGuard', async () => {
    const httpMock = configureAdminTestingModule();
    const auth = TestBed.inject(AdminAuthService);

    const loginPromise = auth.login('admin@university.edu', 'VitsDemo123!');
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/auth/login`);
    req.flush({
      accessToken: 'jwt-access',
      refreshToken: 'jwt-refresh',
      expiresInSeconds: 900,
      user: ADMIN_USER,
    });

    const user = await loginPromise;
    expect(user.role).toBe('admin');

    const allowed = TestBed.runInInjectionContext(() =>
      adminRoleGuard({} as never, {} as never),
    );
    expect(allowed).toBe(true);
  });
});

describe('Bulk CSV User Import Parser & AdminApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('validates per-row CSV errors and posts rows to /v1/admin/users/import', async () => {
    const httpMock = configureAdminTestingModule();
    const api = TestBed.inject(AdminApiService);

    const csv = [
      'university_id,full_name,email,role,department',
      '2025-99001,Ana Lim,ana.lim@university.edu,student,BS CS',
      '2025-99002,Bad Row,not-an-email,unknown,BA Art',
    ].join('\n');

    const preview = parseUsersCsv(csv);
    expect(preview).toHaveLength(2);
    expect(preview[0].errors).toHaveLength(0);
    expect(preview[1].errors.length).toBeGreaterThanOrEqual(2);

    const importPromise = api.importUsersCsv(preview);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/admin/users/import`);
    req.flush({
      importedCount: 1,
      skippedCount: 1,
      createdUsers: [],
      rowErrors: [{ rowNumber: 3, error: 'Invalid email address' }],
    });

    const result = await importPromise;
    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });
});

describe('Key Admin Components', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('renders compliance KPIs on DashboardPage and users table on UsersPage', async () => {
    const httpMock = configureAdminTestingModule();

    const dashFixture = TestBed.createComponent(DashboardPage);
    dashFixture.detectChanges();
    const dashReq = httpMock.expectOne(`${environment.apiBaseUrl}/v1/admin/reports/compliance`);
    dashReq.flush(SAMPLE_REPORT);
    await dashFixture.whenStable();
    dashFixture.detectChanges();
    expect(dashFixture.nativeElement.textContent).toContain('Compliance Dashboard');
    expect(dashFixture.nativeElement.textContent).toContain('Periodicals & Serials');

    const usersFixture = TestBed.createComponent(UsersPage);
    usersFixture.detectChanges();
    const usersReq = httpMock.expectOne(`${environment.apiBaseUrl}/v1/admin/users`);
    usersReq.flush({ users: [ADMIN_USER] });
    await usersFixture.whenStable();
    usersFixture.detectChanges();
    expect(usersFixture.nativeElement.textContent).toContain('User Management');
    expect(usersFixture.nativeElement.textContent).toContain('Elena Cruz');
  });
});
