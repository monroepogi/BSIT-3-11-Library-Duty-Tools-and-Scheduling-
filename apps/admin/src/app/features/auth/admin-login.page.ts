import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-login',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-login-shell">
      <div class="admin-login-card">
        <div class="vits-row" style="justify-content: flex-start; margin-bottom: var(--vits-space-4);">
          <div class="admin-brand-mark"><img src="vits-logo.png" alt="VITS" /></div>
          <div>
            <h1 class="vits-heading" style="margin: 0;">VITS Admin Portal</h1>
            <div class="vits-muted">Web-only administrative console</div>
          </div>
        </div>

        @if (auth.sessionMessage()) {
          <div class="vits-banner offline" role="status">{{ auth.sessionMessage() }}</div>
        }

        @if (errorMessage()) {
          <div class="admin-state-box error" role="alert" style="margin-bottom: var(--vits-space-3); text-align: left;">
            {{ errorMessage() }}
          </div>
        }

        <form (ngSubmit)="submit()">
          <div class="admin-field">
            <label for="admin-email">Admin Email</label>
            <input
              id="admin-email"
              class="admin-input"
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              placeholder="admin@university.edu"
            />
          </div>

          <div class="admin-field">
            <label for="admin-password">Password</label>
            <input
              id="admin-password"
              class="admin-input"
              type="password"
              name="password"
              [(ngModel)]="password"
              required
              placeholder="Enter password"
            />
          </div>

          <button type="submit" class="admin-btn" style="width: 100%;" [disabled]="loading() || !email.trim() || !password">
            {{ loading() ? 'Signing in...' : 'Sign in to Admin Portal' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class AdminLoginPage {
  readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async submit(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.errorMessage.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
