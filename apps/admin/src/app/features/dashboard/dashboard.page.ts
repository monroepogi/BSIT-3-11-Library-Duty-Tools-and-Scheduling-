import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ComplianceReportDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Compliance Dashboard</h1>
        <div class="vits-muted">Real-time semester hours, attendance verification, and audit overview</div>
      </div>
      <div class="vits-row">
        <button type="button" class="admin-btn secondary" (click)="load()" [disabled]="loading()">
          Refresh
        </button>
        <a class="admin-btn" routerLink="/reports">Export Reports</a>
      </div>
    </div>

    @if (loading()) {
      <div class="admin-state-box">Loading compliance metrics...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (report(); as r) {
      <div class="admin-kpi-grid">
        <div class="vits-card">
          <div class="vits-muted">Active Students</div>
          <div class="admin-kpi-value">{{ r.totalStudents }}</div>
          <span class="vits-chip ok">Enrolled</span>
        </div>
        <div class="vits-card">
          <div class="vits-muted">Rendered Hours</div>
          <div class="admin-kpi-value">{{ r.totalRenderedHours }}h</div>
          <span class="vits-chip info">{{ r.averageCompletionPct }}% avg completion</span>
        </div>
        <div class="vits-card">
          <div class="vits-muted">Pending Requests</div>
          <div class="admin-kpi-value">{{ r.pendingRequestsCount }}</div>
          <a class="vits-muted" routerLink="/requests">Review queue</a>
        </div>
        <div class="vits-card">
          <div class="vits-muted">Open Discrepancies</div>
          <div class="admin-kpi-value">{{ r.openDiscrepanciesCount }}</div>
          <a class="vits-muted" routerLink="/discrepancies">Open inbox</a>
        </div>
      </div>

      <div class="admin-grid-2">
        <div class="vits-card">
          <h2 class="vits-heading">Section Hours Compliance</h2>
          <p class="vits-muted">Rendered vs semester target hours by library section</p>
          @for (sec of r.sections; track sec.sectionId) {
            <div class="admin-chart-bar-row">
              <strong>{{ sec.sectionName }}</strong>
              <div class="admin-chart-track" role="progressbar" [attr.aria-valuenow]="sec.completionPct" aria-valuemin="0" aria-valuemax="100">
                <div class="admin-chart-fill" [style.width.%]="sec.completionPct"></div>
              </div>
              <span>{{ sec.completionPct }}%</span>
            </div>
          }
        </div>

        <div class="vits-card">
          <h2 class="vits-heading">Attendance Verification Breakdown</h2>
          <p class="vits-muted">QR-verified, pending sync, missed, and flagged shifts</p>
          <div class="vits-row" style="align-items: center;">
            <div class="vits-ring">
              <svg viewBox="0 0 36 36">
                <circle class="bg" cx="18" cy="18" r="15.9155"></circle>
                <circle class="fg" cx="18" cy="18" r="15.9155" [attr.stroke-dasharray]="verifiedPct(r) + ', 100'"></circle>
              </svg>
              <div class="label">{{ verifiedPct(r) }}%</div>
            </div>
            <div class="vits-stack" style="flex: 1;">
              <div class="vits-row"><span>Verified QR Scans</span><span class="vits-chip ok">{{ r.attendanceBreakdown.verified }}</span></div>
              <div class="vits-row"><span>Pending Sync</span><span class="vits-chip info">{{ r.attendanceBreakdown.pending }}</span></div>
              <div class="vits-row"><span>Missed Shifts</span><span class="vits-chip warn">{{ r.attendanceBreakdown.missed }}</span></div>
              <div class="vits-row"><span>Flagged Discrepancies</span><span class="vits-chip bad">{{ r.attendanceBreakdown.flagged }}</span></div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="admin-state-box">No compliance data available for this semester.</div>
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly report = signal<ComplianceReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(await this.api.getComplianceReport());
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  verifiedPct(r: ComplianceReportDto): number {
    const total =
      r.attendanceBreakdown.verified +
      r.attendanceBreakdown.pending +
      r.attendanceBreakdown.missed +
      r.attendanceBreakdown.flagged;
    return total ? Math.round((r.attendanceBreakdown.verified / total) * 100) : 0;
  }
}
