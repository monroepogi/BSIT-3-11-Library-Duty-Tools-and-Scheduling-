import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import type { ComplianceReportDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Compliance Reports & Exports</h1>
        <div class="vits-muted">Export semester duty hours and audit compliance summaries as CSV or PDF</div>
      </div>
      <div class="vits-row">
        <button type="button" class="admin-btn secondary" (click)="exportFile('csv')" [disabled]="exporting() !== null || !report()">
          {{ exporting() === 'csv' ? 'Generating CSV...' : 'Export CSV' }}
        </button>
        <button type="button" class="admin-btn" (click)="exportFile('pdf')" [disabled]="exporting() !== null || !report()">
          {{ exporting() === 'pdf' ? 'Generating PDF...' : 'Export PDF' }}
        </button>
      </div>
    </div>

    @if (exportMessage()) {
      <div class="vits-banner duty" role="status">{{ exportMessage() }}</div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading compliance report...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (report(); as r) {
      <div class="vits-card">
        <strong>{{ r.semesterName }}</strong>
        <div class="vits-muted">
          Generated: {{ r.generatedAt }} • Total Students: {{ r.totalStudents }} • Total Rendered Hours: {{ r.totalRenderedHours }}h
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Library Section</th>
              <th>Active Students</th>
              <th>Rendered Hours</th>
              <th>Target Hours</th>
              <th>Completion</th>
              <th>Open Discrepancies</th>
            </tr>
          </thead>
          <tbody>
            @for (sec of r.sections; track sec.sectionId) {
              <tr>
                <td><strong>{{ sec.sectionName }}</strong></td>
                <td>{{ sec.activeStudents }}</td>
                <td>{{ sec.renderedHours }}h</td>
                <td>{{ sec.targetHours }}h</td>
                <td><span class="vits-chip info">{{ sec.completionPct }}%</span></td>
                <td>
                  <span class="vits-chip" [class.ok]="sec.openDiscrepancies === 0" [class.bad]="sec.openDiscrepancies > 0">
                    {{ sec.openDiscrepancies }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="admin-state-box">No report data available.</div>
    }
  `,
})
export class ReportsPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly report = signal<ComplianceReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly exporting = signal<'csv' | 'pdf' | null>(null);
  readonly exportMessage = signal<string | null>(null);

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

  async exportFile(format: 'csv' | 'pdf'): Promise<void> {
    const r = this.report();
    if (!r) return;
    this.exporting.set(format);
    this.exportMessage.set(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const fileName = `vits-compliance-${r.semesterId}.${format}`;
      const csvBody = [
        'section_id,section_name,active_students,rendered_hours,target_hours,completion_pct,open_discrepancies',
        ...r.sections.map(
          (s) =>
            `${s.sectionId},"${s.sectionName}",${s.activeStudents},${s.renderedHours},${s.targetHours},${s.completionPct},${s.openDiscrepancies}`,
        ),
      ].join('\n');
      const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf';
      const blob = new Blob([format === 'csv' ? csvBody : `%PDF-1.4\n% Mock VITS Compliance Report\n${csvBody}`], {
        type: mime,
      });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(href);
      }
      this.exportMessage.set(`Mock ${format.toUpperCase()} export generated (${fileName}).`);
    } finally {
      this.exporting.set(null);
    }
  }
}
