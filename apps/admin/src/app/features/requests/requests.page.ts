import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { LeaveRequestDto, SwapRequestDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

interface UnifiedRequestRow {
  id: string;
  kind: 'swap' | 'leave';
  requesterName: string;
  sectionName: string;
  detail: string;
  reason: string;
  status: string;
  endorsedBy: string | null;
}

@Component({
  selector: 'vits-admin-requests',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Request Approval Queue</h1>
        <div class="vits-muted">Final admin approval or rejection of OIC-endorsed swap and leave requests</div>
      </div>
      <div class="vits-row">
        <select class="admin-select" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
          <option value="all">All statuses</option>
          <option value="endorsed">Endorsed (Ready for Decision)</option>
          <option value="pending_endorsement">Pending OIC Endorsement</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Refresh</button>
      </div>
    </div>

    @if (feedback()) {
      <div class="vits-banner duty" role="status">{{ feedback() }}</div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading request queue...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else if (rows().length === 0) {
      <div class="admin-state-box">No requests match this status filter.</div>
    } @else {
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Requester</th>
              <th>Section</th>
              <th>Shift / Dates</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td><span class="vits-chip info">{{ r.kind }}</span></td>
                <td><strong>{{ r.requesterName }}</strong></td>
                <td>{{ r.sectionName }}</td>
                <td>{{ r.detail }}</td>
                <td>{{ r.reason }}</td>
                <td>
                  <span
                    class="vits-chip"
                    [class.ok]="r.status === 'approved'"
                    [class.bad]="r.status === 'rejected'"
                    [class.info]="r.status === 'endorsed'"
                    [class.warn]="r.status === 'pending_endorsement'"
                  >
                    {{ r.status }}
                  </span>
                </td>
                <td>
                  @if (r.status === 'endorsed') {
                    <div class="vits-row" style="justify-content: flex-start;">
                      <button type="button" class="admin-btn success sm" (click)="decide(r, 'approved')">Approve</button>
                      <button type="button" class="admin-btn danger sm" (click)="decide(r, 'rejected')">Reject</button>
                    </div>
                  } @else if (r.status === 'pending_endorsement') {
                    <span class="vits-muted">Awaiting OIC</span>
                  } @else {
                    <span class="vits-muted">Finalized</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class RequestsPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  private readonly swaps = signal<SwapRequestDto[]>([]);
  private readonly leaves = signal<LeaveRequestDto[]>([]);
  readonly statusFilter = signal('all');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);

  readonly rows = computed<UnifiedRequestRow[]>(() => {
    const filter = this.statusFilter();
    const mappedSwaps: UnifiedRequestRow[] = this.swaps().map((s) => ({
      id: s.id,
      kind: 'swap',
      requesterName: s.requesterName,
      sectionName: s.sectionName,
      detail: `${s.requesterShiftLabel} ↔ ${s.targetUserName}`,
      reason: s.reason,
      status: s.status,
      endorsedBy: s.endorsedBy,
    }));
    const mappedLeaves: UnifiedRequestRow[] = this.leaves().map((l) => ({
      id: l.id,
      kind: 'leave',
      requesterName: l.requesterName,
      sectionName: l.sectionName,
      detail: `${l.leaveType}: ${l.shiftLabel}`,
      reason: l.reason,
      status: l.status,
      endorsedBy: l.endorsedBy,
    }));
    const all = [...mappedSwaps, ...mappedLeaves];
    return filter === 'all' ? all : all.filter((r) => r.status === filter);
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.getRequests();
      this.swaps.set(res.swapRequests);
      this.leaves.set(res.leaveRequests);
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async decide(row: UnifiedRequestRow, decision: 'approved' | 'rejected'): Promise<void> {
    try {
      await this.api.decideRequest(row.id, {
        requestKind: row.kind,
        decision,
        remarks: decision === 'approved' ? 'Approved by Admin.' : 'Rejected by Admin.',
      });
      this.feedback.set(`Request ${row.id} marked ${decision}.`);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }
}
