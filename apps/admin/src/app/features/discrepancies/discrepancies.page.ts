import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DiscrepancyDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-discrepancies',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Discrepancy Inbox</h1>
        <div class="vits-muted">Investigate and resolve clock-drift, signature, and attendance anomalies</div>
      </div>
      <div class="vits-row">
        <select class="admin-select" [ngModel]="filter()" (ngModelChange)="filter.set($event)">
          <option value="open">Open only</option>
          <option value="resolved">Resolved</option>
          <option value="all">All discrepancies</option>
        </select>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Refresh</button>
      </div>
    </div>

    @if (feedback()) {
      <div class="vits-banner duty" role="status">{{ feedback() }}</div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading discrepancies...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (filtered().length === 0) {
      <div class="admin-state-box">No discrepancies in this view.</div>
    } @else {
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Student / OIC</th>
              <th>Section</th>
              <th>Summary</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (d of filtered(); track d.id) {
              <tr>
                <td>
                  <span
                    class="vits-chip"
                    [class.bad]="d.severity === 'high'"
                    [class.warn]="d.severity === 'medium'"
                    [class.info]="d.severity === 'low'"
                  >
                    {{ d.severity }}
                  </span>
                </td>
                <td><strong>{{ d.type }}</strong></td>
                <td>{{ d.studentName }}<div class="vits-muted">OIC: {{ d.oicName }}</div></td>
                <td>{{ d.sectionName }}</td>
                <td>
                  {{ d.summary }}
                  @if (d.resolutionNotes) {
                    <div class="vits-muted">Resolution: {{ d.resolutionNotes }} ({{ d.resolvedBy }})</div>
                  }
                </td>
                <td>
                  <span class="vits-chip" [class.ok]="d.status === 'resolved'" [class.bad]="d.status === 'open'">
                    {{ d.status }}
                  </span>
                </td>
                <td>
                  @if (d.status === 'open') {
                    <button type="button" class="admin-btn sm" (click)="openResolve(d)">Resolve</button>
                  } @else {
                    <span class="vits-muted">Closed</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (resolving(); as target) {
      <div class="admin-modal-backdrop">
        <div class="admin-modal" role="dialog" aria-modal="true">
          <h2 class="vits-heading">Resolve Discrepancy {{ target.id }}</h2>
          <p class="vits-muted">{{ target.summary }}</p>
          <form (ngSubmit)="confirmResolve()">
            <div class="admin-field">
              <label for="res-notes">Resolution Notes (logged in audit trail)</label>
              <textarea
                id="res-notes"
                class="admin-textarea"
                name="notes"
                rows="4"
                [(ngModel)]="resolutionNotes"
                required
                placeholder="Explain verification outcome and corrective action..."
              ></textarea>
            </div>
            <div class="vits-row" style="justify-content: flex-end;">
              <button type="button" class="admin-btn secondary" (click)="resolving.set(null)">Cancel</button>
              <button type="submit" class="admin-btn success" [disabled]="saving() || !resolutionNotes.trim()">
                {{ saving() ? 'Saving...' : 'Mark Resolved' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class DiscrepanciesPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly discrepancies = signal<DiscrepancyDto[]>([]);
  readonly filter = signal<'open' | 'resolved' | 'all'>('open');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);

  readonly resolving = signal<DiscrepancyDto | null>(null);
  resolutionNotes = '';

  readonly filtered = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.discrepancies() : this.discrepancies().filter((d) => d.status === f);
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.getDiscrepancies();
      this.discrepancies.set(res.discrepancies);
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  openResolve(d: DiscrepancyDto): void {
    this.resolving.set(d);
    this.resolutionNotes = '';
  }

  async confirmResolve(): Promise<void> {
    const target = this.resolving();
    if (!target || !this.resolutionNotes.trim()) return;
    this.saving.set(true);
    try {
      await this.api.resolveDiscrepancy(target.id, { resolutionNotes: this.resolutionNotes });
      this.feedback.set(`Discrepancy ${target.id} resolved.`);
      this.resolving.set(null);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
