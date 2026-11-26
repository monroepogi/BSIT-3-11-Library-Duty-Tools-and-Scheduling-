import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MockChaosService {
  readonly latencyMs = signal<number>(80);
  readonly forcedOffline = signal<boolean>(false);
  readonly failureRate = signal<number>(0);
  readonly slowTimeoutNext = signal<boolean>(false);
  readonly expireAccessNext = signal<boolean>(false);
  readonly expireRefreshNext = signal<boolean>(false);
  readonly emptyStateOverride = signal<boolean>(false);
  readonly rejectNextSyncOp = signal<boolean>(false);
  readonly tokenThemePreview = signal<'default' | 'archival-teal'>('default');

  constructor() {
    this.hydrateFromQueryParams();
  }

  hydrateFromQueryParams(search: string = typeof window !== 'undefined' ? window.location.search : ''): void {
    if (!search) return;
    const params = new URLSearchParams(search);
    if (params.has('mockLatency')) {
      const ms = Number(params.get('mockLatency'));
      if (!Number.isNaN(ms) && ms >= 0) this.latencyMs.set(ms);
    }
    if (params.get('mockOffline') === '1') {
      this.forcedOffline.set(true);
    }
    if (params.has('mockFailRate')) {
      const rate = Number(params.get('mockFailRate'));
      if (!Number.isNaN(rate)) this.failureRate.set(Math.min(1, Math.max(0, rate)));
    }
    if (params.get('mockExpireAccess') === '1') {
      this.expireAccessNext.set(true);
    }
    if (params.get('mockExpireRefresh') === '1') {
      this.expireRefreshNext.set(true);
    }
    if (params.get('mockEmpty') === '1') {
      this.emptyStateOverride.set(true);
    }
  }

  toggleTokenTheme(): void {
    const next = this.tokenThemePreview() === 'default' ? 'archival-teal' : 'default';
    this.tokenThemePreview.set(next);
    if (typeof document !== 'undefined') {
      if (next === 'default') {
        document.documentElement.removeAttribute('data-vits-token-demo');
      } else {
        document.documentElement.setAttribute('data-vits-token-demo', next);
      }
    }
  }

  resetAll(): void {
    this.latencyMs.set(80);
    this.forcedOffline.set(false);
    this.failureRate.set(0);
    this.slowTimeoutNext.set(false);
    this.expireAccessNext.set(false);
    this.expireRefreshNext.set(false);
    this.emptyStateOverride.set(false);
    this.rejectNextSyncOp.set(false);
    if (this.tokenThemePreview() !== 'default') {
      this.toggleTokenTheme();
    }
  }
}
