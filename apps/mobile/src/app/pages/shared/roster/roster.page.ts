import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { getLibraryDateString } from '@vits/shared-types';
import { AuthService } from '../../../core/auth.service';
import { ShiftsRepository } from '../../../core/db/repositories';
import { SyncService } from '../../../core/sync/sync.service';

interface DayTab {
  label: string;
  dateStr: string;
  dayNum: string;
}

@Component({
  selector: 'app-roster',
  templateUrl: './roster.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonIcon],
})
export class RosterPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly shiftsRepo = inject(ShiftsRepository);
  private readonly sync = inject(SyncService);
  private readonly nav = inject(NavController);

  readonly days: DayTab[] = [-2, -1, 0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    const dateStr = getLibraryDateString(d, 'Asia/Manila');
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
    }).format(d);
    return { label, dateStr, dayNum: dateStr.slice(8, 10) };
  });

  readonly selectedDate = signal(getLibraryDateString(new Date(), 'Asia/Manila'));

  readonly visibleShifts = computed(() => {
    const user = this.auth.currentUser();
    const all = this.shiftsRepo.shifts();
    return this.auth.role() === 'OIC' ? all : all.filter((s) => s.userId === user?.id);
  });

  readonly dayShifts = computed(() =>
    this.visibleShifts().filter((s) => s.shiftDate === this.selectedDate()),
  );

  ngOnInit(): void {
    void this.auth.ensureInitialized();
  }

  ionViewWillEnter(): void {
    void this.sync.syncNow().catch(() => undefined);
  }

  hasShift(dateStr: string): boolean {
    return this.visibleShifts().some((s) => s.shiftDate === dateStr);
  }

  timeLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  chip(status: string): string {
    return status === 'completed'
      ? 'ok'
      : status === 'missed'
        ? 'bad'
        : status === 'in_progress'
          ? 'warn'
          : 'info';
  }

  open(id: string): void {
    void this.nav.navigateForward('/shift/' + id);
  }
}
