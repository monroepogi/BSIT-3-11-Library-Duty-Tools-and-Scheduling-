import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import type { HealthStatusDto } from '@vits/shared-types';
import { catchError, debounceTime, of, Subject, switchMap, timeout } from 'rxjs';
import { ApiClient } from './api-client.service';
import { MockChaosService } from './mock-chaos.service';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly api = inject(ApiClient);
  private readonly chaos = inject(MockChaosService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly rawNetworkConnected = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  );
  private readonly rawApiReachable = signal<boolean>(true);
  readonly lastCheckedAt = signal<string | null>(null);

  readonly networkConnected = computed(
    () => !this.chaos.forcedOffline() && this.rawNetworkConnected(),
  );
  readonly apiReachable = computed(
    () => !this.chaos.forcedOffline() && this.rawApiReachable(),
  );
  readonly isOnline = computed(() => this.networkConnected() && this.apiReachable());

  private readonly probeTrigger$ = new Subject<void>();

  constructor() {
    this.setupPlatformListeners();
    this.setupReachabilityProbe();
  }

  requestReachabilityCheck(): void {
    this.probeTrigger$.next();
  }

  reportTransportFailure(): void {
    this.rawApiReachable.set(false);
    this.probeTrigger$.next();
  }

  reportApiSuccess(): void {
    if (!this.rawApiReachable()) {
      this.rawApiReachable.set(true);
    }
  }

  probeNow(): void {
    if (this.chaos.forcedOffline() || !this.rawNetworkConnected()) {
      this.rawApiReachable.set(false);
      this.lastCheckedAt.set(new Date().toISOString());
      return;
    }

    this.api
      .get<HealthStatusDto>('/health', { endpointGroup: 'health', skipAuth: true })
      .pipe(
        timeout(3000),
        catchError(() => of(null)),
      )
      .subscribe((res) => {
        this.rawApiReachable.set(res?.status === 'ok');
        this.lastCheckedAt.set(new Date().toISOString());
      });
  }

  private setupReachabilityProbe(): void {
    const sub = this.probeTrigger$
      .pipe(
        debounceTime(500),
        switchMap(() => {
          if (this.chaos.forcedOffline() || !this.rawNetworkConnected()) {
            this.rawApiReachable.set(false);
            this.lastCheckedAt.set(new Date().toISOString());
            return of(null);
          }
          return this.api
            .get<HealthStatusDto>('/health', { endpointGroup: 'health', skipAuth: true })
            .pipe(
              timeout(3000),
              catchError(() => of(null)),
            );
        }),
      )
      .subscribe((res) => {
        if (!this.chaos.forcedOffline() && this.rawNetworkConnected()) {
          this.rawApiReachable.set(res?.status === 'ok');
          this.lastCheckedAt.set(new Date().toISOString());
        }
      });

    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private setupPlatformListeners(): void {
    if (typeof window !== 'undefined') {
      const onOnline = () => {
        this.rawNetworkConnected.set(true);
        this.probeTrigger$.next();
      };
      const onOffline = () => {
        this.rawNetworkConnected.set(false);
        this.rawApiReachable.set(false);
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      });
    }

    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then((status) => {
        this.rawNetworkConnected.set(status.connected);
        if (status.connected) this.probeTrigger$.next();
      });

      const netHandlePromise = Network.addListener('networkStatusChange', (status) => {
        this.rawNetworkConnected.set(status.connected);
        if (status.connected) {
          this.probeTrigger$.next();
        } else {
          this.rawApiReachable.set(false);
        }
      });

      const appHandlePromise = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.probeTrigger$.next();
        }
      });

      this.destroyRef.onDestroy(() => {
        void netHandlePromise.then((h) => h.remove());
        void appHandlePromise.then((h) => h.remove());
      });
    }
  }
}
