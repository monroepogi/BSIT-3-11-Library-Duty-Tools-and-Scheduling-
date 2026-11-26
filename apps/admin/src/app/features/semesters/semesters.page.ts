import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { HourCapDto, SemesterDto } from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-semesters',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Semesters & Hour Caps</h1>
        <div class="vits-muted">Configure academic terms and weekly/semester student duty hour caps</div>
      </div>
    </div>

    @if (feedback()) {
      <div class="vits-banner duty" role="status">{{ feedback() }}</div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading semesters and hour caps...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else {
      <div class="admin-grid-2">
        <div class="vits-card">
          <h2 class="vits-heading">Hour Caps Policy</h2>
          @if (hourCap(); as cap) {
            <form (ngSubmit)="saveCaps()">
              <div class="admin-field">
                <label for="weekly-cap">Weekly Max Hours</label>
                <input id="weekly-cap" class="admin-input" type="number" name="weeklyMax" [(ngModel)]="weeklyMaxHours" min="1" max="40" required />
              </div>
              <div class="admin-field">
                <label for="sem-req">Semester Required Hours</label>
                <input id="sem-req" class="admin-input" type="number" name="semReq" [(ngModel)]="semesterRequiredHours" min="1" max="200" required />
              </div>
              <div class="admin-field">
                <label for="sem-max">Semester Max Hours</label>
                <input id="sem-max" class="admin-input" type="number" name="semMax" [(ngModel)]="semesterMaxHours" min="1" max="250" required />
              </div>
              <button type="submit" class="admin-btn">Save Hour Caps</button>
              <div class="vits-muted" style="margin-top: var(--vits-space-2);">Last updated: {{ cap.updatedAt }}</div>
            </form>
          }
        </div>

        <div class="vits-card">
          <h2 class="vits-heading">Create Semester</h2>
          <form (ngSubmit)="createSemester()">
            <div class="admin-field">
              <label for="sem-name">Term Name</label>
              <input id="sem-name" class="admin-input" name="name" [(ngModel)]="newName" placeholder="2nd Semester AY 2026–2027" required />
            </div>
            <div class="admin-field">
              <label for="sem-start">Start Date</label>
              <input id="sem-start" class="admin-input" type="date" name="startDate" [(ngModel)]="newStart" required />
            </div>
            <div class="admin-field">
              <label for="sem-end">End Date</label>
              <input id="sem-end" class="admin-input" type="date" name="endDate" [(ngModel)]="newEnd" required />
            </div>
            <button type="submit" class="admin-btn">+ Add Semester</button>
          </form>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Semester</th>
              <th>Date Range</th>
              <th>Published Shifts</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (s of semesters(); track s.id) {
              <tr>
                <td><strong>{{ s.name }}</strong></td>
                <td>{{ s.startDate }} → {{ s.endDate }}</td>
                <td>{{ s.publishedShiftsCount }}</td>
                <td>
                  <span class="vits-chip" [class.ok]="s.isActive">{{ s.isActive ? 'Active' : 'Archived' }}</span>
                </td>
                <td>
                  @if (!s.isActive) {
                    <button type="button" class="admin-btn secondary sm" (click)="activate(s.id)">Set Active</button>
                  } @else {
                    <span class="vits-muted">Current term</span>
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
export class SemestersPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly semesters = signal<SemesterDto[]>([]);
  readonly hourCap = signal<HourCapDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);

  weeklyMaxHours = 10;
  semesterRequiredHours = 60;
  semesterMaxHours = 72;

  newName = '';
  newStart = '2027-01-11';
  newEnd = '2027-05-21';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [semRes, cap] = await Promise.all([this.api.getSemesters(), this.api.getHourCaps()]);
      this.semesters.set(semRes.semesters);
      this.hourCap.set(cap);
      this.weeklyMaxHours = cap.weeklyMaxHours;
      this.semesterRequiredHours = cap.semesterRequiredHours;
      this.semesterMaxHours = cap.semesterMaxHours;
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async saveCaps(): Promise<void> {
    try {
      const updated = await this.api.updateHourCaps({
        weeklyMaxHours: this.weeklyMaxHours,
        semesterRequiredHours: this.semesterRequiredHours,
        semesterMaxHours: this.semesterMaxHours,
      });
      this.hourCap.set(updated);
      this.feedback.set('Hour caps updated.');
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }

  async createSemester(): Promise<void> {
    if (!this.newName.trim()) return;
    try {
      await this.api.createSemester({
        name: this.newName,
        startDate: this.newStart,
        endDate: this.newEnd,
        isActive: false,
      });
      this.newName = '';
      this.feedback.set('Semester created.');
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }

  async activate(id: string): Promise<void> {
    try {
      await this.api.activateSemester(id);
      this.feedback.set('Active semester updated.');
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }
}
