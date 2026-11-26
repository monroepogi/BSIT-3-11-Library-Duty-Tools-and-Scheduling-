import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MockApiStore } from './mock-api.store';
import { MockChaosService } from './mock-chaos.service';
import { ENVIRONMENT_CONFIG } from './tokens';

export type DevPersonaSwitchTarget = 'student' | 'oic' | 'lock' | 'logout';

/**
 * Dev-only Mock Lab & Persona Switcher (Phase 1–2 UI phases only).
 * Scheduled for progressive removal per docs/plan.md §2.6:
 * - Phase 3: remove Persona Switcher when real Identity/Auth lands.
 * - Phase 6 (mobile) / Phase 8 (admin): remove <vits-dev-mock-panel> completely.
 */
@Component({
  selector: 'vits-dev-mock-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (env.enableDevPanel) {
      <button
        type="button"
        class="vits-dev-fab"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        Mock Lab
        @if (chaos.forcedOffline()) {
          <span class="vits-chip vits-chip--warning">OFFLINE</span>
        }
      </button>

      @if (open()) {
        <aside class="vits-dev-drawer" role="dialog" aria-label="Mock API and UI State Lab">
          <div class="vits-row-between">
            <h3 class="vits-heading vits-dev-title">Phase 1 Mock Lab</h3>
            <button type="button" class="vits-dev-close" (click)="open.set(false)">Close</button>
          </div>

          @if (showPersonaSwitcher()) {
            <div class="vits-stack-xs">
              <span class="vits-eyebrow">Quick Role / Navigation Switcher</span>
              <div class="vits-dev-grid">
                <button
                  type="button"
                  class="vits-dev-btn"
                  [class.vits-dev-btn--active]="currentRole() === 'student'"
                  (click)="selectPersona('student')"
                >
                  Student
                </button>
                <button
                  type="button"
                  class="vits-dev-btn"
                  [class.vits-dev-btn--active]="currentRole() === 'oic'"
                  (click)="selectPersona('oic')"
                >
                  OIC
                </button>
                <button type="button" class="vits-dev-btn" (click)="selectPersona('lock')">
                  PIN Lock
                </button>
                <button type="button" class="vits-dev-btn" (click)="selectPersona('logout')">
                  Login Screen
                </button>
              </div>
            </div>
          }

          <div class="vits-stack-xs">
            <span class="vits-eyebrow">Network &amp; UI State Toggles</span>
            <div class="vits-dev-grid">
              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.forcedOffline()"
                (click)="toggleOffline()"
              >
                {{ chaos.forcedOffline() ? 'Offline: ON' : 'Force Offline' }}
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.emptyStateOverride()"
                (click)="toggleEmpty()"
              >
                {{ chaos.emptyStateOverride() ? 'Empty: ON' : 'Empty States' }}
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.latencyMs() >= 1200"
                (click)="toggleSlowNetwork()"
              >
                {{ chaos.latencyMs() >= 1200 ? 'Slow (1.5s): ON' : 'Slow Network' }}
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.failureRate() >= 1"
                (click)="toggleFailures()"
              >
                {{ chaos.failureRate() >= 1 ? '503 Fail: ON' : 'Force 503 Error' }}
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.expireAccessNext()"
                (click)="chaos.expireAccessNext.set(true)"
              >
                Next 401 (Refresh)
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.expireRefreshNext()"
                (click)="armFullSessionExpiry()"
              >
                Expire Refresh
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.rejectNextSyncOp()"
                (click)="chaos.rejectNextSyncOp.set(!chaos.rejectNextSyncOp())"
              >
                {{ chaos.rejectNextSyncOp() ? 'Reject Sync: ON' : 'Reject Next Sync' }}
              </button>

              <button
                type="button"
                class="vits-dev-btn"
                [class.vits-dev-btn--active]="chaos.tokenThemePreview() !== 'default'"
                (click)="chaos.toggleTokenTheme()"
              >
                {{
                  chaos.tokenThemePreview() === 'default'
                    ? 'Token Restyle Proof'
                    : 'Theme: Archival Teal'
                }}
              </button>
            </div>
          </div>

          <div class="vits-row-between">
            <button type="button" class="vits-dev-reset" (click)="resetEverything()">
              Reset Fixtures &amp; Flags
            </button>
          </div>
        </aside>
      }
    }
  `,
  styles: `
    .vits-dev-fab {
      position: fixed;
      bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
      right: var(--vits-space-3);
      z-index: 9999;
      min-height: var(--vits-touch-target-min);
      padding: var(--vits-space-1) var(--vits-space-3);
      border-radius: var(--vits-radius-full);
      border: 2px solid var(--vits-bg-accent);
      background: var(--vits-bg-brand-strong);
      color: var(--vits-text-on-brand);
      font-size: var(--vits-text-xs);
      font-weight: var(--vits-weight-bold);
      box-shadow: var(--vits-shadow-md);
      display: inline-flex;
      align-items: center;
      gap: var(--vits-space-2);
      cursor: pointer;
    }

    .vits-dev-drawer {
      position: fixed;
      bottom: calc(7.5rem + env(safe-area-inset-bottom, 0px));
      right: var(--vits-space-3);
      left: var(--vits-space-3);
      max-width: 26rem;
      margin-left: auto;
      z-index: 9999;
      background: var(--vits-bg-surface);
      color: var(--vits-text-primary);
      border: 2px solid var(--vits-border-brand);
      border-radius: var(--vits-radius-lg);
      padding: var(--vits-space-4);
      box-shadow: var(--vits-shadow-lg);
      display: flex;
      flex-direction: column;
      gap: var(--vits-space-3);
    }

    .vits-dev-title {
      font-size: var(--vits-text-lg);
      color: var(--vits-text-brand);
    }

    .vits-dev-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--vits-space-2);
    }

    .vits-dev-btn,
    .vits-dev-close,
    .vits-dev-reset {
      min-height: var(--vits-touch-target-min);
      padding: var(--vits-space-2) var(--vits-space-3);
      border-radius: var(--vits-radius-sm);
      border: 1px solid var(--vits-border-subtle);
      background: var(--vits-bg-subtle);
      color: var(--vits-text-primary);
      font-size: var(--vits-text-xs);
      font-weight: var(--vits-weight-bold);
      cursor: pointer;
    }

    .vits-dev-btn--active {
      background: var(--vits-bg-brand);
      color: var(--vits-text-on-brand);
      border-color: var(--vits-bg-brand);
    }

    .vits-dev-reset {
      width: 100%;
      background: var(--vits-bg-accent);
      color: var(--vits-text-on-accent);
    }
  `,
})
export class VitsDevMockPanelComponent {
  readonly env = inject(ENVIRONMENT_CONFIG);
  readonly chaos = inject(MockChaosService);
  private readonly store = inject(MockApiStore);

  readonly showPersonaSwitcher = input<boolean>(true);
  readonly currentRole = input<string | null>(null);
  readonly personaSwitch = output<DevPersonaSwitchTarget>();
  readonly stateChanged = output<void>();

  readonly open = signal<boolean>(false);

  selectPersona(target: DevPersonaSwitchTarget): void {
    this.personaSwitch.emit(target);
    this.open.set(false);
  }

  toggleOffline(): void {
    this.chaos.forcedOffline.set(!this.chaos.forcedOffline());
    this.stateChanged.emit();
  }

  toggleEmpty(): void {
    this.chaos.emptyStateOverride.set(!this.chaos.emptyStateOverride());
    this.stateChanged.emit();
  }

  toggleSlowNetwork(): void {
    this.chaos.latencyMs.set(this.chaos.latencyMs() >= 1200 ? 80 : 1500);
  }

  toggleFailures(): void {
    this.chaos.failureRate.set(this.chaos.failureRate() >= 1 ? 0 : 1);
    this.stateChanged.emit();
  }

  armFullSessionExpiry(): void {
    this.chaos.expireAccessNext.set(true);
    this.chaos.expireRefreshNext.set(true);
  }

  resetEverything(): void {
    this.store.resetDataset();
    this.chaos.resetAll();
    this.stateChanged.emit();
  }
}
