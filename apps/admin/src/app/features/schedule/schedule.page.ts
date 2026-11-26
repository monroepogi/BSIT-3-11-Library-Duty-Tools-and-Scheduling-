import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  DayOfWeek,
  PublishScheduleResultDto,
  ScheduleTemplateDto,
  SectionDto,
} from '@vits/shared-types';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';

@Component({
  selector: 'vits-admin-schedule',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-title">Section Timetable & Publish</h1>
        <div class="vits-muted">Build weekly recurring shift templates and publish to student/OIC rosters</div>
      </div>
      <button type="button" class="admin-btn success" (click)="publish()" [disabled]="publishing() || templates().length === 0">
        {{ publishing() ? 'Publishing...' : 'Publish Semester Schedule' }}
      </button>
    </div>

    @if (publishResult(); as res) {
      <div class="vits-banner duty" role="status">
        Published {{ res.generatedShiftsCount }} shifts for semester {{ res.semesterId }} at {{ res.publishedAt }}.
      </div>
    }

    @if (loading()) {
      <div class="admin-state-box">Loading timetable templates...</div>
    } @else if (error()) {
      <div class="admin-state-box error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="admin-btn secondary sm" (click)="load()">Retry</button>
      </div>
    } @else {
      <div class="vits-card">
        <h2 class="vits-heading">Add Weekly Shift Slot</h2>
        <form class="admin-toolbar" (ngSubmit)="addSlot()" style="margin-bottom: 0;">
          <select class="admin-select" name="sectionId" [(ngModel)]="sectionId" required>
            @for (s of sections(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
          <select class="admin-select" name="day" [(ngModel)]="dayOfWeek">
            @for (d of days; track d) {
              <option [value]="d">{{ d }}</option>
            }
          </select>
          <input class="admin-input" type="time" name="start" [(ngModel)]="startTime" required />
          <input class="admin-input" type="time" name="end" [(ngModel)]="endTime" required />
          <input class="admin-input" type="number" name="slots" [(ngModel)]="slotsRequired" min="1" max="10" style="width: 84px;" />
          <button type="submit" class="admin-btn">+ Add Slot</button>
        </form>
      </div>

      <div class="admin-timetable">
        @for (day of days; track day) {
          <div class="admin-timetable-col">
            <strong>{{ day }}</strong>
            @for (slot of slotsForDay(day); track slot.id) {
              <div class="admin-slot-card">
                <div><strong>{{ slot.startTime }}–{{ slot.endTime }}</strong></div>
                <div class="vits-muted">{{ slot.sectionName }}</div>
                <div class="vits-muted">Slots: {{ slot.slotsRequired }}</div>
                <button
                  type="button"
                  class="admin-btn danger sm"
                  style="margin-top: 6px;"
                  (click)="removeSlot(slot.id)"
                >
                  Remove
                </button>
              </div>
            } @empty {
              <div class="vits-muted" style="margin-top: var(--vits-space-3);">No slots</div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class SchedulePage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  readonly days: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly templates = signal<ScheduleTemplateDto[]>([]);
  readonly sections = signal<SectionDto[]>([]);
  readonly loading = signal(true);
  readonly publishing = signal(false);
  readonly error = signal<string | null>(null);
  readonly publishResult = signal<PublishScheduleResultDto | null>(null);

  sectionId = '';
  dayOfWeek: DayOfWeek = 'Tue';
  startTime = '09:00';
  endTime = '13:00';
  slotsRequired = 2;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [tplRes, secRes] = await Promise.all([
        this.api.getScheduleTemplates(),
        this.api.getSections(),
      ]);
      this.templates.set(tplRes.templates);
      this.sections.set(secRes.sections);
      if (!this.sectionId && secRes.sections.length > 0) {
        this.sectionId = secRes.sections[0].id;
      }
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  slotsForDay(day: DayOfWeek): ScheduleTemplateDto[] {
    return this.templates().filter((t) => t.dayOfWeek === day);
  }

  async addSlot(): Promise<void> {
    if (!this.sectionId) return;
    try {
      await this.api.createScheduleTemplate({
        semesterId: 'sem-2026-1',
        sectionId: this.sectionId,
        dayOfWeek: this.dayOfWeek,
        startTime: this.startTime,
        endTime: this.endTime,
        slotsRequired: this.slotsRequired,
      });
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }

  async removeSlot(id: string): Promise<void> {
    try {
      await this.api.deleteScheduleTemplate(id);
      await this.load();
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    }
  }

  async publish(): Promise<void> {
    this.publishing.set(true);
    try {
      this.publishResult.set(await this.api.publishSchedule('sem-2026-1'));
    } catch (err) {
      this.error.set(this.auth.extractErrorMessage(err));
    } finally {
      this.publishing.set(false);
    }
  }
}
