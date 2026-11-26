import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import type { SyncBatchDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-sync-audit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Sync Batches Audit</h1>
        <div class="vits-muted">Inspect offline batches pushed from Student and OIC mobile devices</div>
      </div>
      <button type="button" class="admin-btn secondary sm" (click)="load()">Refresh</button>
    </div>

    @if (loading()) {
      <div class="admin-state-box">Loading sync batches...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (batches().length === 0) {
      <div class="admin-state-box">No sync batches recorded yet.</div>
    } @else {
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>User</th>
              <th>Device</th>
              <th>Received</th>
              <th>Applied</th>
              <th>Duplicate</th>
              <th>Rejected</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            @for (b of batches(); track b.id) {
              <tr>
                <td><strong>{{ b.id }}</strong></td>
                <td>{{ b.userName }} <span class="vits-chip info">{{ b.userRole }}</span></td>
                <td>{{ b.deviceId }}</td>
                <td>{{ b.receivedAt }}</td>
                <td><span class="vits-chip ok">{{ b.appliedCount }}</span></td>
                <td><span class="vits-chip warn">{{ b.duplicateCount }}</span></td>
                <td><span class="vits-chip" [class.bad]="b.rejectedCount > 0">{{ b.rejectedCount }}</span></td>
                <td>
                  <button type="button" class="admin-btn secondary sm" (click)="toggleExpand(b.id)">
                    {{ expandedId() === b.id ? 'Hide Ops' : 'Inspect Ops' }}
                  </button>
                </td>
              </tr>
              @if (expandedId() === b.id) {
                <tr>
                  <td colspan="8">
                    <div class="vits-stack">
                      @for (op of b.ops; track op.opId) {
                        <div class="vits-row">
                          <span><strong>{{ op.opId }}</strong> • {{ op.type }}</span>
                          <span>
                            <span
                              class="vits-chip"
                              [class.ok]="op.status === 'applied'"
                              [class.warn]="op.status === 'duplicate'"
                              [class.bad]="op.status === 'rejected'"
                            >
                              {{ op.status }}
                            </span>
                            @if (op.reason) {
                              <span class="vits-muted"> — {{ op.reason }}</span>
                            }
                          </span>
                        </div>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class SyncAuditPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly batches = signal<SyncBatchDto[]>([]);
  readonly expandedId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.getSyncBatches();
      this.batches.set(res.batches);
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }
}
