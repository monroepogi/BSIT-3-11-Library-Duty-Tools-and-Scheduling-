import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConnectivityService } from '@vits/shared-network';
import { AdminAuthService } from '../core/admin-auth.service';

interface NavItem {
  label: string;
  path: string;
  section: 'overview' | 'management' | 'compliance';
}

@Component({
  selector: 'vits-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar" [class.open]="sidebarOpen()">
        <div class="admin-brand">
          <div class="admin-brand-mark"><img src="vits-logo.png" alt="VITS" /></div>
          <div>
            <div class="admin-brand-title">VITS Admin</div>
            <div class="admin-brand-sub">Library Portal (Web Only)</div>
          </div>
        </div>

        <nav class="admin-nav" aria-label="Admin navigation">
          @for (item of navItems; track item.path) {
            <a
              class="admin-nav-link"
              [routerLink]="item.path"
              routerLinkActive="active"
              (click)="sidebarOpen.set(false)"
            >
              {{ item.label }}
            </a>
          }
        </nav>

        <div>
          <div class="vits-muted" style="color: var(--vits-on-primary); opacity: 0.85;">
            {{ auth.currentUser()?.fullName }}
          </div>
          <div class="vits-muted" style="color: var(--vits-on-primary); opacity: 0.65;">
            {{ auth.currentUser()?.email }}
          </div>
        </div>
      </aside>

      <div class="admin-main">
        <header class="admin-topbar">
          <div class="vits-row">
            <button
              type="button"
              class="admin-btn secondary sm admin-mobile-menu-btn"
              (click)="sidebarOpen.set(!sidebarOpen())"
            >
              Menu
            </button>
            <strong>University Main Library • 1st Sem AY 2026–2027</strong>
          </div>

          <div class="vits-row">
            <span class="vits-chip" [class.ok]="connectivity.isOnline()" [class.bad]="!connectivity.isOnline()">
              {{ connectivity.isOnline() ? 'Online' : 'Disconnected' }}
            </span>
            <button type="button" class="admin-btn secondary sm" (click)="logout()">
              Sign out
            </button>
          </div>
        </header>

        <main class="admin-content">
          @if (!connectivity.isOnline()) {
            <div class="vits-banner offline" role="alert">
              <span>
                Connection lost — Admin Web requires an active internet connection (no offline mode).
              </span>
              <button type="button" class="admin-btn secondary sm" (click)="retryConnection()">
                Retry check
              </button>
            </div>
          }

          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class AdminShellComponent {
  readonly auth = inject(AdminAuthService);
  readonly connectivity = inject(ConnectivityService);
  readonly sidebarOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', section: 'overview' },
    { label: 'Users & CSV Import', path: '/users', section: 'management' },
    { label: 'Semesters & Caps', path: '/semesters', section: 'management' },
    { label: 'Library Sections', path: '/sections', section: 'management' },
    { label: 'Schedule Timetable', path: '/schedule', section: 'management' },
    { label: 'Request Approvals', path: '/requests', section: 'management' },
    { label: 'Sync Batches', path: '/sync-audit', section: 'compliance' },
    { label: 'Discrepancies', path: '/discrepancies', section: 'compliance' },
    { label: 'Compliance Reports', path: '/reports', section: 'compliance' },
  ];

  retryConnection(): void {
    this.connectivity.probeNow();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
