import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiClient, type AuthSessionPort, ConnectivityService } from '@vits/shared-network';
import {
  getLibraryDateString,
  isApiErrorEnvelope,
  VitsApiError,
  type AuthTokensResponseDto,
  type DutyCertificateDto,
  type HoursSummaryDto,
  type IssueDutyCertRequestDto,
  type IssueStudentPassCertRequestDto,
  type LoginRequestDto,
  type LogoutRequestDto,
  type ShiftDto,
  type StudentPassCertificateDto,
  type TaskDto,
  type TrustPublicKeyDto,
  type UserProfileDto,
} from '@vits/shared-types';
import {
  LocalDbService,
} from './db/local-db.service';
import {
  OutboxRepository,
  ShiftsRepository,
  TasksRepository,
  TrustCacheRepository,
} from './db/repositories';
import { SecureVaultService } from './secure-vault.service';
import { SyncService } from './sync/sync.service';

@Injectable({ providedIn: 'root' })
export class AuthService implements AuthSessionPort {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly connectivity = inject(ConnectivityService);
  private readonly vault = inject(SecureVaultService);
  private readonly db = inject(LocalDbService);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly outboxRepo = inject(OutboxRepository);
  private readonly trustRepo = inject(TrustCacheRepository);
  private readonly sync = inject(SyncService);

  private accessToken: string | null = null;
  private refreshTokenCache: string | null = null;
  private restored = false;

  readonly currentUser = signal<UserProfileDto | null>(null);
  readonly locked = signal(false);
  readonly hasPinConfigured = signal(false);
  readonly sessionMessage = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.currentUser() !== null && !this.locked());
  readonly isOffline = computed(() => !this.connectivity.isOnline());
  readonly pendingSync = this.outboxRepo.pendingCount;
  readonly role = computed<'STUDENT' | 'OIC' | null>(() => {
    const r = this.currentUser()?.role;
    return r === 'oic' ? 'OIC' : r === 'student' ? 'STUDENT' : null;
  });
  readonly userName = computed(() => this.currentUser()?.fullName ?? '');
  readonly onDuty = computed(() =>
    this.shiftsRepo.shifts().some((s) => s.userId === this.currentUser()?.id && s.status === 'in_progress'),
  );

  constructor() {
    this.sync.attachLifecycleTriggers(() => this.isAuthenticated());
  }

  async ensureInitialized(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    await this.db.init();
    const [cachedProfile, storedRefresh, hasPin] = await Promise.all([
      this.vault.getCachedProfile(),
      this.vault.getRefreshToken(),
      this.vault.hasOfflinePin(),
    ]);
    this.refreshTokenCache = storedRefresh;
    this.hasPinConfigured.set(hasPin);

    if (cachedProfile && storedRefresh) {
      this.currentUser.set(cachedProfile);
      // Require offline PIN unlock when resuming from disk without an in-memory access token
      this.locked.set(true);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshTokenCache;
  }

  updateTokens(tokens: AuthTokensResponseDto): void {
    this.accessToken = tokens.accessToken;
    this.refreshTokenCache = tokens.refreshToken;
    this.currentUser.set(tokens.user);
    this.locked.set(false);
    this.sessionMessage.set(null);
    void this.vault.setRefreshToken(tokens.refreshToken);
    void this.vault.setCachedProfile(tokens.user);
    void this.trustRepo.setProfile(tokens.user);
  }

  onSessionInvalidated(reason: 'revoked' | 'expired'): void {
    this.accessToken = null;
    this.refreshTokenCache = null;
    this.currentUser.set(null);
    this.locked.set(false);
    void this.vault.clearSessionSecrets();
    this.sessionMessage.set(
      reason === 'revoked'
        ? 'Your session was revoked. Please sign in again.'
        : 'Session expired. Please sign in again.',
    );
    void this.router.navigateByUrl('/login');
  }

  async login(email: string, password: string): Promise<UserProfileDto> {
    await this.db.init();
    const deviceId = await this.vault.getOrCreateDeviceId();
    const res = await firstValueFrom(
      this.api.post<LoginRequestDto, AuthTokensResponseDto>(
        '/auth/login',
        { email: email.trim(), password, deviceId, deviceName: 'VITS Mobile' },
        { endpointGroup: 'identity', skipAuth: true },
      ),
    );

    if (res.user.role === 'admin') {
      throw new VitsApiError(403, {
        error: {
          code: 'AUTH_FORBIDDEN_CLIENT',
          message: 'Admin accounts must use the VITS Admin Web Portal.',
          correlationId: 'client-guard',
          timestamp: new Date().toISOString(),
        },
      });
    }

    this.updateTokens(res);
    this.hasPinConfigured.set(await this.vault.hasOfflinePin());
    await this.hydrateAfterAuth(res.user);
    return res.user;
  }

  async setupOfflinePin(pin: string): Promise<void> {
    await this.vault.setOfflinePin(pin);
    this.hasPinConfigured.set(true);
    await this.notify('Offline PIN saved');
  }

  lockSession(): void {
    if (!this.currentUser()) return;
    this.accessToken = null;
    this.locked.set(true);
    void this.router.navigateByUrl('/unlock');
  }

  async unlockWithPin(pin: string): Promise<boolean> {
    const valid = await this.vault.verifyOfflinePin(pin);
    if (!valid) return false;
    this.locked.set(false);
    // Attempt silent token refresh if online; stay functional offline if unreachable
    if (this.connectivity.isOnline() && this.refreshTokenCache) {
      void this.sync.syncNow().catch(() => undefined);
    }
    return true;
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken && this.connectivity.isOnline()) {
        await firstValueFrom(
          this.api.post<LogoutRequestDto, { revoked: boolean }>(
            '/auth/logout',
            { refreshToken: this.refreshTokenCache ?? undefined },
            { endpointGroup: 'identity' },
          ),
        );
      }
    } catch {
      // Clear local session regardless of transport error
    } finally {
      this.accessToken = null;
      this.refreshTokenCache = null;
      this.currentUser.set(null);
      this.locked.set(false);
      await this.vault.clearSessionSecrets();
      await this.db.resetAll();
      await this.router.navigateByUrl('/login');
    }
  }

  async hydrateAfterAuth(user: UserProfileDto): Promise<void> {
    if (!this.connectivity.isOnline()) return;

    try {
      const deviceId = await this.vault.getOrCreateDeviceId();
      const keypair = await this.vault.getOrCreateDeviceKeypair(user.id);

      const keysRes = await firstValueFrom(
        this.api.get<{ keys: TrustPublicKeyDto[] }>('/trust/keys', {
          endpointGroup: 'identity',
          skipAuth: true,
        }),
      );
      await this.trustRepo.setKeys(keysRes.keys);

      if (user.role === 'student') {
        const [passCert, shiftsRes, hoursRes] = await Promise.all([
          firstValueFrom(
            this.api.post<IssueStudentPassCertRequestDto, StudentPassCertificateDto>(
              '/student/pass-certificates',
              { deviceId, studentDevicePubkey: keypair.publicKeyB64 },
              { endpointGroup: 'identity' },
            ),
          ),
          firstValueFrom(
            this.api.get<{ shifts: ShiftDto[] }>('/me/shifts', { endpointGroup: 'roster' }),
          ),
          firstValueFrom(
            this.api.get<HoursSummaryDto>('/me/hours-summary', { endpointGroup: 'roster' }),
          ),
        ]);
        await this.vault.saveStudentPassCert(user.id, passCert);
        await this.shiftsRepo.replaceShifts(shiftsRes.shifts);
        await this.shiftsRepo.setHoursSummary(hoursRes);

        const tasksRes = await firstValueFrom(
          this.api.get<{ tasks: TaskDto[] }>('/tasks', {
            endpointGroup: 'tasks',
          }),
        );
        await this.tasksRepo.replaceTasks(tasksRes.tasks);
      } else if (user.role === 'oic') {
        const today = getLibraryDateString(new Date(), 'Asia/Manila');
        const sectionId = user.sectionIds[0] ?? 'sec-reserve';
        const [rosterRes, hoursRes, tasksRes] = await Promise.all([
          firstValueFrom(
            this.api.get<{ shifts: ShiftDto[] }>('/oic/section-roster', {
              endpointGroup: 'roster',
              params: { date: today },
            }),
          ),
          firstValueFrom(
            this.api.get<HoursSummaryDto>('/me/hours-summary', { endpointGroup: 'roster' }),
          ),
          firstValueFrom(
            this.api.get<{ tasks: TaskDto[] }>('/tasks', {
              endpointGroup: 'tasks',
            }),
          ),
        ]);
        await this.shiftsRepo.replaceShifts(rosterRes.shifts);
        await this.shiftsRepo.setHoursSummary(hoursRes);
        await this.tasksRepo.replaceTasks(tasksRes.tasks);

        const shiftId = rosterRes.shifts[0]?.id ?? 'default';
        const dutyCert = await firstValueFrom(
          this.api.post<IssueDutyCertRequestDto, DutyCertificateDto>(
            '/oic/duty-certificates',
            { shiftId, sectionId, deviceId, oicDevicePubkey: keypair.publicKeyB64 },
            { endpointGroup: 'identity' },
          ),
        );
        await this.vault.saveOicDutyCert(user.id, dutyCert);
      }
    } catch {
      // Fall back to cached local DB if initial network hydration is interrupted
    }
  }

  homeUrl(): string {
    const r = this.role();
    return r === 'OIC' ? '/oic/home' : r === 'STUDENT' ? '/student/home' : '/login';
  }

  extractErrorMessage(err: unknown): string {
    if (err instanceof VitsApiError) {
      return `${err.code}: ${err.message}`;
    }
    if (isApiErrorEnvelope(err)) {
      return `${err.error.code}: ${err.error.message}`;
    }
    if (err instanceof Error) return err.message;
    return 'Network unreachable. Check API server connection.';
  }

  async notify(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'top' });
    await t.present();
  }
}
