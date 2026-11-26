import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SectionDto, UserProfileDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-sections',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Library Sections</h1>
        <div class="vits-muted">Manage duty stations, floor locations, and assigned OICs</div>
      </div>
    </div>

    @if (feedback()) {
      <div class="vits-banner duty" role="status">{{ feedback() }}</div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading library sections...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else {
      <div class="vits-card">
        <h2 class="vits-heading">Add Library Section</h2>
        <form class="admin-toolbar" (ngSubmit)="createSection()" style="margin-bottom: 0;">
          <input class="admin-input" name="code" [(ngModel)]="code" placeholder="Code (e.g. REF-2F)" required />
          <input class="admin-input" name="name" [(ngModel)]="name" placeholder="Section Name" required />
          <input class="admin-input" name="location" [(ngModel)]="location" placeholder="Floor / Wing" required />
          <select class="admin-select" name="oicId" [(ngModel)]="oicUserId">
            <option value="">Unassigned OIC</option>
            @for (oic of oics(); track oic.id) {
              <option [value]="oic.id">{{ oic.fullName }}</option>
            }
          </select>
          <button type="submit" class="admin-btn">+ Add Section</button>
        </form>
      </div>

      @if (sections().length === 0) {
        <div class="admin-state-box">No library sections configured yet.</div>
      } @else {
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Section Name</th>
                <th>Location</th>
                <th>Assigned OIC</th>
                <th>Members</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (s of sections(); track s.id) {
                <tr>
                  <td><strong>{{ s.code }}</strong></td>
                  <td>{{ s.name }}</td>
                  <td>{{ s.location }}</td>
                  <td>{{ s.oicName }}</td>
                  <td>{{ s.memberCount }}</td>
                  <td><span class="vits-chip ok">{{ s.active ? 'Active' : 'Inactive' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class SectionsPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly sections = signal<SectionDto[]>([]);
  readonly oics = signal<UserProfileDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);

  code = '';
  name = '';
  location = '';
  oicUserId = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [secRes, usrRes] = await Promise.all([this.api.getSections(), this.api.getUsers()]);
      this.sections.set(secRes.sections);
      this.oics.set(usrRes.users.filter((u) => u.role === 'oic'));
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createSection(): Promise<void> {
    if (!this.code.trim() || !this.name.trim()) return;
    try {
      await this.api.createSection({
        code: this.code,
        name: this.name,
        location: this.location,
        oicUserId: this.oicUserId || null,
      });
      this.code = '';
      this.name = '';
      this.location = '';
      this.oicUserId = '';
      this.feedback.set('Library section added.');
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }
}
