import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, NavController } from '@ionic/angular';
import { Shift } from '../../../attributes/shift';
import { LibraryDatabaseService } from '../../../services/database/library-database.service';
import { SessionService } from '../../../services/session/session';

@Component({
  selector: 'app-roster',
  templateUrl: './roster.page.html',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonIcon],
})
export class RosterPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly db = inject(LibraryDatabaseService);
  private readonly nav = inject(NavController);
  private readonly cdr = inject(ChangeDetectorRef);

  days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dates: Record<string, string> = {
    Mon: '26',
    Tue: '27',
    Wed: '28',
    Thu: '29',
    Fri: '30',
    Sat: '31',
    Sun: '1',
  };
  selectedDay = 'Wed';
  shifts: Shift[] = [];

  ngOnInit() {
    this.load();
  }
  ionViewWillEnter() {
    this.load();
  }

  async load() {
    const all = await this.db.getShifts();
    // OIC sees the whole section, student sees only own shifts
    this.shifts =
      this.session.role === 'OIC' ? all : all.filter((s) => s.student === this.session.userName);
    this.cdr.detectChanges();
  }

  hasShift(day: string): boolean {
    return this.shifts.some((s) => s.day === day);
  }
  get dayShifts(): Shift[] {
    return this.shifts.filter((s) => s.day === this.selectedDay);
  }

  chip(status: string): string {
    return status === 'Completed' ? 'ok' : status === 'Missed' ? 'bad' : 'info';
  }

  open(id: number) {
    this.nav.navigateForward('/shift/' + id);
  }
}
